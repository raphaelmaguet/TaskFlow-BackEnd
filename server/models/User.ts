import mongoose, { Document, Schema } from 'mongoose'

export interface IUser extends Document {
  authId: string
  email: string
  name: string
  avatarUrl?: string
  subscriptionTier: 'free' | 'pro'
  stripeCustomerId?: string
  isActive: boolean
  isAdmin: boolean
  createdAt: Date
  updatedAt: Date
}

const UserSchema = new Schema<IUser>(
  {
    authId: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true, default: '' },
    avatarUrl: { type: String },
    subscriptionTier: { type: String, enum: ['free', 'pro'], default: 'free' },
    stripeCustomerId: { type: String },
    isActive: { type: Boolean, default: true },
    isAdmin: { type: Boolean, default: false },
  },
  { timestamps: true }
)

UserSchema.index({ authId: 1 }, { unique: true })
UserSchema.index({ email: 1 }, { unique: true })

export const User = mongoose.model<IUser>('User', UserSchema)
