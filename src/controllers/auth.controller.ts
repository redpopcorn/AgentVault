import { Request, Response } from 'express'
import { findUserByEmail, createUser, findTenantMember } from '@db/queries/user.queries'
import { hashPassword, comparePassword } from '@utils/hash'
import { generateAccessToken, generateRefreshToken } from '@utils/jwt'
import { redisClient } from '@config/redis'

export const signup = async (req: Request, res: Response): Promise<void> => {
  const { username, email, password, tenantName } = req.body

  if (!username || !email || !password || !tenantName) {
    res.status(400).json({ message: 'Missing required fields' })
    return
  }

  const existingUser = await findUserByEmail(email)
  if (existingUser) {
    res.status(409).json({ message: 'Email already exists' })
    return
  }

  try {
    const passwordHash = await hashPassword(password)
    const { user, tenantId } = await createUser(username, email, passwordHash, tenantName)

    const payload = {
      userId: user.id,
      tenantId,
      role: 'admin' as const
    }

    const accessToken = generateAccessToken(payload)
    const refreshToken = generateRefreshToken(payload)

    await redisClient.set(`refresh:${user.id}`, refreshToken, { EX: 60 * 60 * 24 * 7 })

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      },
      accessToken,
      refreshToken
    })
  } catch {
    res.status(500).json({ message: 'Internal server error' })
  }
}

export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body

  // Step 1: Validate input
  if (!email || !password) {
    res.status(400).json({ message: 'Missing required fields' })
    return
  }

  try {
    // Step 2: Find user by email
    const user = await findUserByEmail(email)
    if (!user) {
      res.status(401).json({ message: 'Invalid email or password' })
      return
    }

    // Step 3: Password check
    const isPasswordValid = await comparePassword(password, user.password_hash)
    if (!isPasswordValid) {
      res.status(401).json({ message: 'Invalid email or password' })
      return
    }

    // Step 4: Find tenant membership
    const membership = await findTenantMember(user.id)
    if (!membership) {
      res.status(403).json({ message: 'User does not belong to any workspace' })
      return
    }

    // Step 5: Build JWT payload
    const payload = {
      userId: user.id,
      tenantId: membership.tenant_id,
      role: membership.role
    }

    // Step 6: Generate access + refresh tokens
    const accessToken = generateAccessToken(payload)
    const refreshToken = generateRefreshToken(payload)

    // Step 7: Store refresh token in Redis (7 days TTL)
    await redisClient.set(`refresh:${user.id}`, refreshToken, { EX: 60 * 60 * 24 * 7 })

    // Step 8: Return response
    res.status(200).json({
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      },
      accessToken,
      refreshToken
    })
  } catch {
    res.status(500).json({ message: 'Internal server error' })
  }
}