/**
 * Tests unitaires légers de l'authMiddleware — chemins SANS appel réseau Appwrite.
 * (La validation d'un vrai JWT Appwrite est vérifiée end-to-end manuellement, cf. AC11.)
 */
import { describe, it, expect, vi } from 'vitest'
import type { Response, NextFunction } from 'express'
import { authMiddleware, type AuthRequest } from '../middleware/auth'

function mockRes() {
  const res = {} as Response & { statusCode?: number; body?: unknown }
  res.status = vi.fn().mockImplementation((code: number) => {
    res.statusCode = code
    return res
  }) as unknown as Response['status']
  res.json = vi.fn().mockImplementation((payload: unknown) => {
    res.body = payload
    return res
  }) as unknown as Response['json']
  return res
}

describe('authMiddleware — chemins sans réseau', () => {
  it('laisse passer une route publique sans token (GET /api/health)', async () => {
    const req = { method: 'GET', path: '/api/health', headers: {} } as AuthRequest
    const res = mockRes()
    const next = vi.fn() as unknown as NextFunction

    await authMiddleware(req, res, next)

    expect(next).toHaveBeenCalledOnce()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('répond 401 UNAUTHORIZED si aucun header Authorization', async () => {
    const req = { method: 'GET', path: '/api/boards', headers: {} } as AuthRequest
    const res = mockRes() as Response & { statusCode?: number; body?: { code?: string } }
    const next = vi.fn() as unknown as NextFunction

    await authMiddleware(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
    expect(res.body?.code).toBe('UNAUTHORIZED')
  })

  it('répond 401 si le header n\'est pas un Bearer token', async () => {
    const req = {
      method: 'GET',
      path: '/api/boards',
      headers: { authorization: 'Basic abc123' },
    } as AuthRequest
    const res = mockRes() as Response & { statusCode?: number; body?: { code?: string } }
    const next = vi.fn() as unknown as NextFunction

    await authMiddleware(req, res, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(401)
    expect(res.body?.code).toBe('UNAUTHORIZED')
  })
})
