import { Router, Response } from 'express'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { AuthRequest } from '../middleware/auth'
import { sendInvitationEmail } from '../lib/email'
import columnsRouter from './columns'
import cardsRouter from './cards'
import { Board } from '../models/Board'
import { Column } from '../models/Column'
import { Card } from '../models/Card'
import { Invitation } from '../models/Invitation'
import { User } from '../models/User'
import type { IBoardBackground } from '../models/Board'
import type {
  BoardDTO,
  BoardWithColumnsDTO,
  BoardMemberDTO,
  ColumnWithCardsDTO,
  CardDTO,
  ColumnDTO,
  InvitationDTO,
} from '../../shared/types'

const router = Router()

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
    labels: card.labels ?? [],
    assignees: card.assignees ?? [],
    checklist: card.checklist ?? [],
    isDone: card.isDone ?? false,
    isArchived: card.isArchived ?? false,
    createdAt: card.createdAt instanceof Date ? card.createdAt.toISOString() : card.createdAt,
    updatedAt: card.updatedAt instanceof Date ? card.updatedAt.toISOString() : card.updatedAt,
  }
}

function toBoardDTO(board: any): BoardDTO {
  return {
    id: board._id.toString(),
    title: board.title,
    ownerId: board.ownerId,
    members: (board.members ?? []).map((m: any) => ({
      userId: m.userId,
      role: m.role,
    })) as BoardMemberDTO[],
    background: {
      type: board.background?.type ?? 'color',
      value: board.background?.value ?? '#0079BF',
    },
    columnOrder: (board.columnOrder ?? []).map((id: any) => id.toString()),
    isArchived: board.isArchived ?? false,
    createdAt: board.createdAt instanceof Date ? board.createdAt.toISOString() : board.createdAt,
    updatedAt: board.updatedAt instanceof Date ? board.updatedAt.toISOString() : board.updatedAt,
  }
}

/** Vérifie que l'utilisateur est membre du board (owner ou member). */
async function assertMember(boardId: string, authId: string) {
  const board = await Board.findOne({
    _id: boardId,
    'members.userId': authId,
    isArchived: false,
  })
  return board
}

/** Vérifie que l'utilisateur est owner du board. */
async function assertOwner(boardId: string, authId: string) {
  const board = await Board.findOne({
    _id: boardId,
    ownerId: authId,
    isArchived: false,
  })
  return board
}

// ── Validation schemas ────────────────────────────────────────────────────────

const BackgroundSchema = z.object({
  type: z.enum(['color', 'gradient', 'image']),
  value: z.string().min(1).max(200),
})

const CreateBoardSchema = z.object({
  title: z.string().min(1, 'Le titre est requis').max(100),
  background: BackgroundSchema.optional().default({ type: 'color', value: '#0079BF' }),
})

const UpdateBoardSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  background: BackgroundSchema.optional(),
})

const CreateInvitationSchema = z.object({
  email: z.string().email('Email invalide'),
})

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/boards
 * Liste les boards dont l'utilisateur est membre (non archivés).
 */
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.authId

    const boards = await Board.find({
      'members.userId': userId,
      isArchived: false,
    })
      .sort({ createdAt: -1 })
      .lean()

    res.json(boards.map(toBoardDTO))
  } catch (error) {
    console.error('[GET /boards]', error)
    res.status(500).json({ error: 'Failed to fetch boards', code: 'INTERNAL_ERROR' })
  }
})

/**
 * GET /api/boards/archived
 * Liste les boards archivés dont l'utilisateur est owner.
 */
router.get('/archived', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.authId

    const boards = await Board.find({
      ownerId: userId,
      isArchived: true,
    })
      .sort({ updatedAt: -1 })
      .lean()

    res.json(boards.map(toBoardDTO))
  } catch (error) {
    console.error('[GET /boards/archived]', error)
    res.status(500).json({ error: 'Failed to fetch archived boards', code: 'INTERNAL_ERROR' })
  }
})

/**
 * POST /api/boards
 * Crée un nouveau board. L'utilisateur est automatiquement ajouté en tant qu'owner.
 */
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parse = CreateBoardSchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({ error: parse.error.errors[0].message, code: 'VALIDATION_ERROR' })
      return
    }

    const { title, background } = parse.data
    const userId = req.user!.authId

    const board = await Board.create({
      title,
      ownerId: userId,
      members: [{ userId, role: 'owner' }],
      background,
      columnOrder: [],
      isArchived: false,
    })

    res.status(201).json(toBoardDTO(board.toObject()))
  } catch (error) {
    console.error('[POST /boards]', error)
    res.status(500).json({ error: 'Failed to create board', code: 'INTERNAL_ERROR' })
  }
})

