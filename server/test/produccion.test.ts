import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validarProduccion, type config as Config } from "../src/config.js";
import { rutaSegura } from "../src/lib/web.js";
import { crearApp, type TestApp } from "./helpers.js";

describe("servir la web compilada", () => {
  let app: TestApp;
  let cerrar: () => Promise<void>;
  let base: string;
  let raiz: string;

  beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), "web-"));
    raiz = join(base, "dist");
    mkdirSync(join(raiz, "assets"), { recursive: true });
    writeFileSync(join(raiz, "index.html"), "<!doctype html><title>Prexacode</title><div id=root></div>");
    writeFileSync(join(raiz, "assets", "app-abc123.js"), "console.log('app')");
    writeFileSync(join(raiz, "favicon.svg"), "<svg></svg>");
    writeFileSync(join(raiz, ".env"), "SECRETO=dentro");
    writeFileSync(join(base, "secreto.txt"), "SECRETO=afuera");
    ({ app, cerrar } = await crearApp({ web: raiz, produccion: true, appUrl: "https://app.prexacode.test" }));
  });
  afterAll(async () => {
    await cerrar();
    rmSync(base, { recursive: true, force: true });
  });

  const get = (url: string, method: "GET" | "HEAD" | "POST" = "GET") => app.inject({ method, url });

  it("sirve la app: index.html para cualquier ruta de la web, sin caché", async () => {
    for (const url of ["/", "/clientes", "/clientes/7c9e6679-7425-40de-944b-e07fc1f90ae7", "/ver/token-publico-123", "/configuracion?tab=plan"]) {
      const r = await get(url);
      expect(r.statusCode, url).toBe(200);
      expect(r.headers["content-type"]).toContain("text/html");
      expect(r.headers["cache-control"]).toBe("no-cache");
      expect(r.body).toContain("<title>Prexacode</title>");
    }
  });

  it("los archivos con hash se cachean un año; los que faltan son 404", async () => {
    const js = await get("/assets/app-abc123.js");
    expect(js.statusCode).toBe(200);
    expect(js.headers["content-type"]).toContain("text/javascript");
    expect(js.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(js.body).toBe("console.log('app')");
    expect((await get("/favicon.svg")).headers["content-type"]).toBe("image/svg+xml");
    expect((await get("/assets/no-existe.js")).statusCode).toBe(404);
  });

  it("la API no cae en la web", async () => {
    const r = await get("/api/no-existe");
    expect(r.statusCode).toBe(404);
    expect(r.json()).toEqual({ error: "No encontrado" });
    expect((await get("/api/health")).json()).toEqual({ ok: true });
    expect((await get("/cualquier-cosa", "POST")).statusCode).toBe(404);
  });

  it("rechaza intentos de leer archivos fuera de la web o archivos ocultos", async () => {
    const ataques = ["/../secreto.txt", "/%2e%2e/secreto.txt", "/..%2fsecreto.txt", "/%2e%2e%2fsecreto.txt", "/assets/..%5c..%5csecreto.txt", "/%2e%2e%5csecreto.txt", "/.env", "/%2eenv", "/assets/%00.js", "/%E0%A4%A"];
    for (const url of ataques) {
      const r = await get(url);
      expect(r.body, url).not.toContain("SECRETO");
      expect([400, 404], url).toContain(r.statusCode);
    }
    // La función también, por si se usa directo
    expect(rutaSegura(raiz, "/../secreto.txt")).toBeNull();
    expect(rutaSegura(raiz, "/assets/app-abc123.js")).toBe(join(raiz, "assets", "app-abc123.js"));
  });

  it("encabezados de seguridad: CSP, anti-clickjacking, HTTPS obligatorio, sin sniffing", async () => {
    const r = await get("/");
    expect(r.headers["content-security-policy"]).toContain("default-src 'self'");
    expect(r.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(r.headers["content-security-policy"]).toContain("script-src 'self'");
    expect(r.headers["strict-transport-security"]).toContain("max-age=31536000");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    expect(r.headers["x-powered-by"]).toBeUndefined();
    // CORS solo para el dominio propio
    const cors = await app.inject({ method: "OPTIONS", url: "/api/health", headers: { origin: "https://sitio-malo.com", "access-control-request-method": "GET" } });
    expect(cors.headers["access-control-allow-origin"]).not.toBe("https://sitio-malo.com");
    const propio = await app.inject({ method: "OPTIONS", url: "/api/health", headers: { origin: "https://app.prexacode.test", "access-control-request-method": "GET" } });
    expect(propio.headers["access-control-allow-origin"]).toBe("https://app.prexacode.test");
  });
});

describe("configuración de producción", () => {
  const base = { isProduction: true, databaseUrl: "postgres://u:p@db:5432/prexacode", jwtSecret: "x".repeat(48), secretsKey: "y".repeat(48), appUrl: "https://app.prexacode.com.ar", modoPruebas: false } as unknown as typeof Config;

  it("completa: arranca", () => {
    const antes = process.env.APP_URL;
    process.env.APP_URL = "https://app.prexacode.com.ar";
    try {
      expect(validarProduccion(base)).toEqual([]);
    } finally {
      process.env.APP_URL = antes;
    }
  });

  it("incompleta: dice exactamente qué falta", () => {
    const antes = process.env.APP_URL;
    delete process.env.APP_URL;
    try {
      const faltan = validarProduccion({ ...base, databaseUrl: "./.data/pglite", jwtSecret: "dev-secret-cambiar-en-produccion", secretsKey: undefined, appUrl: "http://localhost:5173", modoPruebas: true });
      expect(faltan).toHaveLength(5);
      expect(faltan.join(" ")).toContain("DATABASE_URL");
      expect(faltan.join(" ")).toContain("SECRETS_KEY");
      expect(faltan.join(" ")).toContain("APP_URL");
      expect(faltan.join(" ")).toContain("PREXACODE_PRUEBAS");
    } finally {
      process.env.APP_URL = antes;
    }
    expect(validarProduccion({ ...base, isProduction: false, databaseUrl: "x" })).toEqual([]);
  });
});
