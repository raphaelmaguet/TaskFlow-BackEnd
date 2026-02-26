import { Router, Response } from 'express'
import { AuthRequest } from '../middleware/auth'
import { Notification } from '../models/Notification'

const router = Router()

/**
 * GET /api/notifications
 * Liste les notifications du user connecté (les 50 dernières).
 */
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.supabaseId
    const notifications = await Notification.find({ recipientId: userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()

    res.json(
      notifications.map((n) => ({
        id: n._id.toString(),
        recipientId: n.recipientId,
        senderId: n.senderId,
        senderName: n.senderName,
        type: n.type,
        cardTitle: n.cardTitle,
        boardTitle: n.boardTitle,
        boardId: n.boardId,
        cardId: n.cardId,
        checklistItemText: n.checklistItemText,
        isRead: n.isRead,
        createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : n.createdAt,
      }))
    )
  } catch (error) {
    console.error('[GET /notifications]', error)
    res.status(500).json({ error: 'Failed to fetch notifications', code: 'INTERNAL_ERROR' })
  }
})

/**
 * PATCH /api/notifications/:id/read
 * Marque une notification comme lue.
 */
router.patch('/:id/read', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.supabaseId
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipientId: userId },
      { isRead: true },
      { new: true }
    ).lean()

    if (!notif) {
      res.status(404).json({ error: 'Notification not found', code: 'NOT_FOUND' })
      return
    }

    res.json({ id: notif._id.toString(), isRead: true })
  } catch (error) {
    console.error('[PATCH /notifications/:id/read]', error)
    res.status(500).json({ error: 'Failed to mark notification', code: 'INTERNAL_ERROR' })
  }
})

/**
 * POST /api/notifications/read-all
 * Marque toutes les notifications comme lues.
 */
router.post('/read-all', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.supabaseId
    await Notification.updateMany({ recipientId: userId, isRead: false }, { isRead: true })
    res.json({ message: 'All notifications marked as read' })
  } catch (error) {
    console.error('[POST /notifications/read-all]', error)
    res.status(500).json({ error: 'Failed to mark all notifications', code: 'INTERNAL_ERROR' })
  }
})

/**
 * DELETE /api/notifications/:id
 * Supprime une notification.
 */
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.supabaseId
    const result = await Notification.findOneAndDelete({ _id: req.params.id, recipientId: userId })

    if (!result) {
      res.status(404).json({ error: 'Notification not found', code: 'NOT_FOUND' })
      return
    }

    res.json({ message: 'Notification deleted', id: req.params.id })
  } catch (error) {
    console.error('[DELETE /notifications/:id]', error)
    res.status(500).json({ error: 'Failed to delete notification', code: 'INTERNAL_ERROR' })
  }
})

export default router
