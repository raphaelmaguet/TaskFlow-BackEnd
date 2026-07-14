import { Router, Response } from 'express'
import { Client, Users } from 'node-appwrite'
import { env } from '../config/env'
import { AuthRequest } from '../middleware/auth'
import { User } from '../models/User'

// Client server-side porteur de l'API key (lecture du profil / des identités Appwrite).
const appwriteAdmin = new Client()
  .setEndpoint(env.APPWRITE_ENDPOINT)
  .setProject(env.APPWRITE_PROJECT_ID)
  .setKey(env.APPWRITE_API_KEY)
const appwriteUsers = new Users(appwriteAdmin)

const router = Router()

/**
 * POST /api/auth/sync
 * Crée ou met à jour le document User MongoDB depuis le JWT Appwrite.
 * Appelé automatiquement après chaque inscription/connexion côté client.
 * Pour les utilisateurs Google OAuth, récupère le nom complet via le server SDK Appwrite.
 */
router.post('/sync', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { authId, email } = req.user!

    // Récupère les métadonnées utilisateur (nom, avatar) via le server SDK Appwrite.
    // Appwrite ne stocke pas nativement l'avatar_url Google → on tente les prefs,
    // sinon on retombe sur le préfixe de l'email (comportement historique).
    let displayName = email.split('@')[0]
    let avatarUrl: string | undefined
    try {
      const u = await appwriteUsers.get(authId)
      if (u.name) displayName = u.name
      const prefs = (u.prefs ?? {}) as Record<string, unknown>
      const prefAvatar = prefs.avatarUrl ?? prefs.avatar
      if (typeof prefAvatar === 'string' && prefAvatar) avatarUrl = prefAvatar
    } catch {
      // Pas bloquant — on utilise le fallback email
    }

    const insertFields: Record<string, unknown> = {
      email,
      name: displayName,
      subscriptionTier: 'free',
      isActive: true,
      isAdmin: false,
    }
    if (avatarUrl) {
      insertFields.avatarUrl = avatarUrl
    }

    // Lie ce document au authId courant : si un compte existe déjà pour cet
    // authId (reconnexion normale) OU pour cet email (l'utilisateur se
    // connecte via un AUTRE provider — ex. Apple après Google — avec le même
    // email vérifié), on met à jour son authId au lieu d'insérer un doublon.
    // Google et Apple vérifient tous deux la propriété de l'email avant de
    // le renvoyer, donc réassocier par email est sûr. Contrairement à
    // Supabase, Appwrite ne lie pas automatiquement les comptes multi-provider.
    const user = await User.findOneAndUpdate(
      { $or: [{ authId }, { email }] },
      {
        $set: { authId },
        $setOnInsert: insertFields,
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
