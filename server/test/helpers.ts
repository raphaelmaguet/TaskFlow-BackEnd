/**
 * Helpers partagés pour les tests backend.
 * - MongoMemoryServer : DB embarquée en mémoire (pas besoin de MongoDB installé)
 * - createTestApp() : Express minimal avec auth mockée (req.user injecté directement)
 */
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import express from 'express'
import type { AuthRequest } from '../middleware/auth'
import { isAdmin } from '../middleware/isAdmin'
import { errorHandler } from '../middleware/errorHandler'
import healthRouter from '../routes/health'
import adminRouter from '../routes/admin'

// ── DB lifecycle ──────────────────────────────────────────────────────────────

let mongod: MongoMemoryServer

export async function startTestDB(): Promise<void> {
  mongod = await MongoMemoryServer.create()
  const uri = mongod.getUri()
  await mongoose.connect(uri)
}

export async function stopTestDB(): Promise<void> {
  await mongoose.disconnect()
  await mongod?.stop()
}

export async function clearTestDB(): Promise<void> {
  const collections = mongoose.connection.collections
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({})
  }
}

// ── Test user presets ─────────────────────────────────────────────────────────

export interface TestUser {
  authId: string
  email: string
  isAdmin: boolean
}

export const ADMIN_USER: TestUser = {
  authId: 'admin-auth-id',
  email: 'admin@test.com',
  isAdmin: true,
}

export const MEMBER_USER: TestUser = {
  authId: 'member-auth-id',
  email: 'member@test.com',
  isAdmin: false,
}

// ── App factory ───────────────────────────────────────────────────────────────

/**
 * Crée une application Express minimale sans démarrer le serveur HTTP.
 * L'authMiddleware Appwrite est remplacé par une injection directe de req.user.
 */
export function createTestApp(user: TestUser = MEMBER_USER) {
  const app = express()
  app.use(express.json())

  // Mock auth : injecter l'utilisateur directement (bypass Appwrite)
  app.use((req: AuthRequest, _res, next) => {
    req.user = user
    next()
  })

  // Routes
  app.use('/api', healthRouter)          // GET /api/health — public (ne nécessite pas isAdmin)
  app.use('/api/admin', adminRouter)     // isAdmin appliqué à l'intérieur du router

  app.use(errorHandler)
  return app
}
