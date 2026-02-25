import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/test/**/*.test.ts'],
    // Fournir les variables d'env requises par env.ts avant tout import
    env: {
      NODE_ENV: 'test',
      MONGO_URI: 'mongodb://127.0.0.1:27017/taskflow_test_placeholder',
      SUPABASE_URL: 'https://placeholder.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'placeholder_service_role_key_for_tests',
      ALLOWED_ORIGINS: 'http://localhost:5173',
    },
  },
})
