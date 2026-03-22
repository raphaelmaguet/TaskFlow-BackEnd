import { Router, Response } from 'express'
import { z } from 'zod'
import mongoose from 'mongoose'
import { AuthRequest } from '../middleware/auth'
import { Board } from '../models/Board'
import { Column } from '../models/Column'
import { Card } from '../models/Card'
import { Notification } from '../models/Notification'
import { User } from '../models/User'
import { getIO } from '../config/socket'
import { sendCardAssignedEmail } from '../lib/email'
import type { CardDTO } from '../../shared/types'
import type { ICardLabel, IChecklistItem } from '../models/Card'

// mergeParams: true pour accéder à req.params.boardId du parent
const router = Router({ mergeParams: true })

// ── Helper ────────────────────────────────────────────────────────────────────

function toCardDTO(card: any): CardDTO {
  return {
    id: card._id.toString(),
    boardId: card.boardId.toString(),
    columnId: card.columnId.toString(),
    title: card.title,
    description: card.description ?? '',
    position: card.position,
    startDate: card.startDate ? new Date(card.startDate).toISOString() : undefined,
    deadline: card.deadline ? new Date(card.deadline).toISOString() : undefined,
    labels: (card.labels ?? []).map((l: any) => ({ text: l.text, color: l.color })),
    assignees: card.assignees ?? [],
    checklist: (card.checklist ?? []).map((item: any) => ({
      id: item.id,
      text: item.text,
      isDone: item.isDone ?? false,
      ...(item.assigneeId != null ? { assigneeId: item.assigneeId } : {}),
    })),
    isDone: card.isDone ?? false,
    isArchived: card.isArchived ?? false,
    createdAt: card.createdAt instanceof Date ? card.createdAt.toISOString() : card.createdAt,
    updatedAt: card.updatedAt instanceof Date ? card.updatedAt.toISOString() : card.updatedAt,
  }
}

async function assertMember(boardId: string, supabaseId: string) {
  return Board.findOne({ _id: boardId, 'members.userId': supabaseId, isArchived: false })
}

// ── Validation schemas ────────────────────────────────────────────────────────

const LabelSchema = z.object({
  text: z.string().min(1).max(50),
  color: z.string().min(1).max(30),
})

const CreateCardSchema = z.object({
  columnId: z.string().min(1),
  title: z.string().min(1, 'Le titre est requis').max(200),
})

const ChecklistItemSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1).max(200),
  isDone: z.boolean(),
  assigneeId: z.string().nullable().optional(),
})

const UpdateCardSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  startDate: z.string().datetime().nullable().optional(),
  deadline: z.string().datetime().nullable().optional(),
  labels: z.array(LabelSchema).optional(),
  assignees: z.array(z.string()).optional(),
  checklist: z.array(ChecklistItemSchema).optional(),
  isDone: z.boolean().optional(),
})

const MoveCardSchema = z.object({
  toColumnId: z.string().min(1),
  newIndex: z.number().int().min(0),
})

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * POST /api/boards/:boardId/cards
 * Crée une nouvelle carte dans une colonne.
 * Body: { columnId, title }
 */
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const boardId = req.params.boardId as string
    const userId = req.user!.supabaseId

    const board = await assertMember(boardId, userId)
    if (!board) {
      res.status(404).json({ error: 'Board not found', code: 'NOT_FOUND' })
      return
    }

    const parse = CreateCardSchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({ error: parse.error.errors[0].message, code: 'VALIDATION_ERROR' })
      return
    }

    const { columnId, title } = parse.data

    const column = await Column.findOne({ _id: columnId, boardId: board._id })
    if (!column) {
      res.status(404).json({ error: 'Column not found', code: 'NOT_FOUND' })
      return
    }

    const position = column.cardOrder.length

    const card = await Card.create({
      boardId: board._id,
      columnId: column._id,
      title,
      description: '',
      position,
      labels: [],
      assignees: [],
      isArchived: false,
    })

    // Ajouter à cardOrder de la colonne
    column.cardOrder.push(card._id)
    await column.save()

    const createdDto = toCardDTO(card.toObject())
    try { getIO().to(`board:${boardId}`).emit('card:created', { boardId, card: createdDto }) } catch (_) {}
    res.status(201).json(createdDto)
  } catch (error) {
    console.error('[POST /boards/:boardId/cards]', error)
    res.status(500).json({ error: 'Failed to create card', code: 'INTERNAL_ERROR' })
  }
})

/**
 * GET /api/boards/:boardId/cards/:cardId
 * Retourne le détail d'une carte.
 */
router.get('/:cardId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const boardId = req.params.boardId as string
    const cardId = req.params.cardId as string
    const userId = req.user!.supabaseId

    const board = await assertMember(boardId, userId)
    if (!board) {
      res.status(404).json({ error: 'Board not found', code: 'NOT_FOUND' })
      return
    }

    const card = await Card.findOne({ _id: cardId, boardId: board._id, isArchived: false }).lean()
    if (!card) {
      res.status(404).json({ error: 'Card not found', code: 'NOT_FOUND' })
      return
    }

    res.json(toCardDTO(card))
  } catch (error) {
    console.error('[GET /boards/:boardId/cards/:cardId]', error)
    res.status(500).json({ error: 'Failed to fetch card', code: 'INTERNAL_ERROR' })
  }
})

