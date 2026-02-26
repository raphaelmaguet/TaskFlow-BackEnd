import { Router, Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { env } from '../config/env'
import { AuthRequest } from '../middleware/auth'
import { User } from '../models/User'

const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const router = Router()

/**
 * POST /api/auth/sync
 * Crée ou met à jour le document User MongoDB depuis le JWT Supabase.
 * Appelé automatiquement après chaque inscription/connexion côté client.
 * Pour les utilisateurs Google OAuth, récupère le nom complet depuis les métadonnées Supabase.
 */
router.post('/sync', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { supabaseId, email } = req.user!

    // Récupère les métadonnées utilisateur (nom complet, avatar) depuis Supabase
    let displayName = email.split('@')[0]
    let avatarUrl: string | undefined
    try {
      const { data } = await supabaseAdmin.auth.admin.getUserById(supabaseId)
      if (data?.user) {
        const meta = data.user.user_metadata
        if (meta?.full_name) displayName = meta.full_name
        else if (meta?.name) displayName = meta.name
        if (meta?.avatar_url) avatarUrl = meta.avatar_url
      }
    } catch {
      // Pas bloquant — on utilise le fallback email
    }

    const updateFields: Record<string, unknown> = {
      supabaseId,
      email,
      name: displayName,
      subscriptionTier: 'free',
      isActive: true,
      isAdmin: false,
    }
    if (avatarUrl) {
      (updateFields as Record<string, unknown>).avatarUrl = avatarUrl
    }

    const user = await User.findOneAndUpdate(
      { supabaseId },
      {
        $setOnInsert: updateFields,
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
