import mongoose, { Document, Schema } from 'mongoose'

export interface ICardLabel {
  text: string
  color: string
}

export interface IChecklistItem {
  id: string
  text: string
  isDone: boolean
  assigneeId?: string
}

export interface ICard extends Document {
  boardId: mongoose.Types.ObjectId
  columnId: mongoose.Types.ObjectId
  title: string
  description: string
  position: number
  startDate?: Date
  deadline?: Date
  labels: ICardLabel[]
  assignees: string[]
  checklist: IChecklistItem[]
  isDone: boolean
  isArchived: boolean
  createdAt: Date
  updatedAt: Date
}

const CardSchema = new Schema<ICard>(
  {
    boardId: { type: Schema.Types.ObjectId, ref: 'Board', required: true },
    columnId: { type: Schema.Types.ObjectId, ref: 'Column', required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    position: { type: Number, required: true, default: 0 },
    startDate: { type: Date },
    deadline: { type: Date },
    labels: [
      {
        text: { type: String, required: true },
        color: { type: String, required: true },
      },
    ],
    assignees: [{ type: String }],
    checklist: [
      {
        id: { type: String, required: true },
        text: { type: String, required: true },
        isDone: { type: Boolean, default: false },
        assigneeId: { type: String },
      },
    ],
    isDone: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true }
)

CardSchema.index({ boardId: 1 })
CardSchema.index({ columnId: 1 })
CardSchema.index({ assignees: 1 })

export const Card = mongoose.model<ICard>('Card', CardSchema)
