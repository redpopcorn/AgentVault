import jwt from 'jsonwebtoken'
import { env } from '@config/env'

export interface JwtPayload {
  userId: number
  tenantId: number
  role: 'admin' | 'member' | 'viewer'
}

export const generateAccessToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, env.jwtAccessSecret, { expiresIn: '15m' })
}

export const generateRefreshToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, env.jwtRefreshSecret, { expiresIn: '7d' })
}

export const verifyAccessToken = (token: string): JwtPayload => {
  return jwt.verify(token, env.jwtAccessSecret) as JwtPayload
}

export const verifyRefreshToken = (token: string): JwtPayload => {
  return jwt.verify(token, env.jwtRefreshSecret) as JwtPayload
}