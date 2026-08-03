import { Request, Response, NextFunction } from 'express'
import { Role } from '@utils/jwt'


const roleRank:Record<Role,number>={
    admin:3,
    member:2,
    viewer:1
}
export const authorize = (requiredRole: Role) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }

    if (roleRank[req.user.role] < roleRank[requiredRole]) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }

    next()
  }
}