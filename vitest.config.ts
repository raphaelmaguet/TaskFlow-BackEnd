import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/test/**/*.test.ts'],
    // Fournir les variables d'env requises par env.ts avant tout import
    env: {
      NODE_ENV: 'test',
      MONGO_URI: 'mongodb://127.0.0.1:27017/taskflow_test_placeholder',
      APPWRITE_ENDPOINT: 'https://placeholder.appwrite.io/v1',
      APPWRITE_PROJECT_ID: 'placeholder_project_id',
      APPWRITE_API_KEY: 'placeholder_api_key_for_tests',
      ALLOWED_ORIGINS: 'http://localhost:5173',
    },
  },
})
