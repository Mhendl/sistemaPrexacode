import { defineConfig } from "@playwright/test";

// En Windows, lo que Playwright captura al fallar una prueba (foto de la página, captura de pantalla)
// a veces deja trabado el cierre del navegador varios minutos. El error en la terminal alcanza.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";

import { fileURLToPath } from "node:url";

const PORT = 5175;

/**
 * Pruebas de punta a punta contra el servidor TAL COMO VA A PRODUCCIÓN:
 * web compilada (vite build) + API compilada (tsc) en un solo proceso de node, con los encabezados de seguridad.
 * Cada corrida arranca con una base en memoria vacía.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  globalTimeout: 25 * 60_000, // en Windows a veces un worker queda colgado al cerrar: mejor cortar que esperar para siempre
  expect: { timeout: 7_000 },
  fullyParallel: true,
  workers: 4,
  reporter: [["list"], ["./e2e/cierre-reporter.ts"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "chrome", // usa el Chrome instalado, no descarga navegadores
    locale: "es-AR",
    trace: "off", // en Windows, grabar trazas al fallar dejaba procesos colgados; alcanza con la captura y el error
    screenshot: "off",
    // Si algo no aparece, que falle enseguida con el motivo (en vez de esperar hasta el límite de la prueba)
    actionTimeout: 15_000,
  },
  webServer: {
    command: "npx vite build && npm --prefix server run build && npm --prefix server run start",
    url: `http://localhost:${PORT}/api/health`,
    env: {
      PORT: String(PORT),
      DATABASE_URL: "memory://",
      JWT_SECRET: "e2e-secret",
      APP_URL: `http://localhost:${PORT}`,
      SERVIR_WEB: fileURLToPath(new URL("./dist", import.meta.url)),
      PREXACODE_PRUEBAS: "1",
      TIPO_CAMBIO_USD: "1000",
      ADMIN_EMAIL: "admin@prexacode.test",
      ADMIN_PASSWORD: "clave-panel-e2e-123",
    },
    reuseExistingServer: !!process.env.PW_REUSE, // PW_REUSE=1 reusa un servidor ya levantado (depuración)
    timeout: 180_000,
  },
});
