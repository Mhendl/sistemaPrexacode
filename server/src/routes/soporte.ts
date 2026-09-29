import { and, asc, count, desc, eq, inArray, type SQL } from "drizzle-orm";
import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { adminsPlataforma, empresas, ticketMensajes, tickets, usuarios } from "../db/schema.js";
import { requireAuth } from "../lib/auth.js";
import { notFound, parse } from "../lib/errors.js";

export const CATEGORIAS_TICKET = ["Problema", "Consulta", "Facturación y pagos", "Sugerencia"] as const;

const idSchema = z.object({ id: z.string().uuid("Id inválido") });
const textoSchema = z.string().trim().min(2, "Escribí el mensaje").max(5000, "Máximo 5000 caracteres");

const escapar = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Aviso por email (si hay servidor de correo): nunca frena el pedido si falla */
export async function avisarPorEmail(app: FastifyInstance, para: string[], asunto: string, texto: string, link: string) {
  for (const destino of para) {
    try {
      await app.cartero.enviar(
        { tipo: "plataforma" },
        {
          de: app.emailRemitente,
          para: destino,
          asunto,
          texto: `${texto}\n\n${link}`,
          html: `<p>${escapar(texto).replace(/\n/g, "<br>")}</p><p><a href="${escapar(link)}">Ver el ticket</a></p>`,
        },
      );
    } catch {
      // sin servidor de correo o caído: el ticket igual queda en el panel
    }
  }
}

/** Mensajes de un ticket, del más viejo al más nuevo */
export const mensajesDe = (app: FastifyInstance, ticketId: string) =>
  app.db.select().from(ticketMensajes).where(eq(ticketMensajes.ticketId, ticketId)).orderBy(asc(ticketMensajes.createdAt));

/**
 * Soporte: las empresas piden ayuda a Prexacode y siguen la conversación.
 * El administrador de la empresa ve todos los pedidos de su empresa; el resto, solo los propios.
 * Se puede usar aunque la suscripción esté vencida (justamente, para consultar).
 */
export const soporteRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAuth);

  const alcance = (req: FastifyRequest): SQL[] => {
    const f: SQL[] = [eq(tickets.empresaId, req.user.empresaId)];
    if (!req.user.esAdmin) f.push(eq(tickets.usuarioId, req.user.sub));
    return f;
  };
  async function ticketDe(req: FastifyRequest, id: string) {
    const [t] = await app.db.select().from(tickets).where(and(eq(tickets.id, id), ...alcance(req)));
    if (!t) throw notFound("Pedido no encontrado");
    return t;
  }

  app.get("/", async (req) => {
    const lista = await app.db
      .select({ t: tickets, usuario: usuarios.nombre })
      .from(tickets)
      .leftJoin(usuarios, eq(usuarios.id, tickets.usuarioId))
      .where(and(...alcance(req)))
      .orderBy(desc(tickets.updatedAt))
      .limit(200);
    const ids = lista.map((x) => x.t.id);
    const n = ids.length ? await app.db.select({ id: ticketMensajes.ticketId, n: count() }).from(ticketMensajes).where(inArray(ticketMensajes.ticketId, ids)).groupBy(ticketMensajes.ticketId) : [];
    const cant = new Map(n.map((x) => [x.id, Number(x.n)]));
    return lista.map(({ t, usuario }) => ({ ...t, usuario, mensajes: cant.get(t.id) ?? 0 }));
  });

  app.post("/", { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } }, async (req, reply) => {
    const d = parse(
      z.object({
        asunto: z.string().trim().min(3, "Contá en pocas palabras qué pasa").max(120, "Máximo 120 caracteres"),
        categoria: z.enum(CATEGORIAS_TICKET, { errorMap: () => ({ message: "Elegí el tipo de pedido" }) }),
        mensaje: textoSchema,
        pantalla: z.string().trim().max(300).optional(),
      }),
      req.body,
    );
    const [u] = await app.db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, req.user.sub));
    const t = await app.db.transaction(async (tx) => {
      const [t] = await tx
        .insert(tickets)
        .values({ empresaId: req.user.empresaId, usuarioId: req.user.sub, asunto: d.asunto, categoria: d.categoria, pantalla: d.pantalla ?? null })
        .returning();
      await tx.insert(ticketMensajes).values({ ticketId: t!.id, autor: "cliente", nombre: u!.nombre, texto: d.mensaje });
      return t!;
    });
    // Aviso a quienes administran Prexacode
    const [e] = await app.db.select({ razonSocial: empresas.razonSocial }).from(empresas).where(eq(empresas.id, req.user.empresaId));
    const admins = await app.db.select({ email: adminsPlataforma.email }).from(adminsPlataforma).where(eq(adminsPlataforma.activo, true));
    void avisarPorEmail(
      app,
      admins.map((a) => a.email),
      `Nuevo pedido de soporte #${t.numero}: ${d.asunto}`,
      `${e?.razonSocial ?? "Una empresa"} (${u!.nombre}) escribió:\n\n${d.mensaje}`,
      `${app.appUrl}/admin/soporte/${t.id}`,
    );
    return reply.status(201).send({ ...t, mensajes: await mensajesDe(app, t.id) });
  });

  app.get("/:id", async (req) => {
    const { id } = parse(idSchema, req.params);
    const t = await ticketDe(req, id);
    if (t.sinLeerCliente && t.usuarioId === req.user.sub) await app.db.update(tickets).set({ sinLeerCliente: false }).where(eq(tickets.id, id));
    return { ...t, sinLeerCliente: false, mensajes: await mensajesDe(app, id) };
  });

  app.post("/:id/mensajes", async (req, reply) => {
    const { id } = parse(idSchema, req.params);
    const { texto } = parse(z.object({ texto: textoSchema }), req.body);
    const t = await ticketDe(req, id);
    const [u] = await app.db.select({ nombre: usuarios.nombre }).from(usuarios).where(eq(usuarios.id, req.user.sub));
    await app.db.insert(ticketMensajes).values({ ticketId: id, autor: "cliente", nombre: u!.nombre, texto });
    // Si estaba cerrado o respondido, vuelve a quedar esperando a soporte
    await app.db.update(tickets).set({ estado: "Abierto", sinLeerSoporte: true, updatedAt: new Date() }).where(eq(tickets.id, id));
    return reply.status(201).send({ ...t, estado: "Abierto", mensajes: await mensajesDe(app, id) });
  });

  app.post("/:id/cerrar", async (req) => {
    const { id } = parse(idSchema, req.params);
    await ticketDe(req, id);
    const [t] = await app.db.update(tickets).set({ estado: "Cerrado", updatedAt: new Date() }).where(eq(tickets.id, id)).returning();
    return t;
  });
};
