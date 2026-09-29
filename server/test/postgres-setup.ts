import { execFileSync, execSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";

/**
 * `npm run test:postgres`: levanta un PostgreSQL real (embebido) y corre toda la batería de API contra él.
 * Cada archivo de pruebas crea su propia base (ver helpers.ts) y la borra al terminar.
 */
export default async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "prexacode-pg-"));
  const puerto = 55000 + Math.floor(Math.random() * 1000);
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: "postgres",
    password: "postgres",
    port: puerto,
    persistent: false,
    // Sin procesos auxiliares de E/S (PostgreSQL 18): en Windows quedaban huérfanos al apagar
    postgresFlags: ["-c", "io_method=sync"],
    // UTF-8 como en producción (en Windows, initdb usaría la codificación del sistema y los emojis no entrarían)
    initdbFlags: ["--encoding=UTF8", "--locale=C"],
    onLog: () => {},
  });
  await pg.initialise();
  await pg.start();
  process.env.TEST_PG_URL = `postgres://postgres:postgres@localhost:${puerto}`;

  return async () => {
    let pid: number | null = null;
    try {
      pid = Number(readFileSync(join(dir, "postmaster.pid"), "utf8").split(/\r?\n/)[0]!.trim());
    } catch {
      pid = null;
    }
    // 1) Apagado ordenado con la herramienta de PostgreSQL (termina también los procesos hijos)
    try {
      const require = createRequire(import.meta.url);
      const bin = join(dirname(require.resolve(`@embedded-postgres/${process.platform === "win32" ? "windows" : process.platform}-x64/package.json`)), "native", "bin");
      const pgCtl = join(bin, process.platform === "win32" ? "pg_ctl.exe" : "pg_ctl");
      if (existsSync(pgCtl)) execFileSync(pgCtl, ["stop", "-D", dir, "-m", "fast", "-w", "-t", "20"], { stdio: "ignore" });
    } catch {
      // si falla, se fuerza abajo
    }
    await pg.stop().catch(() => {});
    // 2) Si algo quedó vivo, se fuerza por PID
    if (pid) {
      try {
        if (process.platform === "win32") execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore" });
        else process.kill(pid, "SIGKILL");
      } catch {
        // ya había terminado
      }
    }
    rmSync(dir, { recursive: true, force: true });
  };
}
