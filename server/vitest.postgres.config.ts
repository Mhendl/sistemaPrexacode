import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config.js";

/** Misma batería de pruebas, contra PostgreSQL real en lugar de PGlite */
export default mergeConfig(
  base,
  defineConfig({
    test: {
      globalSetup: ["./test/postgres-setup.ts"],
    },
  }),
);
