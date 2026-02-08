import { defineConfig } from "vitest/config";
import tsconfig from "./tsconfig.json" with { type: "json" };

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
  },
  resolve: {
    extensions: [".ts"],
  },
  esbuild: {
    target: (tsconfig as { compilerOptions?: { target?: string } }).compilerOptions?.target ?? "ES2022",
  },
});
