import { execSync } from "node:child_process";
import type { FullConfig, Reporter, Suite, TestCase, TestResult } from "@playwright/test/reporter";

/**
 * Vigilante de cierre.
 *
 * En Windows, Playwright a veces crea un proceso de prueba justo cuando termina la última prueba
 * (condición de carrera en su dispatcher) y después se queda esperándolo para siempre.
 * Si todas las pruebas ya terminaron y la corrida no cierra sola en unos segundos, este reporter
 * informa el resultado real, apaga los servidores de prueba y sale con el código correcto.
 */
const ESPERA_MS = 15_000;
const PUERTOS = [5175];

function liberarPuertos() {
  if (process.platform !== "win32") return;
  try {
    const salida = execSync("netstat -ano", { encoding: "utf8" });
    const pids = new Set<string>();
    for (const linea of salida.split(/\r?\n/)) {
      if (!/LISTENING/.test(linea)) continue;
      if (!PUERTOS.some((p) => new RegExp(`:${p}\\s`).test(linea))) continue;
      const pid = linea.trim().split(/\s+/).pop();
      if (pid && pid !== "0") pids.add(pid);
    }
    for (const pid of pids) execSync(`taskkill /T /F /PID ${pid}`, { stdio: "ignore" });
  } catch {
    // si no se puede, no es grave: Playwright los mata al salir
  }
}

export default class CierreReporter implements Reporter {
  private total = 0;
  private terminadas = new Set<string>();
  private fallidas = new Set<string>();
  private reloj?: NodeJS.Timeout;

  onBegin(_config: FullConfig, suite: Suite) {
    this.total = suite.allTests().length;
  }

  onTestEnd(test: TestCase, result: TestResult) {
    // Con reintentos, cuenta cuando ya no queda otro intento
    const quedanIntentos = result.status !== "passed" && result.status !== "skipped" && result.retry < test.retries;
    if (quedanIntentos) return;
    this.terminadas.add(test.id);
    if (test.outcome() === "unexpected") this.fallidas.add(test.id);
    else this.fallidas.delete(test.id);

    if (this.terminadas.size === this.total && !this.reloj) {
      this.reloj = setTimeout(() => {
        const ok = this.total - this.fallidas.size;
        console.log(`\n[cierre] Terminaron las ${this.total} pruebas (${ok} bien, ${this.fallidas.size} con falla) pero Playwright no cerró: se fuerza la salida.`);
        liberarPuertos();
        process.exit(this.fallidas.size ? 1 : 0);
      }, ESPERA_MS);
      this.reloj.unref();
    }
  }

  onEnd() {
    if (this.reloj) clearTimeout(this.reloj);
  }

  printsToStdio() {
    return false;
  }
}
