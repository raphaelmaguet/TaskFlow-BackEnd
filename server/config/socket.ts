import { Server as SocketIOServer } from 'socket.io'

let _io: SocketIOServer | null = null

/**
 * Initialise le singleton Socket.IO.
 * Doit être appelé une seule fois dans server/index.ts après la création de l'instance.
 */
export function initIO(io: SocketIOServer): void {
  _io = io
}

/**
 * Retourne le singleton Socket.IO.
 * Lance une erreur si initIO n'a pas été appelé avant.
 */
export function getIO(): SocketIOServer {
  if (!_io) throw new Error('Socket.IO not initialized — call initIO() first')
  return _io
}
