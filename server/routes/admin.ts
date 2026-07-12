/**
 * Routes d'administration — protégées par isAdmin middleware.
 * GET  /api/admin/users            — liste paginée + recherche
 * PATCH /api/admin/users/:id       — modifier isActive / isAdmin / subscriptionTier
 */
import { Router, Response } from 'express'
import { z } from 'zod'
import mongoose from 'mongoose'
import { AuthRequest } from '../middleware/auth'
import { isAdmin } from '../middleware/isAdmin'
import { User } from '../models/User'

const router = Router()

// Appliquer le guard admin sur toutes les routes de ce fichier
router.use(isAdmin)

// ── Sérialisation ─────────────────────────────────────────────────────────────

function toUserDTO(user: {
  _id: mongoose.Types.ObjectId
  authId: string
  email: string
  name: string
  avatarUrl?: string
  subscriptionTier: string
  isActive: boolean
  isAdmin: boolean
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: user._id.toString(),
    authId: user.authId,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatarUrl,
    subscriptionTier: user.subscriptionTier,
    isActive: user.isActive,
    isAdmin: user.isAdmin,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}

/**
 * GET /api/admin/users
 * Query params :
 *   - q      : recherche dans name / email (insensible à la casse)
 *   - page   : numéro de page (défaut 1)
 *   - limit  : taille de page (défaut 20, max 100)
 */
const ListUsersSchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

router.get('/users', async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = ListUsersSchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid query params', code: 'VALIDATION_ERROR', details: parsed.error.flatten() })
    return
  }

  const { q, page, limit } = parsed.data
  const skip = (page - 1) * limit

  const filter: Record<string, unknown> = {}
  if (q && q.trim()) {
    const regex = new RegExp(q.trim(), 'i')
    filter['$or'] = [{ name: regex }, { email: regex }]
  }

  try {
    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      User.countDocuments(filter),
    ])

    res.json({
      users: users.map(toUserDTO),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error('[GET /admin/users]', error)
    res.status(500).json({ error: 'Failed to list users', code: 'INTERNAL_ERROR' })
  }
})

/**
 * PATCH /api/admin/users/:id
 * Body : { isActive?, isAdmin?, subscriptionTier? }
 * Sécurité : un admin ne peut pas retirer son propre rôle isAdmin.
 */
const UpdateUserSchema = z.object({
  isActive: z.boolean().optional(),
  isAdmin: z.boolean().optional(),
  subscriptionTier: z.enum(['free', 'pro']).optional(),
})

router.patch('/users/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = UpdateUserSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', code: 'VALIDATION_ERROR', details: parsed.error.flatten() })
    return
  }

  const id = req.params.id as string

  // Validation ObjectId
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' })
    return
  }

  try {
    const target = await User.findById(id).lean()
    if (!target) {
      res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' })
      return
    }

    // Sécurité : un admin ne peut pas se retirer lui-même son propre rôle
    if (target.authId === req.user!.authId && parsed.data.isAdmin === false) {
      res.status(403).json({ error: 'You cannot remove your own admin role', code: 'FORBIDDEN' })
      return
    }

    const updated = await User.findByIdAndUpdate(
      id,
      { $set: parsed.data },
      { new: true }
    ).lean()

    if (!updated) {
      res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' })
      return
    }

    res.json(toUserDTO(updated))
  } catch (error) {
    console.error('[PATCH /admin/users/:id]', error)
    res.status(500).json({ error: 'Failed to update user', code: 'INTERNAL_ERROR' })
  }
})

export default router
