import 'dotenv/config'
import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173'),
  // Email (SMTP) — optionnel en dev : le lien s'affiche dans les logs si absent
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().default('587'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().default('TaskFlow <noreply@taskflow.app>'),
  APP_URL: z.string().default('http://localhost:5173'),
})

const result = EnvSchema.safeParse(process.env)

if (!result.success) {
  console.error('❌ Invalid environment variables:')
  console.error(JSON.stringify(result.error.flatten().fieldErrors, null, 2))
  process.exit(1)
}

export const env = result.data
