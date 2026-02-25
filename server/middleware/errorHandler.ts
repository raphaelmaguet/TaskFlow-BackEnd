import { Request, Response, NextFunction } from 'express'

export interface AppError extends Error {
  statusCode?: number
  code?: string
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? 500
  const code = err.code ?? 'INTERNAL_ERROR'

  if (statusCode >= 500) {
    console.error(`[Error] ${statusCode} ${code}:`, err.message, err.stack)
  }

  res.status(statusCode).json({
    error: statusCode === 500 ? 'An unexpected error occurred' : err.message,
    code,
  })
}
