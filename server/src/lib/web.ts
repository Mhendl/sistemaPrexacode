import { createReadStream, readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";

/**
 * Sirve la web compilada (dist/) desde la API: una sola pieza para desplegar.
 * A propósito es chico y estricto: solo archivos dentro de la carpeta, sin listados de directorios,
 * y cualquier intento de salir de la carpeta (.., barras codificadas, barras invertidas, bytes nulos) se rechaza.
 */

const TIPOS: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

/** Ruta del archivo dentro de la carpeta, o null si el pedido es sospechoso o sale de la carpeta */
export function rutaSegura(raiz: string, url: string): string | null {
  const camino = url.split("?")[0]!.split("#")[0]!;
  let decodificado: string;
  try {
    decodificado = decodeURIComponent(camino);
  } catch {
    return null;
  }
  if (decodificado.includes("\0") || decodificado.includes("\\") || /(^|\/)\.\.?(\/|$)/.test(decodificado)) return null;
  // Nada de archivos ocultos (.env, .git…)
  if (/(^|\/)\./.test(decodificado)) return null;
  const base = resolve(raiz);
  const destino = resolve(join(base, decodificado));
  if (destino !== base && !destino.startsWith(base + sep)) return null;
  return destino;
}

async function enviar(reply: FastifyReply, archivo: string, cache: string) {
  const tipo = TIPOS[extname(archivo).toLowerCase()] ?? "application/octet-stream";
  const info = await stat(archivo);
  return reply.header("Content-Type", tipo).header("Content-Length", info.size).header("Cache-Control", cache).header("X-Content-Type-Options", "nosniff").send(createReadStream(archivo));
}

/**
 * index.html con la marca de CoreDental (título y descripción): lo que se ve en la pestaña antes de que cargue
 * la app y en la vista previa de un link compartido por WhatsApp o redes.
 */
export function indiceDental(html: string) {
  const titulo = "CoreDental · Gestión odontológica";
  const descripcion = "Historia clínica, odontograma, turnos online, obras sociales, caja y facturación ARCA para tu consultorio. 14 días gratis.";
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${titulo}</title>`)
    .replace(/(<meta name="description" content=")[^"]*"/, `$1${descripcion}"`)
    .replace(/(<meta property="og:title" content=")[^"]*"/, `$1${titulo}"`)
    .replace(/(<meta property="og:description" content=")[^"]*"/, `$1${descripcion}"`);
}

export async function servirWeb(app: FastifyInstance, raiz: string) {
  const indice = join(resolve(raiz), "index.html");
  let html: { gestion: string; dental: string } | null = null;
  const indiceDe = (host: string | undefined) => {
    html ??= (() => {
      const base = readFileSync(indice, "utf8");
      return { gestion: base, dental: indiceDental(base) };
    })();
    return /coredental/i.test(host ?? "") ? html.dental : html.gestion;
  };

  app.setNotFoundHandler(async (req, reply) => {
    // La API nunca cae en la web
    if (req.url.startsWith("/api/") || req.url === "/api") return reply.status(404).send({ error: "No encontrado" });
    if (req.method !== "GET" && req.method !== "HEAD") return reply.status(404).send({ error: "No encontrado" });

    const archivo = rutaSegura(raiz, req.url);
    if (archivo === null) return reply.status(400).send({ error: "Pedido inválido" });
    try {
      const info = await stat(archivo);
      if (info.isFile()) {
        // Los archivos con hash (assets/) no cambian nunca: caché de un año. El resto, se revalida.
        const inmutable = archivo.includes(`${sep}assets${sep}`);
        return enviar(reply, archivo, inmutable ? "public, max-age=31536000, immutable" : "no-cache");
      }
    } catch {
      // no existe: es una ruta de la app
    }
    // Rutas de la app (React Router): siempre index.html. Un archivo que falta (con extensión) es 404.
    if (extname(archivo)) return reply.status(404).send({ error: "No encontrado" });
    return reply.header("Content-Type", TIPOS[".html"]).header("Cache-Control", "no-cache").header("X-Content-Type-Options", "nosniff").send(indiceDe(req.headers.host));
  });
}
