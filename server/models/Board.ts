import mongoose, { Document, Schema } from 'mongoose'

export interface IBoardMember {
  userId: string
  role: 'owner' | 'member'
}

export interface IBoardBackground {
  type: 'color' | 'gradient' | 'image'
  value: string
}

export interface IBoard extends Document {
  title: string
  ownerId: string
  members: IBoardMember[]
  background: IBoardBackground
  columnOrder: mongoose.Types.ObjectId[]
  isArchived: boolean
  createdAt: Date
  updatedAt: Date
}

const BoardSchema = new Schema<IBoard>(
  {
    title: { type: String, required: true },
    ownerId: { type: String, required: true },
    members: [
      {
        userId: { type: String, required: true },
        role: { type: String, enum: ['owner', 'member'], required: true },
      },
    ],
    background: {
      type: {
        type: String,
        enum: ['color', 'gradient', 'image'],
        default: 'color',
      },
      value: { type: String, default: '#0079BF' },
    },
    columnOrder: [{ type: Schema.Types.ObjectId, ref: 'Column' }],
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true }
)

BoardSchema.index({ ownerId: 1 })
BoardSchema.index({ 'members.userId': 1 })

export const Board = mongoose.model<IBoard>('Board', BoardSchema)
