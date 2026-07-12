import 'dotenv/config'
import { createServer } from 'http'
import express from 'express'
import cors from 'cors'
import { Server as SocketIOServer } from 'socket.io'
import { Client, Account } from 'node-appwrite'
import { connectDB } from './config/db'
import { env } from './config/env'
import { initIO } from './config/socket'
import { publicRateLimit, authenticatedRateLimit } from './middleware/rateLimit'
import { errorHandler } from './middleware/errorHandler'
import { authMiddleware } from './middleware/auth'
import healthRouter from './routes/health'
import authRouter from './routes/auth'
import usersRouter from './routes/users'
import invitationsRouter from './routes/invitations'
import boardsRouter from './routes/boards'
import adminRouter from './routes/admin'
import notificationsRouter from './routes/notifications'

const app = express()
const httpServer = createServer(app)

// ── Socket.IO ────────────────────────────────────────────────────────────────
export const io = new SocketIOServer(httpServer, {
  cors: {
    origin: env.ALLOWED_ORIGINS.split(','),
    credentials: true,
  },
})

initIO(io)

// Auth middleware socket.io : vérifie le JWT Appwrite passé dans socket.handshake.auth.token
// Fallback sur socket.handshake.query.token pour les clients mobiles (iOS SocketIO connectParams)
io.use(async (socket, next) => {
  const token = (socket.handshake.auth?.token ?? socket.handshake.query?.token) as string | undefined
  if (!token) return next(new Error('UNAUTHORIZED'))
  try {
    // Client jetable par connexion — ne jamais réutiliser un Client porteur de JWT.
    const client = new Client()
      .setEndpoint(env.APPWRITE_ENDPOINT)
      .setProject(env.APPWRITE_PROJECT_ID)
      .setJWT(token)
    const account = await new Account(client).get()
    socket.data.authId = account.$id
    next()
  } catch {
    next(new Error('UNAUTHORIZED'))
  }
})

// Gestion des rooms de board
io.on('connection', (socket) => {
  // Auto-join user room for personal notifications
  const authId = socket.data.authId as string | undefined
  if (authId) {
    socket.join(`user:${authId}`)
  }

  socket.on('board:join', (boardId: unknown) => {
    if (typeof boardId === 'string' && boardId.trim()) {
      socket.join(`board:${boardId}`)
    }
  })

  socket.on('board:leave', (boardId: unknown) => {
    if (typeof boardId === 'string' && boardId.trim()) {
      socket.leave(`board:${boardId}`)
    }
  })
})

// ── Core middleware ───────────────────────────────────────────────────────────
app.use(cors({ origin: env.ALLOWED_ORIGINS.split(','), credentials: true }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// ── Public routes (no auth) ───────────────────────────────────────────────────
app.use('/api', publicRateLimit, healthRouter)

// ── Authenticated routes ──────────────────────────────────────────────────────
app.use('/api', authenticatedRateLimit, authMiddleware)

app.use('/api/auth', authRouter)
app.use('/api/users', usersRouter)
app.use('/api/invitations', invitationsRouter)
app.use('/api/boards', boardsRouter)
app.use('/api/admin', adminRouter)
app.use('/api/notifications', notificationsRouter)

// ── Global error handler ─────────────────────────────────────────────────────
app.use(errorHandler)

// ── Start ────────────────────────────────────────────────────────────────────
async function start(): Promise<void> {
  await connectDB()

  httpServer.listen(Number(env.PORT), () => {
    console.log(`🚀 Server running on port ${env.PORT} [${env.NODE_ENV}]`)
    console.log(`   Health: http://localhost:${env.PORT}/api/health`)
  })
}

start()
