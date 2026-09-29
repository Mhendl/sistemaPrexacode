import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Cada archivo levanta su propia base PGlite en memoria: con varias en paralelo el arranque puede tardar
    hookTimeout: 30_000,
    testTimeout: 20_000,
    maxWorkers: 4,
  },
});
