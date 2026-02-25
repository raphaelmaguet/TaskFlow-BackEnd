import mongoose, { Document, Schema } from 'mongoose'

export interface IInvitation extends Document {
  boardId: mongoose.Types.ObjectId
  invitedBy: string
  email: string
  token: string
  status: 'pending' | 'accepted' | 'expired'
  expiresAt: Date
  createdAt: Date
}

const InvitationSchema = new Schema<IInvitation>(
  {
    boardId: { type: Schema.Types.ObjectId, ref: 'Board', required: true },
    invitedBy: { type: String, required: true },
    email: { type: String, required: true },
    token: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'expired'],
      default: 'pending',
    },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
)

InvitationSchema.index({ token: 1 }, { unique: true })
InvitationSchema.index({ boardId: 1 })
// TTL index: MongoDB supprime automatiquement les invitations expirées
InvitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const Invitation = mongoose.model<IInvitation>('Invitation', InvitationSchema)
