import { Response, NextFunction } from 'express'
import { AuthRequest } from './auth'

export function isAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user?.isAdmin) {
    res.status(403).json({ error: 'Admin access required', code: 'FORBIDDEN' })
    return
  }
  next()
}
