import { Router, Request, Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { Invitation } from '../models/Invitation'
import { Board } from '../models/Board'
import { User } from '../models/User'

const router = Router()

/**
 * GET /api/invitations/:token  (public — pas d'auth requise)
 * Vérifie la validité d'un token d'invitation.
 */
router.get('/:token', async (req: Request, res: Response): Promise<void> => {
  try {
    const invitation = await Invitation.findOne({
      token: req.params.token,
      status: 'pending',
    }).lean()

    if (!invitation) {
      res.status(404).json({ error: 'Invalid or expired invitation', code: 'NOT_FOUND' })
      return
    }

    if (new Date() > invitation.expiresAt) {
      await Invitation.updateOne({ _id: invitation._id }, { status: 'expired' })
      res.status(410).json({ error: 'Invitation has expired', code: 'EXPIRED' })
      return
    }

    const board = await Board.findById(invitation.boardId).lean()
    if (!board) {
      res.status(404).json({ error: 'Board not found', code: 'NOT_FOUND' })
      return
    }

    const inviter = await User.findOne({ supabaseId: invitation.invitedBy }).lean()

    res.json({
      boardId: invitation.boardId.toString(),
      boardTitle: board.title,
      invitedBy: inviter?.name ?? invitation.invitedBy,
      email: invitation.email,
      expiresAt: invitation.expiresAt,
    })
  } catch (error) {
    console.error('[GET /invitations/:token]', error)
    res.status(500).json({ error: 'Failed to verify invitation', code: 'INTERNAL_ERROR' })
  }
})

/**
 * POST /api/invitations/:token/accept  (authentifié)
 * Accepte une invitation et ajoute l'utilisateur au board.
 */
router.post('/:token/accept', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const invitation = await Invitation.findOne({
      token: req.params.token,
      status: 'pending',
    })

    if (!invitation) {
      res.status(404).json({ error: 'Invalid or expired invitation', code: 'NOT_FOUND' })
      return
    }

    if (new Date() > invitation.expiresAt) {
      invitation.status = 'expired'
      await invitation.save()
      res.status(410).json({ error: 'Invitation has expired', code: 'EXPIRED' })
      return
    }

    const board = await Board.findById(invitation.boardId)
    if (!board) {
      res.status(404).json({ error: 'Board not found', code: 'NOT_FOUND' })
      return
    }

    const supabaseId = req.user!.supabaseId

    // Already a member — idempotent
    const alreadyMember = board.members.some((m) => m.userId === supabaseId)

    if (!alreadyMember) {
      board.members.push({ userId: supabaseId, role: 'member' })
      await board.save()
    }

    invitation.status = 'accepted'
    await invitation.save()

    res.json({ boardId: board._id.toString() })
  } catch (error) {
    console.error('[POST /invitations/:token/accept]', error)
    res.status(500).json({ error: 'Failed to accept invitation', code: 'INTERNAL_ERROR' })
  }
})

export default router
