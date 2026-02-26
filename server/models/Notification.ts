import mongoose, { Document, Schema } from 'mongoose'

export type NotificationType =
  | 'card_assigned'
  | 'checklist_item_assigned'

export interface INotification extends Document {
  /** supabaseId du destinataire */
  recipientId: string
  /** supabaseId de l'émetteur */
  senderId: string
  senderName: string
  type: NotificationType
  /** Titre de la carte concernée */
  cardTitle: string
  /** Nom du board concerné */
  boardTitle: string
  boardId: string
  cardId: string
  /** Texte de l'item checklist (si applicable) */
  checklistItemText?: string
  isRead: boolean
  createdAt: Date
  updatedAt: Date
}

const NotificationSchema = new Schema<INotification>(
  {
    recipientId: { type: String, required: true, index: true },
    senderId: { type: String, required: true },
    senderName: { type: String, required: true },
    type: { type: String, enum: ['card_assigned', 'checklist_item_assigned'], required: true },
    cardTitle: { type: String, required: true },
    boardTitle: { type: String, required: true },
    boardId: { type: String, required: true },
    cardId: { type: String, required: true },
    checklistItemText: { type: String },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
)

NotificationSchema.index({ recipientId: 1, createdAt: -1 })

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema)
