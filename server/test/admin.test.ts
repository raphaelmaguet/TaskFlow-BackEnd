/**
 * Tests d'intégration — routes /api/admin/users
 * Utilise MongoMemoryServer pour une base de données embarquée en mémoire.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import supertest from 'supertest'
import { User } from '../models/User'
import {
  startTestDB,
  stopTestDB,
  clearTestDB,
  createTestApp,
  ADMIN_USER,
  MEMBER_USER,
} from './helpers'

// ── Setup DB (une seule instance pour tout le fichier) ────────────────────────

beforeAll(startTestDB)
afterAll(stopTestDB)
beforeEach(clearTestDB)

// ── Apps ──────────────────────────────────────────────────────────────────────

const adminApp = createTestApp(ADMIN_USER)
const memberApp = createTestApp(MEMBER_USER)

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createUser(overrides: Record<string, unknown> = {}) {
  return User.create({
    supabaseId: `uid-${Math.random().toString(36).slice(2)}`,
    email: `user-${Math.random().toString(36).slice(2)}@test.com`,
    name: 'Test User',
    isActive: true,
    isAdmin: false,
    subscriptionTier: 'free',
    ...overrides,
  })
}

// ── GET /api/admin/users ──────────────────────────────────────────────────────

describe('GET /api/admin/users', () => {
  it('retourne une liste vide quand aucun utilisateur', async () => {
    const res = await supertest(adminApp).get('/api/admin/users')
    expect(res.status).toBe(200)
    expect(res.body.users).toHaveLength(0)
    expect(res.body.total).toBe(0)
    expect(res.body.page).toBe(1)
    expect(res.body.pages).toBe(0)
  })

  it('retourne les utilisateurs créés en base', async () => {
    await createUser({ name: 'Alice', email: 'alice@test.com', supabaseId: 'uid-alice' })
    await createUser({ name: 'Bob', email: 'bob@test.com', supabaseId: 'uid-bob' })

    const res = await supertest(adminApp).get('/api/admin/users')
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(2)
    expect(res.body.users).toHaveLength(2)
  })

  it('sérialise les champs attendus dans chaque user', async () => {
    await createUser({ name: 'Charlie', email: 'charlie@test.com', supabaseId: 'uid-charlie' })
    const res = await supertest(adminApp).get('/api/admin/users')
    const user = res.body.users[0]
    expect(user.id).toBeDefined()
    expect(user.email).toBe('charlie@test.com')
    expect(user.name).toBe('Charlie')
    expect(typeof user.isActive).toBe('boolean')
    expect(typeof user.isAdmin).toBe('boolean')
    expect(user.subscriptionTier).toBeDefined()
    // _id ne doit PAS être exposé directement
    expect(user._id).toBeUndefined()
  })

  it('filtre par nom (insensible à la casse)', async () => {
    await createUser({ name: 'Alice Martin', supabaseId: 'uid-a', email: 'alice@t.com' })
    await createUser({ name: 'Bob Dupont', supabaseId: 'uid-b', email: 'bob@t.com' })

    const res = await supertest(adminApp).get('/api/admin/users?q=alice')
    expect(res.status).toBe(200)
    expect(res.body.total).toBe(1)
    expect(res.body.users[0].name).toBe('Alice Martin')
  })

  it('filtre par email', async () => {
    await createUser({ name: 'Dev', supabaseId: 'uid-dev', email: 'dev@company.com' })
    await createUser({ name: 'User', supabaseId: 'uid-usr', email: 'user@example.com' })

    const res = await supertest(adminApp).get('/api/admin/users?q=company')
    expect(res.body.total).toBe(1)
    expect(res.body.users[0].email).toBe('dev@company.com')
  })

  it('pagine correctement (limit=1)', async () => {
    await createUser({ supabaseId: 'p1', email: 'p1@t.com' })
    await createUser({ supabaseId: 'p2', email: 'p2@t.com' })
    await createUser({ supabaseId: 'p3', email: 'p3@t.com' })

    const res = await supertest(adminApp).get('/api/admin/users?limit=1&page=1')
    expect(res.status).toBe(200)
    expect(res.body.users).toHaveLength(1)
    expect(res.body.total).toBe(3)
    expect(res.body.pages).toBe(3)
    expect(res.body.page).toBe(1)
  })

  it('refuse un utilisateur non-admin (403)', async () => {
    const res = await supertest(memberApp).get('/api/admin/users')
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN')
  })
})

// ── PATCH /api/admin/users/:id ────────────────────────────────────────────────

describe('PATCH /api/admin/users/:id', () => {
  it('désactive un utilisateur (isActive → false)', async () => {
    const user = await createUser({ name: 'Target', supabaseId: 'uid-target', email: 'target@t.com' })
    const id = (user._id as { toString(): string }).toString()

    const res = await supertest(adminApp).patch(`/api/admin/users/${id}`).send({ isActive: false })
    expect(res.status).toBe(200)
    expect(res.body.isActive).toBe(false)

    // Vérifier en base
    const updated = await User.findById(id).lean()
    expect(updated?.isActive).toBe(false)
  })

  it('accorde le rôle admin à un utilisateur', async () => {
    const user = await createUser({ supabaseId: 'uid-promo', email: 'promo@t.com' })
    const id = (user._id as { toString(): string }).toString()

    const res = await supertest(adminApp).patch(`/api/admin/users/${id}`).send({ isAdmin: true })
    expect(res.status).toBe(200)
    expect(res.body.isAdmin).toBe(true)
  })

  it('change le plan de free à pro', async () => {
    const user = await createUser({ supabaseId: 'uid-plan', email: 'plan@t.com', subscriptionTier: 'free' })
    const id = (user._id as { toString(): string }).toString()

    const res = await supertest(adminApp).patch(`/api/admin/users/${id}`).send({ subscriptionTier: 'pro' })
    expect(res.status).toBe(200)
    expect(res.body.subscriptionTier).toBe('pro')
  })

  it('refuse de retirer son propre rôle admin', async () => {
    // Créer l'utilisateur admin avec le même supabaseId que ADMIN_USER
    const self = await createUser({
      supabaseId: ADMIN_USER.supabaseId, // même supabaseId que req.user injecté
      email: 'admin-self@t.com',
      isAdmin: true,
    })
    const id = (self._id as { toString(): string }).toString()

    const res = await supertest(adminApp).patch(`/api/admin/users/${id}`).send({ isAdmin: false })
    expect(res.status).toBe(403)
    expect(res.body.code).toBe('FORBIDDEN')
  })

  it('retourne 404 pour un ID inexistant', async () => {
    const fakeId = '000000000000000000000000'
    const res = await supertest(adminApp).patch(`/api/admin/users/${fakeId}`).send({ isActive: false })
    expect(res.status).toBe(404)
    expect(res.body.code).toBe('NOT_FOUND')
  })

  it('retourne 404 pour un ID invalide (non-ObjectId)', async () => {
    const res = await supertest(adminApp).patch('/api/admin/users/not-an-id').send({ isActive: false })
    expect(res.status).toBe(404)
  })

  it('retourne 400 pour un body invalide (subscriptionTier inconnu)', async () => {
    const user = await createUser({ supabaseId: 'uid-bad', email: 'bad@t.com' })
    const id = (user._id as { toString(): string }).toString()

    const res = await supertest(adminApp).patch(`/api/admin/users/${id}`).send({ subscriptionTier: 'enterprise' })
    expect(res.status).toBe(400)
    expect(res.body.code).toBe('VALIDATION_ERROR')
  })

  it('refuse un non-admin (403)', async () => {
    const user = await createUser({ supabaseId: 'uid-member-target', email: 'mt@t.com' })
    const id = (user._id as { toString(): string }).toString()

    const res = await supertest(memberApp).patch(`/api/admin/users/${id}`).send({ isActive: false })
    expect(res.status).toBe(403)
  })
})
