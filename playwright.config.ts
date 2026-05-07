import { defineConfig } from '@playwright/test';
import path from 'node:path';

const testDb = path.resolve('runtime/playwright.sqlite');

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:4194' },
  webServer: {
    command: `rm -f ${testDb} ${testDb}-wal ${testDb}-shm && PORT=4194 TASKFLOWY_DB_PATH=${testDb} NODE_ENV=production npm start`,
    url: 'http://127.0.0.1:4194/api/health',
    reuseExistingServer: false,
    timeout: 30000
  }
});
