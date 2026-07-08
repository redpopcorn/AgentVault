import { Request, Response, NextFunction } from 'express'
import { verifyAccessToken } from '@utils/jwt'
import { redisClient } from '@config/redis'

export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Authorization header missing or malformed' })
    return
  }

  const token = authHeader.split(' ')[1]

  if (!token) {
    res.status(401).json({ message: 'Authorization header missing or malformed' })
    return
  }

  try {
    const payload = verifyAccessToken(token)

    const blacklisted = await redisClient.get(`blacklist:${token}`)
    if (blacklisted) {
      res.status(401).json({ message: 'Token has been revoked' })
      return
    }

    req.user = payload
    next()
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' })
  }
}