/**
 * GET /api/boards/:id
 * Retourne un board complet avec ses colonnes et ses cartes.
 */
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.authId
    const board = await assertMember(req.params.id as string, userId)

    if (!board) {
      res.status(404).json({ error: 'Board not found', code: 'NOT_FOUND' })
      return
    }

    const columns = await Column.find({ boardId: board._id }).sort({ position: 1 }).lean()
    const cards = await Card.find({ boardId: board._id, isArchived: false })
      .sort({ position: 1 })
      .lean()

    // Mapper les cartes par colonne
    const cardsByColumn: Record<string, CardDTO[]> = {}
    for (const card of cards) {
      const colId = card.columnId.toString()
      if (!cardsByColumn[colId]) cardsByColumn[colId] = []
      cardsByColumn[colId].push(toCardDTO(card))
    }

    const columnsWithCards: ColumnWithCardsDTO[] = columns.map((col) => ({
      ...toColumnDTO(col),
      cards: cardsByColumn[col._id.toString()] ?? [],
    }))

    const result: BoardWithColumnsDTO = {
      ...toBoardDTO(board.toObject()),
      columns: columnsWithCards,
    }

    res.json(result)
  } catch (error) {
    console.error('[GET /boards/:id]', error)
    res.status(500).json({ error: 'Failed to fetch board', code: 'INTERNAL_ERROR' })
  }
})

/**
 * PATCH /api/boards/:id
 * Modifie le titre ou le background d'un board (owner uniquement).
 */
router.patch('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.authId
    const board = await assertOwner(req.params.id as string, userId)

    if (!board) {
      res.status(403).json({ error: 'Not allowed', code: 'FORBIDDEN' })
      return
    }

    const parse = UpdateBoardSchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({ error: parse.error.errors[0].message, code: 'VALIDATION_ERROR' })
      return
    }

    const { title, background } = parse.data
    if (title !== undefined) board.title = title
    if (background !== undefined) board.background = background as IBoardBackground
    await board.save()

    res.json(toBoardDTO(board.toObject()))
  } catch (error) {
    console.error('[PATCH /boards/:id]', error)
    res.status(500).json({ error: 'Failed to update board', code: 'INTERNAL_ERROR' })
  }
})

/**
 * DELETE /api/boards/:id
 * Archive (soft delete) un board (owner uniquement).
 */
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.authId
    const board = await assertOwner(req.params.id as string, userId)

    if (!board) {
      res.status(403).json({ error: 'Not allowed', code: 'FORBIDDEN' })
      return
    }

    board.isArchived = true
    await board.save()

    res.json({ message: 'Board archived', id: board._id.toString() })
  } catch (error) {
    console.error('[DELETE /boards/:id]', error)
    res.status(500).json({ error: 'Failed to archive board', code: 'INTERNAL_ERROR' })
  }
})

/**
 * PATCH /api/boards/:id/unarchive
 * Désarchive un board (owner uniquement).
 */
router.patch('/:id/unarchive', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.authId
    const board = await Board.findOne({
      _id: req.params.id,
      ownerId: userId,
      isArchived: true,
    })

    if (!board) {
      res.status(404).json({ error: 'Board not found or not archived', code: 'NOT_FOUND' })
      return
    }

    board.isArchived = false
    await board.save()

    res.json(toBoardDTO(board.toObject()))
  } catch (error) {
    console.error('[PATCH /boards/:id/unarchive]', error)
    res.status(500).json({ error: 'Failed to unarchive board', code: 'INTERNAL_ERROR' })
  }
})

/**
 * GET /api/boards/:id/members
 * Liste les membres d'un board avec leurs infos utilisateur.
 */
