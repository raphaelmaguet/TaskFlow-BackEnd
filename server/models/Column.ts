import mongoose, { Document, Schema } from 'mongoose'

export interface IColumn extends Document {
  boardId: mongoose.Types.ObjectId
  title: string
  cardOrder: mongoose.Types.ObjectId[]
  position: number
  createdAt: Date
  updatedAt: Date
}

const ColumnSchema = new Schema<IColumn>(
  {
    boardId: { type: Schema.Types.ObjectId, ref: 'Board', required: true },
    title: { type: String, required: true },
    cardOrder: [{ type: Schema.Types.ObjectId, ref: 'Card' }],
    position: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
)

ColumnSchema.index({ boardId: 1 })

export const Column = mongoose.model<IColumn>('Column', ColumnSchema)
