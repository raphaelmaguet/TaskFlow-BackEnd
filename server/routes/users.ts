import { Router, Response } from 'express'
import { z } from 'zod'
import { AuthRequest } from '../middleware/auth'
import { User } from '../models/User'

const router = Router()

/**
 * GET /api/users/me
 * Retourne le profil de l'utilisateur connecté.
 */
router.get('/me', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findOne({ supabaseId: req.user!.supabaseId }).lean()

    if (!user) {
      res.status(404).json({ error: 'User not found. Call /api/auth/sync first.', code: 'NOT_FOUND' })
      return
    }

    res.json({
      id: user._id.toString(),
      supabaseId: user.supabaseId,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      subscriptionTier: user.subscriptionTier,
      isActive: user.isActive,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })
  } catch (error) {
    console.error('[GET /users/me]', error)
    res.status(500).json({ error: 'Failed to fetch user', code: 'INTERNAL_ERROR' })
  }
})

/**
 * PATCH /api/users/me
 * Mise à jour du nom de l'utilisateur connecté.
 */
const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
})

router.patch('/me', async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = UpdateProfileSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid input', code: 'VALIDATION_ERROR', details: parsed.error.flatten() })
    return
  }

  try {
    const user = await User.findOneAndUpdate(
      { supabaseId: req.user!.supabaseId },
      { $set: parsed.data },
      { new: true }
    ).lean()

    if (!user) {
      res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' })
      return
    }

    res.json({
      id: user._id.toString(),
      supabaseId: user.supabaseId,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      subscriptionTier: user.subscriptionTier,
      isActive: user.isActive,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })
  } catch (error) {
    console.error('[PATCH /users/me]', error)
    res.status(500).json({ error: 'Failed to update user', code: 'INTERNAL_ERROR' })
  }
})

export default router
