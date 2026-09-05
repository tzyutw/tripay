import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

/* 實作-A2-②　兩個 project：
   - edge：既有的 supabase function 測試，node 環境，**不要動它**
   - ui：實作-B／C 要用的 React render 環境（jsdom）
   兩個都要跑得到——只跑其中一個等於少了一半的網。 */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    projects: [
      {
        test: {
          name: "edge",
          include: ["supabase/functions/__tests__/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        plugins: [react()],
        resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
        test: {
          name: "ui",
          include: ["src/**/*.test.tsx", "src/**/*.test.ts"],
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
          globals: true,
        },
      },
    ],
  },
});
