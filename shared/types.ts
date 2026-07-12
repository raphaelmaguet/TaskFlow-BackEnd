/**
 * Types partagés entre le backend et le frontend.
 * Ces types sont des DTOs (Data Transfer Objects) — indépendants de Mongoose.
 * Copier ce fichier dans TaskFlow-FrontEnd/client/types/api.ts pour synchroniser.
 */

// ── Enums / Unions ────────────────────────────────────────────────────────────

export type SubscriptionTier = 'free' | 'pro'
export type BoardRole = 'owner' | 'member'
export type BackgroundType = 'color' | 'gradient' | 'image'
export type InvitationStatus = 'pending' | 'accepted' | 'expired'

// ── User ─────────────────────────────────────────────────────────────────────

export interface UserDTO {
  id: string
  authId: string
  email: string
  name: string
  avatarUrl?: string
  subscriptionTier: SubscriptionTier
  isActive: boolean
  isAdmin: boolean
  createdAt: string
  updatedAt: string
}

// ── Board ─────────────────────────────────────────────────────────────────────

export interface BoardMemberDTO {
  userId: string
  role: BoardRole
}

export interface BoardBackgroundDTO {
  type: BackgroundType
  value: string
}

export interface BoardDTO {
  id: string
  title: string
  ownerId: string
  members: BoardMemberDTO[]
  background: BoardBackgroundDTO
  columnOrder: string[]
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

// ── Column ────────────────────────────────────────────────────────────────────

export interface ColumnDTO {
  id: string
  boardId: string
  title: string
  cardOrder: string[]
  position: number
  createdAt: string
  updatedAt: string
}

// ── Card ──────────────────────────────────────────────────────────────────────

export interface CardLabelDTO {
  text: string
  color: string
}

export interface ChecklistItemDTO {
  id: string
  text: string
  isDone: boolean
  assigneeId?: string
}

export interface CardDTO {
  id: string
  boardId: string
  columnId: string
  title: string
  description: string
  position: number
  startDate?: string
  deadline?: string
  labels: CardLabelDTO[]
  assignees: string[]
  checklist: ChecklistItemDTO[]
  isDone: boolean
  isArchived: boolean
  createdAt: string
  updatedAt: string
}

// ── Board with data ───────────────────────────────────────────────────────────

export interface ColumnWithCardsDTO extends ColumnDTO {
  cards: CardDTO[]
}

export interface BoardWithColumnsDTO extends BoardDTO {
  columns: ColumnWithCardsDTO[]
}

// ── Invitation ────────────────────────────────────────────────────────────────

export interface InvitationDTO {
  id: string
  boardId: string
  boardTitle: string
  invitedBy: string
  email: string
  status: InvitationStatus
  expiresAt: string
}

// ── WebSocket events ─────────────────────────────────────────────────────────

export interface WsCardPayload {
  boardId: string
  card: CardDTO
}

export interface WsCardDeletedPayload {
  boardId: string
  cardId: string
  columnId: string
}

export interface WsCardMovedPayload {
  boardId: string
  cardId: string
  fromColumnId: string
  toColumnId: string
  newIndex: number
}

export interface WsColumnPayload {
  boardId: string
  column: ColumnDTO
}

export interface WsColumnDeletedPayload {
  boardId: string
  columnId: string
}

export interface WsColumnsReorderedPayload {
  boardId: string
  columnOrder: string[]
}

// ── API responses ─────────────────────────────────────────────────────────────

export interface ApiError {
  error: string
  code: string
}
