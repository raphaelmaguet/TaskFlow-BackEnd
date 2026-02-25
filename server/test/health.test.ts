/**
 * Tests d'intégration — GET /api/health
 * Vérifie que l'endpoint de santé répond correctement (route publique, pas d'auth).
 */
import { describe, it, expect } from 'vitest'
import supertest from 'supertest'
import { createTestApp } from './helpers'

// L'app de test n'a pas besoin de DB pour /api/health
const app = createTestApp()

describe('GET /api/health', () => {
  it('répond 200 avec status ok', async () => {
    const res = await supertest(app).get('/api/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })

  it('inclut un timestamp ISO 8601 valide', async () => {
    const res = await supertest(app).get('/api/health')
    expect(res.body.timestamp).toBeDefined()
    expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp)
  })
})
