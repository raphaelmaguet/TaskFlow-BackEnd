import { Router, Response } from 'express'
import { z } from 'zod'
import mongoose from 'mongoose'
import { AuthRequest } from '../middleware/auth'
import { Board } from '../models/Board'
import { Column } from '../models/Column'
import { Card } from '../models/Card'
import { getIO } from '../config/socket'
import type { ColumnDTO } from '../../shared/types'

// mergeParams: true pour accéder à req.params.boardId du router parent
const router = Router({ mergeParams: true })

// ── Helpers ──────────────────────────────────────────────────────────────────

function toColumnDTO(col: any): ColumnDTO {
  return {
    id: col._id.toString(),
    boardId: col.boardId.toString(),
    title: col.title,
    cardOrder: (col.cardOrder ?? []).map((id: any) => id.toString()),
    position: col.position,
    createdAt: col.createdAt instanceof Date ? col.createdAt.toISOString() : col.createdAt,
    updatedAt: col.updatedAt instanceof Date ? col.updatedAt.toISOString() : col.updatedAt,
  }
}

/** Vérifie que l'utilisateur est membre du board et retourne le board. */
async function assertMember(boardId: string, authId: string) {
  return Board.findOne({ _id: boardId, 'members.userId': authId, isArchived: false })
}

// ── Validation schemas ────────────────────────────────────────────────────────

const CreateColumnSchema = z.object({
  title: z.string().min(1, 'Le titre est requis').max(100),
})

const UpdateColumnSchema = z.object({
  title: z.string().min(1).max(100),
})

const ReorderColumnsSchema = z.object({
  columnOrder: z.array(z.string()).min(1),
})

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * POST /api/boards/:boardId/columns
 * Crée une nouvelle colonne à la fin du board.
 */
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const boardId = req.params.boardId as string
    const userId = req.user!.authId

    const board = await assertMember(boardId, userId)
    if (!board) {
      res.status(404).json({ error: 'Board not found', code: 'NOT_FOUND' })
      return
    }

    const parse = CreateColumnSchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({ error: parse.error.errors[0].message, code: 'VALIDATION_ERROR' })
      return
    }

    // Position = nombre actuel de colonnes
    const count = await Column.countDocuments({ boardId: board._id })

    const column = await Column.create({
      boardId: board._id,
      title: parse.data.title,
      cardOrder: [],
      position: count,
    })

    // Ajouter à columnOrder du board
    board.columnOrder.push(column._id)
    await board.save()

    const createdColDto = toColumnDTO(column.toObject())
    try { getIO().to(`board:${boardId}`).emit('column:created', { boardId, column: createdColDto }) } catch (_) {}
    res.status(201).json(createdColDto)
  } catch (error) {
    console.error('[POST /boards/:boardId/columns]', error)
    res.status(500).json({ error: 'Failed to create column', code: 'INTERNAL_ERROR' })
  }
})

/**
 * PATCH /api/boards/:boardId/columns/reorder
 * Réordonne les colonnes du board.
 * ⚠️ Doit être déclaré AVANT /:id pour ne pas être capturé comme param.
 */
router.patch('/reorder', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const boardId = req.params.boardId as string
    const userId = req.user!.authId

    const board = await assertMember(boardId, userId)
    if (!board) {
      res.status(404).json({ error: 'Board not found', code: 'NOT_FOUND' })
      return
    }

    const parse = ReorderColumnsSchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({ error: parse.error.errors[0].message, code: 'VALIDATION_ERROR' })
      return
    }

    const { columnOrder } = parse.data

    // Vérifie que les IDs fournis correspondent aux colonnes existantes du board
    const existingIds = board.columnOrder.map((id) => id.toString())
    const valid =
      columnOrder.length === existingIds.length &&
      columnOrder.every((id) => existingIds.includes(id))

    if (!valid) {
      res.status(400).json({ error: 'Invalid column order', code: 'VALIDATION_ERROR' })
      return
    }

    // Met à jour columnOrder et position de chaque colonne
    board.columnOrder = columnOrder.map((id) => new mongoose.Types.ObjectId(id))
    await board.save()

    // Met à jour le champ position de chaque colonne
    await Promise.all(
      columnOrder.map((id, index) =>
        Column.updateOne({ _id: id, boardId: board._id }, { position: index })
      )
    )

    try { getIO().to(`board:${boardId}`).emit('columns:reordered', { boardId, columnOrder }) } catch (_) {}
    res.json({ columnOrder })
  } catch (error) {
    console.error('[PATCH /boards/:boardId/columns/reorder]', error)
    res.status(500).json({ error: 'Failed to reorder columns', code: 'INTERNAL_ERROR' })
  }
})

/**
 * PATCH /api/boards/:boardId/columns/:id
 * Renomme une colonne (tout membre peut renommer).
 */
router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const boardId = req.params.boardId as string
    const columnId = req.params.id as string
    const userId = req.user!.authId

    const board = await assertMember(boardId, userId)
    if (!board) {
      res.status(404).json({ error: 'Board not found', code: 'NOT_FOUND' })
      return
    }

    const parse = UpdateColumnSchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({ error: parse.error.errors[0].message, code: 'VALIDATION_ERROR' })
      return
    }

    const column = await Column.findOne({ _id: columnId, boardId: board._id })
    if (!column) {
      res.status(404).json({ error: 'Column not found', code: 'NOT_FOUND' })
      return
    }

    column.title = parse.data.title
    await column.save()

    const updatedColDto = toColumnDTO(column.toObject())
    try { getIO().to(`board:${boardId}`).emit('column:updated', { boardId, column: updatedColDto }) } catch (_) {}
    res.json(updatedColDto)
  } catch (error) {
    console.error('[PATCH /boards/:boardId/columns/:id]', error)
    res.status(500).json({ error: 'Failed to update column', code: 'INTERNAL_ERROR' })
  }
})

/**
 * DELETE /api/boards/:boardId/columns/:id
 * Supprime une colonne et toutes ses cartes (owner uniquement).
 */
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const boardId = req.params.boardId as string
    const columnId = req.params.id as string
    const userId = req.user!.authId

    // Seul l'owner peut supprimer des colonnes
    const board = await Board.findOne({ _id: boardId, ownerId: userId, isArchived: false })
    if (!board) {
      res.status(403).json({ error: 'Not allowed', code: 'FORBIDDEN' })
      return
    }

    const column = await Column.findOne({ _id: columnId, boardId: board._id })
    if (!column) {
      res.status(404).json({ error: 'Column not found', code: 'NOT_FOUND' })
      return
    }

    // Supprimer toutes les cartes de la colonne
    await Card.deleteMany({ columnId: column._id })

    // Retirer la colonne de columnOrder
    board.columnOrder = board.columnOrder.filter(
      (id) => id.toString() !== columnId
    ) as typeof board.columnOrder
    await board.save()

    await column.deleteOne()

    try { getIO().to(`board:${boardId}`).emit('column:deleted', { boardId, columnId }) } catch (_) {}
    res.json({ message: 'Column deleted', id: columnId })
  } catch (error) {
    console.error('[DELETE /boards/:boardId/columns/:id]', error)
    res.status(500).json({ error: 'Failed to delete column', code: 'INTERNAL_ERROR' })
  }
})

export default router
