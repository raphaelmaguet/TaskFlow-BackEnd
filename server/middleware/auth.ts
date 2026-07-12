import { Request, Response, NextFunction } from 'express'
import { Client, Account } from 'node-appwrite'
import { env } from '../config/env'
import { User } from '../models/User'

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
    authId: string
    email: string
    isAdmin: boolean
  }
}

/**
 * Cache mémoire court des validations de token (AC4).
 * Appwrite n'expose pas de JWKS : chaque validation = un appel réseau (`account.get()`).
 * On amortit ce coût en mémorisant le résultat par token pendant un TTL court.
 * ⚠️ Le TTL court borne volontairement la fenêtre pendant laquelle un compte
 *     désactivé entre-temps resterait accepté (au plus AUTH_CACHE_TTL_MS).
 */
const AUTH_CACHE_TTL_MS = 3 * 60 * 1000 // 3 min
const MAX_CACHE_ENTRIES = 5000

type CachedUser = { authId: string; email: string; isAdmin: boolean }
const authCache = new Map<string, { value: CachedUser; expiresAt: number }>()

function getCached(token: string): CachedUser | null {
  const hit = authCache.get(token)
  if (!hit) return null
  if (hit.expiresAt <= Date.now()) {
    authCache.delete(token)
    return null
  }
  return hit.value
}

function setCached(token: string, value: CachedUser): void {
  // Purge paresseuse des entrées expirées si le cache grossit trop (les JWT tournent
  // toutes les ~15 min, donc de vieux tokens s'accumuleraient sinon).
  if (authCache.size >= MAX_CACHE_ENTRIES) {
    const now = Date.now()
    for (const [key, entry] of authCache) {
      if (entry.expiresAt <= now) authCache.delete(key)
    }
  }
  authCache.set(token, { value, expiresAt: Date.now() + AUTH_CACHE_TTL_MS })
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

  // Fast-path : validation déjà en cache
  const cached = getCached(token)
  if (cached) {
    req.user = cached
    next()
    return
  }

  try {
    // Client jetable, propre à cette requête (ne jamais partager un Client porteur de JWT).
    const client = new Client()
      .setEndpoint(env.APPWRITE_ENDPOINT)
      .setProject(env.APPWRITE_PROJECT_ID)
      .setJWT(token)

    const account = await new Account(client).get() // throw si JWT invalide/expiré

    const authId = account.$id
    const email = account.email

    const dbUser = await User.findOne({ authId }).lean()

    if (dbUser && !dbUser.isActive) {
      res.status(403).json({ error: 'Account has been deactivated', code: 'FORBIDDEN' })
      return
    }

    const user: CachedUser = {
      authId,
      email,
      isAdmin: dbUser?.isAdmin ?? false,
    }

    setCached(token, user)
    req.user = user

    next()
  } catch (error) {
    console.error('[authMiddleware] Error:', error)
    res.status(401).json({ error: 'Invalid or expired token', code: 'UNAUTHORIZED' })
  }
}
