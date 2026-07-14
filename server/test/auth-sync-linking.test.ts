/**
 * Tests — logique de liaison de compte de POST /api/auth/sync.
 * Vérifie que l'upsert par `{ $or: [{ authId }, { email }] }` réassocie un
 * compte existant (même email, provider différent) au lieu de créer un
 * doublon — cas rencontré quand un utilisateur se connecte via Apple après
 * s'être déjà connecté via Google avec le même email vérifié.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startTestDB, stopTestDB, clearTestDB } from './helpers'
import { User } from '../models/User'

beforeAll(startTestDB)
afterAll(stopTestDB)
beforeEach(clearTestDB)

// Reproduit exactement l'upsert de routes/auth.ts (sans la partie Appwrite/réseau).
async function syncUpsert(authId: string, email: string) {
  return User.findOneAndUpdate(
    { $or: [{ authId }, { email }] },
    {
      $set: { authId },
      $setOnInsert: {
        email,
        name: email.split('@')[0],
        subscriptionTier: 'free',
        isActive: true,
        isAdmin: false,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean()
}

describe('auth/sync — liaison de compte par email', () => {
  it('crée un utilisateur à la première connexion', async () => {
    const user = await syncUpsert('google-auth-1', 'raf@example.com')
    expect(user?.authId).toBe('google-auth-1')
    expect(user?.email).toBe('raf@example.com')
    expect(await User.countDocuments({})).toBe(1)
  })

  it('réassocie le même compte quand un autre provider renvoie le même email vérifié', async () => {
    await syncUpsert('google-auth-1', 'raf@example.com')

    const linked = await syncUpsert('apple-auth-2', 'raf@example.com')

    expect(linked?.authId).toBe('apple-auth-2')
    expect(await User.countDocuments({})).toBe(1) // pas de doublon
    expect(await User.findOne({ authId: 'google-auth-1' })).toBeNull() // ancien authId remplacé
  })

  it('ne réinitialise pas name/isAdmin lors d\'une réassociation', async () => {
    await syncUpsert('google-auth-1', 'raf@example.com')
    await User.updateOne({ authId: 'google-auth-1' }, { $set: { name: 'Raf Custom', isAdmin: true } })

    const linked = await syncUpsert('apple-auth-2', 'raf@example.com')

    expect(linked?.name).toBe('Raf Custom')
    expect(linked?.isAdmin).toBe(true)
  })

  it('resynchroniser le même authId ne crée pas de doublon', async () => {
    await syncUpsert('google-auth-1', 'raf@example.com')
    await syncUpsert('google-auth-1', 'raf@example.com')
    expect(await User.countDocuments({})).toBe(1)
  })
})
