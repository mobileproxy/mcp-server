import { defineConfig } from 'vitest/config';

/* Only this checkout's tests: Claude Code worktrees under .claude/ carry their own copies. */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
