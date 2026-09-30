import { readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Todo paquete que usa el servidor tiene que estar en "dependencies": en producción no se instalan las devDependencies.
 * (Pasó una vez con mailparser: andaba en las pruebas y en producción no arrancaba.)
 */
describe("dependencias de producción", () => {
  it("cada import del servidor está en dependencies", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { dependencies: Record<string, string> };
    const archivos: string[] = [];
    const recorrer = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const ruta = join(dir, f);
        if (statSync(ruta).isDirectory()) recorrer(ruta);
        else if (f.endsWith(".ts")) archivos.push(ruta);
      }
    };
    recorrer(fileURLToPath(new URL("../src", import.meta.url)));
    expect(archivos.length).toBeGreaterThan(50);
    const faltan = new Set<string>();
    for (const a of archivos) {
      const codigo = readFileSync(a, "utf8");
      for (const m of codigo.matchAll(/^\s*import\s+(?!type\b)[^'"]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/gm)) {
        const mod = m[1] ?? m[2]!;
        if (mod.startsWith(".") || mod.startsWith("node:") || builtinModules.includes(mod)) continue;
        const nombre = mod.startsWith("@") ? mod.split("/").slice(0, 2).join("/") : mod.split("/")[0]!;
        if (!pkg.dependencies[nombre]) faltan.add(`${nombre} (${a.split(/[\\/]src[\\/]/)[1]})`);
      }
    }
    expect([...faltan]).toEqual([]);
  });
});