/**
 * PATCH /api/boards/:boardId/cards/:cardId
 * Modifie une carte (tout membre autorisé).
 * Champs modifiables : title, description, deadline, labels, assignees.
 */
router.patch('/:cardId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const boardId = req.params.boardId as string
    const cardId = req.params.cardId as string
    const userId = req.user!.supabaseId

    const board = await assertMember(boardId, userId)
    if (!board) {
      res.status(403).json({ error: 'Not allowed', code: 'FORBIDDEN' })
      return
    }

    const parse = UpdateCardSchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({ error: parse.error.errors[0].message, code: 'VALIDATION_ERROR' })
      return
    }

    const card = await Card.findOne({ _id: cardId, boardId: board._id, isArchived: false })
    if (!card) {
      res.status(404).json({ error: 'Card not found', code: 'NOT_FOUND' })
      return
    }

    const { title, description, deadline, labels, assignees } = parse.data

    // Track old assignees and checklist for notification diff
    const oldAssignees = [...card.assignees]
    const oldChecklist = card.checklist.map((i) => ({ id: i.id, assigneeId: i.assigneeId }))

    if (title !== undefined) card.title = title
    if (description !== undefined) card.description = description
    if (parse.data.startDate !== undefined) card.startDate = parse.data.startDate ? new Date(parse.data.startDate) : undefined
    if (deadline !== undefined) card.deadline = deadline ? new Date(deadline) : undefined
    if (labels !== undefined) card.labels = labels as ICardLabel[]
    if (assignees !== undefined) card.assignees = assignees
    if (parse.data.checklist !== undefined) {
      card.checklist = parse.data.checklist.map(item => ({
        ...item,
        assigneeId: item.assigneeId ?? undefined,
      })) as IChecklistItem[]
    }
    if (parse.data.isDone !== undefined) card.isDone = parse.data.isDone

    await card.save()
    const updatedDto = toCardDTO(card.toObject())
    try { getIO().to(`board:${boardId}`).emit('card:updated', { boardId, card: updatedDto }) } catch (_) {}

    // ── Create notifications for newly assigned users ────────────────────
    try {
      const senderUser = await User.findOne({ supabaseId: userId }).lean()
      const senderName = senderUser?.name ?? 'Un membre'
      const boardTitle = board.title ?? 'Board'
      const cardTitle = card.title

      // Card-level assignee notifications
      if (assignees !== undefined) {
        const newAssignees = assignees.filter((a) => !oldAssignees.includes(a) && a !== userId)

        // Récupérer le nom de la colonne pour l'email
        let columnTitle: string | undefined
        try {
          const col = await Column.findById(card.columnId).lean()
          if (col) columnTitle = col.title
        } catch (_) {}

        for (const recipientId of newAssignees) {
          const notif = await Notification.create({
            recipientId,
            senderId: userId,
            senderName,
            type: 'card_assigned',
            cardTitle,
            boardTitle,
            boardId,
            cardId,
          })
          try {
            getIO().to(`user:${recipientId}`).emit('notification:new', {
              id: notif._id.toString(),
              recipientId,
              senderId: userId,
              senderName,
              type: 'card_assigned',
              cardTitle,
              boardTitle,
              boardId,
              cardId,
              isRead: false,
              createdAt: notif.createdAt.toISOString(),
            })
          } catch (_) {}

          // Envoyer un email au membre assigné
          try {
            const recipientUser = await User.findOne({ supabaseId: recipientId }).lean()
            if (recipientUser?.email) {
              sendCardAssignedEmail({
                toEmail: recipientUser.email,
                assignerName: senderName,
                boardTitle,
                boardId,
                cardId,
                cardTitle,
                cardDescription: card.description || undefined,
                columnTitle,
                deadline: card.deadline ? card.deadline.toISOString() : undefined,
                labels: card.labels?.map((l) => ({ text: l.text, color: l.color })),
              }).catch((err) => console.error('[EMAIL] card-assigned send error:', err))
            }
          } catch (_) {}
        }
      }

      // Checklist item assignee notifications
      if (parse.data.checklist !== undefined) {
        for (const newItem of parse.data.checklist) {
          if (!newItem.assigneeId || newItem.assigneeId === userId) continue
          const oldItem = oldChecklist.find((o) => o.id === newItem.id)
          if (!oldItem || oldItem.assigneeId !== newItem.assigneeId) {
            const notif = await Notification.create({
              recipientId: newItem.assigneeId,
              senderId: userId,
              senderName,
              type: 'checklist_item_assigned',
              cardTitle,
              boardTitle,
              boardId,
              cardId,
              checklistItemText: newItem.text,
            })
            try {
              getIO().to(`user:${newItem.assigneeId}`).emit('notification:new', {
                id: notif._id.toString(),
                recipientId: newItem.assigneeId,
                senderId: userId,
                senderName,
                type: 'checklist_item_assigned',
                cardTitle,
                boardTitle,
                boardId,
                cardId,
                checklistItemText: newItem.text,
                isRead: false,
                createdAt: notif.createdAt.toISOString(),
              })
            } catch (_) {}
          }
        }
      }
    } catch (notifErr) {
      console.error('[PATCH cards] notification error (non-blocking):', notifErr)
    }

    res.json(updatedDto)
  } catch (error) {
    console.error('[PATCH /boards/:boardId/cards/:cardId]', error)
    res.status(500).json({ error: 'Failed to update card', code: 'INTERNAL_ERROR' })
  }
})

