import { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'
import { env } from '../config/env'
import { User } from '../models/User'

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

/**
 * Routes accessibles sans token JWT.
 * Pattern: [method, path-prefix]
 */
const PUBLIC_ROUTES: [string, RegExp][] = [
  ['GET', /^\/api\/health/],
  ['GET', /^\/api\/invitations\/[^/]+$/], // GET /api/invitations/:token
]

export interface AuthRequest extends Request {
  user?: {
    supabaseId: string
    email: string
    isAdmin: boolean
  }
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Bypass auth for explicitly public routes
  const isPublic = PUBLIC_ROUTES.some(
    ([method, pattern]) => req.method === method && pattern.test(req.path)
  )
  if (isPublic) {
    next()
    return
  }

  const authHeader = req.headers.authorization

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing authorization token', code: 'UNAUTHORIZED' })
    return
  }

  const token = authHeader.split(' ')[1]

  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token)

    if (error || !user) {
      res.status(401).json({ error: 'Invalid or expired token', code: 'UNAUTHORIZED' })
      return
    }

    const dbUser = await User.findOne({ supabaseId: user.id }).lean()

    if (dbUser && !dbUser.isActive) {
      res.status(403).json({ error: 'Account has been deactivated', code: 'FORBIDDEN' })
      return
    }

    req.user = {
      supabaseId: user.id,
      email: user.email!,
      isAdmin: dbUser?.isAdmin ?? false,
    }

    next()
  } catch (error) {
    console.error('[authMiddleware] Error:', error)
    res.status(401).json({ error: 'Token verification failed', code: 'UNAUTHORIZED' })
  }
}