router.get('/:id/members', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.authId
    const board = await assertMember(req.params.id as string, userId)

    if (!board) {
      res.status(404).json({ error: 'Board not found', code: 'NOT_FOUND' })
      return
    }

    const memberIds = board.members.map((m) => m.userId)
    const users = await User.find({ authId: { $in: memberIds } }).lean()

    const userMap: Record<string, any> = {}
    for (const u of users) userMap[u.authId] = u

    const result = board.members.map((m) => {
      const u = userMap[m.userId]
      return {
        userId: m.userId,
        role: m.role,
        name: u?.name ?? m.userId,
        email: u?.email ?? '',
        avatarUrl: u?.avatarUrl,
      }
    })

    res.json(result)
  } catch (error) {
    console.error('[GET /boards/:id/members]', error)
    res.status(500).json({ error: 'Failed to fetch members', code: 'INTERNAL_ERROR' })
  }
})

/**
 * DELETE /api/boards/:id/members/:userId
 * Retire un membre du board (owner uniquement, ne peut pas retirer l'owner lui-même).
 */
router.delete('/:id/members/:userId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const currentUserId = req.user!.authId
    const board = await assertOwner(req.params.id as string, currentUserId)

    if (!board) {
      res.status(403).json({ error: 'Not allowed', code: 'FORBIDDEN' })
      return
    }

    const targetUserId = req.params.userId

    if (targetUserId === board.ownerId) {
      res.status(400).json({ error: "Cannot remove the board's owner", code: 'INVALID_OPERATION' })
      return
    }

    const originalLength = board.members.length
    board.members = board.members.filter((m) => m.userId !== targetUserId) as typeof board.members

    if (board.members.length === originalLength) {
      res.status(404).json({ error: 'Member not found', code: 'NOT_FOUND' })
      return
    }

    await board.save()
    res.json({ message: 'Member removed', userId: targetUserId })
  } catch (error) {
    console.error('[DELETE /boards/:id/members/:userId]', error)
    res.status(500).json({ error: 'Failed to remove member', code: 'INTERNAL_ERROR' })
  }
})

/**
 * POST /api/boards/:id/invitations
 * Crée une invitation par email (expire dans 7 jours).
 * Retourne l'invitation DTO ou une erreur si l'utilisateur est déjà membre.
 */
router.post('/:id/invitations', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.authId
    const board = await assertMember(req.params.id as string, userId)

    if (!board) {
      res.status(404).json({ error: 'Board not found', code: 'NOT_FOUND' })
      return
    }

    const parse = CreateInvitationSchema.safeParse(req.body)
    if (!parse.success) {
      res.status(400).json({ error: parse.error.errors[0].message, code: 'VALIDATION_ERROR' })
      return
    }

    const { email } = parse.data

    // Vérifie si l'utilisateur invité est déjà membre
    const existingUser = await User.findOne({ email }).lean()
    if (existingUser && board.members.some((m) => m.userId === existingUser.authId)) {
      res.status(409).json({ error: 'User is already a board member', code: 'ALREADY_MEMBER' })
      return
    }

    // Révoque toute invitation pending existante pour cet email sur ce board
    await Invitation.updateMany(
      { boardId: board._id, email, status: 'pending' },
      { status: 'expired' }
    )

    const inviter = await User.findOne({ authId: userId }).lean()

    const invitation = await Invitation.create({
      boardId: board._id,
      invitedBy: userId,
      email,
      token: uuidv4(),
      status: 'pending',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })

    const dto: InvitationDTO = {
      id: invitation._id.toString(),
      boardId: board._id.toString(),
      boardTitle: board.title,
      invitedBy: inviter?.name ?? userId,
      email: invitation.email,
      status: invitation.status,
      expiresAt: invitation.expiresAt.toISOString(),
    }

    // Envoyer l'email d'invitation (non-bloquant : une erreur d'envoi ne fait pas
    // échouer la requête — l'invitation reste valide en base)
    sendInvitationEmail({
      toEmail: email,
      inviterName: inviter?.name ?? 'Un utilisateur',
      boardTitle: board.title,
      invitationToken: invitation.token,
    }).catch((err) => {
      console.error('[POST /boards/:id/invitations] Email send failed (non-fatal):', err.message)
    })

    res.status(201).json(dto)
  } catch (error) {
    console.error('[POST /boards/:id/invitations]', error)
    res.status(500).json({ error: 'Failed to create invitation', code: 'INTERNAL_ERROR' })
  }
})

// ── Nested routers ────────────────────────────────────────────────────────────

router.use('/:boardId/columns', columnsRouter)
router.use('/:boardId/cards', cardsRouter)

export default router
