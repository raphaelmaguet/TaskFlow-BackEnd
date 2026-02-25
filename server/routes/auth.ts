import { Router, Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { User } from '../models/User'

const router = Router()

/**
 * POST /api/auth/sync
 * Crée ou met à jour le document User MongoDB depuis le JWT Supabase.
 * Appelé automatiquement après chaque inscription/connexion côté client.
 */
router.post('/sync', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { supabaseId, email } = req.user!

    const user = await User.findOneAndUpdate(
      { supabaseId },
      {
        $setOnInsert: {
          supabaseId,
          email,
          name: email.split('@')[0], // nom par défaut = partie locale de l'email
          subscriptionTier: 'free',
          isActive: true,
          isAdmin: false,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean()

    res.status(200).json({ synced: true, userId: user!._id })
  } catch (error) {
    console.error('[auth/sync]', error)
    res.status(500).json({ error: 'Sync failed', code: 'INTERNAL_ERROR' })
  }
})

export default router
