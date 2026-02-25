import mongoose from 'mongoose'
import { env } from './env'

let isConnected = false

export async function connectDB(): Promise<void> {
  if (isConnected) return

  try {
    await mongoose.connect(env.MONGO_URI)
    isConnected = true
    console.log('✅ MongoDB connected')
  } catch (error) {
    console.error('❌ MongoDB connection error:', error)
    process.exit(1)
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  await mongoose.connection.close()
  console.log('MongoDB connection closed')
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await mongoose.connection.close()
  console.log('MongoDB connection closed')
  process.exit(0)
})
