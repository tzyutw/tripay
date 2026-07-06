import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["supabase/functions/__tests__/**/*.test.ts"] },
});