/**
 * DELETE /api/boards/:boardId/cards/:cardId
 * Archive (soft delete) une carte.
 */
router.delete('/:cardId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const boardId = req.params.boardId as string
    const cardId = req.params.cardId as string
    const userId = req.user!.supabaseId

    const board = await assertMember(boardId, userId)
    if (!board) {
      res.status(403).json({ error: 'Not allowed', code: 'FORBIDDEN' })
      return
    }

    const card = await Card.findOne({ _id: cardId, boardId: board._id, isArchived: false })
    if (!card) {
      res.status(404).json({ error: 'Card not found', code: 'NOT_FOUND' })
      return
    }

    // Retirer de cardOrder de la colonne
    await Column.updateOne(
      { _id: card.columnId },
      { $pull: { cardOrder: new mongoose.Types.ObjectId(cardId) } }
    )

    const columnIdStr = card.columnId.toString()
    card.isArchived = true
    await card.save()

    try { getIO().to(`board:${boardId}`).emit('card:deleted', { boardId, cardId, columnId: columnIdStr }) } catch (_) {}
    res.json({ message: 'Card archived', id: cardId })
  } catch (error) {
    console.error('[DELETE /boards/:boardId/cards/:cardId]', error)
    res.status(500).json({ error: 'Failed to archive card', code: 'INTERNAL_ERROR' })
  }
})

/**
 * PATCH /api/boards/:boardId/cards/:cardId/move
 * Déplace une carte vers une autre colonne (ou réordonne dans la même).
 * Body: { toColumnId, newIndex }
 */
router.patch('/:cardId/move', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const boardId = req.params.boardId as string
    const cardId = req.params.cardId as string
    const userId = req.user!.supabaseId

    const board = await assertMember(boardId, userId)
    if (!board) {
      res.status(403).json({ error: 'Not allowed', code: 'FORBIDDEN' })
      return
    }

    const parse = MoveCardSchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({ error: parse.error.errors[0].message, code: 'VALIDATION_ERROR' })
      return
    }

    const { toColumnId, newIndex } = parse.data

    const card = await Card.findOne({ _id: cardId, boardId: board._id, isArchived: false })
    if (!card) {
      res.status(404).json({ error: 'Card not found', code: 'NOT_FOUND' })
      return
    }

    const fromColumnId = card.columnId.toString()
    const isSameColumn = fromColumnId === toColumnId

    const [fromCol, toCol] = isSameColumn
      ? await Promise.all([Column.findById(fromColumnId), null])
      : await Promise.all([Column.findById(fromColumnId), Column.findById(toColumnId)])

    const destCol = isSameColumn ? fromCol : toCol

    if (!fromCol || !destCol) {
      res.status(404).json({ error: 'Column not found', code: 'NOT_FOUND' })
      return
    }

    // Nettoie la carte de la colonne source
    const fromOrder = fromCol.cardOrder
      .map((id) => id.toString())
      .filter((id) => id !== cardId)

    if (isSameColumn) {
      // Réinsérer à la nouvelle position
      fromOrder.splice(newIndex, 0, cardId)
      fromCol.cardOrder = fromOrder.map((id) => new mongoose.Types.ObjectId(id))
      await fromCol.save()
    } else {
      fromCol.cardOrder = fromOrder.map((id) => new mongoose.Types.ObjectId(id))
      await fromCol.save()

      // Insérer dans la colonne destination
      const toOrder = destCol.cardOrder
        .map((id) => id.toString())
        .filter((id) => id !== cardId)
      toOrder.splice(newIndex, 0, cardId)
      destCol.cardOrder = toOrder.map((id) => new mongoose.Types.ObjectId(id))
      await destCol.save()

      // Mettre à jour columnId de la carte
      card.columnId = new mongoose.Types.ObjectId(toColumnId)
    }

    // Recalculer position
    card.position = newIndex
    await card.save()

    const movedDto = toCardDTO(card.toObject())
    try {
      getIO().to(`board:${boardId}`).emit('card:moved', {
        boardId,
        cardId,
        fromColumnId,
        toColumnId,
        newIndex,
      })
    } catch (_) {}
    res.json(movedDto)
  } catch (error) {
    console.error('[PATCH /boards/:boardId/cards/:cardId/move]', error)
    res.status(500).json({ error: 'Failed to move card', code: 'INTERNAL_ERROR' })
  }
})

export default router
