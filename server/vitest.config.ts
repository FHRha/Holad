import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    fileParallelism: false,
    env: {
      DATABASE_PATH: ':memory:',
      PORT: '0',
      NODE_ENV: 'test',
    },
  },
});
