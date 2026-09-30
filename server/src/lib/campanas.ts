/**
 * CoreDental: campañas a pacientes. A quién le llega (segmento), el texto personalizado y el envío por email.
 * Los pacientes que se dieron de baja (o están inactivos) nunca reciben nada.
 */
import { randomBytes } from "node:crypto";
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Db } from "../db/client.js";
import { campanaEnvios, campanas, cargosPaciente, configAgenda, empresas, eventos, pacientes, pagosPaciente } from "../db/schema.js";
import { r2 } from "./arca/montos.js";
import { hoyAr } from "./cuentas.js";
import { armarEmail } from "./email/plantilla.js";
import { COLOR_DENTAL } from "./email/plataforma.js";
import { enviarEmail } from "./email/servicio.js";
import { telefonoWhatsapp } from "./telefono.js";

export const SEGMENTOS = ["todos", "sin_visita", "cumpleanos", "deudores", "obra_social"] as const;
export type Segmento = (typeof SEGMENTOS)[number];
export const CANALES = ["Email", "WhatsApp"] as const;
export type Canal = (typeof CANALES)[number];

export interface Destinatario {
  id: string;
  nombre: string;
  apellido: string;
  email: string | null;
  telefono: string | null;
  saldo: number;
}

/** Fecha de hace n meses ("aaaa-mm-dd") */
function haceMeses(n: number, hoy = hoyAr()) {
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 10);
}

/** Saldo de cada paciente (lo cargado menos lo pagado) */
async function saldos(db: Db, empresaId: string) {
  const [c, p] = await Promise.all([
    db.select({ id: cargosPaciente.pacienteId, t: sql<number>`sum(${cargosPaciente.importePaciente})::float` }).from(cargosPaciente).where(and(eq(cargosPaciente.empresaId, empresaId), isNull(cargosPaciente.anuladoEn))).groupBy(cargosPaciente.pacienteId),
    db.select({ id: pagosPaciente.pacienteId, t: sql<number>`sum(${pagosPaciente.importe})::float` }).from(pagosPaciente).where(and(eq(pagosPaciente.empresaId, empresaId), isNull(pagosPaciente.anuladoEn))).groupBy(pagosPaciente.pacienteId),
  ]);
  const m = new Map<string, number>();
  for (const x of c) m.set(x.id, Number(x.t));
  for (const x of p) m.set(x.id, (m.get(x.id) ?? 0) - Number(x.t));
  return m;
}

/** Los pacientes del segmento (activos y que aceptan campañas) */
export async function pacientesDelSegmento(db: Db, empresaId: string, segmento: Segmento, parametro: string | null, hoy = hoyAr()): Promise<Destinatario[]> {
  const base = await db
    .select({ id: pacientes.id, nombre: pacientes.nombre, apellido: pacientes.apellido, email: pacientes.email, telefono: pacientes.telefono, fechaNacimiento: pacientes.fechaNacimiento, obraSocialId: pacientes.obraSocialId })
    .from(pacientes)
    .where(and(eq(pacientes.empresaId, empresaId), eq(pacientes.estado, "Activo"), eq(pacientes.recibeCampanas, true)))
    .orderBy(pacientes.apellido, pacientes.nombre);
  const saldo = await saldos(db, empresaId);
  let lista = base;

  if (segmento === "sin_visita") {
    // La última vez que vino: un turno realizado o una prestación. Los que nunca vinieron no cuentan
    const meses = Math.min(36, Math.max(1, Number(parametro) || 6));
    const [turnos, cargos, proximos] = await Promise.all([
      db.select({ id: eventos.pacienteId, f: sql<string>`max(${eventos.fecha})` }).from(eventos).where(and(eq(eventos.empresaId, empresaId), eq(eventos.estado, "Realizado"))).groupBy(eventos.pacienteId),
      db.select({ id: cargosPaciente.pacienteId, f: sql<string>`max(${cargosPaciente.fecha})` }).from(cargosPaciente).where(and(eq(cargosPaciente.empresaId, empresaId), isNull(cargosPaciente.anuladoEn))).groupBy(cargosPaciente.pacienteId),
      // Si ya tiene un turno dado, no hace falta llamarlo
      db.select({ id: eventos.pacienteId }).from(eventos).where(and(eq(eventos.empresaId, empresaId), gte(eventos.fecha, hoy), inArray(eventos.estado, ["Pendiente", "Confirmado"]))),
    ]);
    const ultima = new Map<string, string>();
    for (const x of [...turnos, ...cargos]) if (x.id && (!ultima.has(x.id) || ultima.get(x.id)! < x.f)) ultima.set(x.id, x.f);
    const conTurno = new Set(proximos.map((x) => x.id));
    const limite = haceMeses(meses, hoy);
    lista = base.filter((p) => ultima.has(p.id) && ultima.get(p.id)! < limite && !conTurno.has(p.id));
  } else if (segmento === "cumpleanos") {
    const mes = String(Math.min(12, Math.max(1, Number(parametro) || Number(hoy.slice(5, 7))))).padStart(2, "0");
    lista = base.filter((p) => p.fechaNacimiento?.slice(5, 7) === mes).sort((a, b) => a.fechaNacimiento!.slice(8).localeCompare(b.fechaNacimiento!.slice(8)));
  } else if (segmento === "deudores") {
    lista = base.filter((p) => (saldo.get(p.id) ?? 0) > 0.009);
  } else if (segmento === "obra_social") {
    lista = base.filter((p) => p.obraSocialId === parametro);
  }
  return lista.map((p) => ({ id: p.id, nombre: p.nombre, apellido: p.apellido, email: p.email, telefono: p.telefono, saldo: r2(Math.max(0, saldo.get(p.id) ?? 0)) }));
}

/** Si el paciente tiene cómo recibirla por ese canal */
export const tieneContacto = (d: Destinatario, canal: Canal) => (canal === "Email" ? !!d.email : !!telefonoWhatsapp(d.telefono));

const pesos = (n: number) => `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Reemplaza {nombre}, {apellido}, {consultorio}, {link_turnos} y {saldo} */
export function personalizar(texto: string, d: Pick<Destinatario, "nombre" | "apellido" | "saldo">, extra: { consultorio: string; linkTurnos: string | null }) {
  return texto
    .replace(/\{nombre\}/g, d.nombre)
    .replace(/\{apellido\}/g, d.apellido)
    .replace(/\{consultorio\}/g, extra.consultorio)
    .replace(/\{saldo\}/g, pesos(d.saldo))
    .replace(/\{link_turnos\}/g, extra.linkTurnos ?? "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/** Nombre del consultorio y link de turnos online (si está activo) */
export async function datosConsultorio(app: FastifyInstance, empresaId: string) {
  const [e] = await app.db.select({ razonSocial: empresas.razonSocial, nombreFantasia: empresas.nombreFantasia }).from(empresas).where(eq(empresas.id, empresaId));
  const [c] = await app.db.select({ activa: configAgenda.reservaOnline, codigo: configAgenda.reservaCodigo }).from(configAgenda).where(eq(configAgenda.empresaId, empresaId));
  return { consultorio: e?.nombreFantasia || e?.razonSocial || "", linkTurnos: c?.activa && c.codigo ? `${app.urlDe("dental")}/reservar/${c.codigo}` : null };
}

/** El link para darse de baja de las campañas (el token se crea la primera vez) */
export async function linkDeBaja(app: FastifyInstance, pacienteId: string) {
  const [p] = await app.db.select({ token: pacientes.tokenCampanas }).from(pacientes).where(eq(pacientes.id, pacienteId));
  let token = p?.token;
  if (!token) {
    token = randomBytes(18).toString("base64url");
    await app.db.update(pacientes).set({ tokenCampanas: token }).where(and(eq(pacientes.id, pacienteId), isNull(pacientes.tokenCampanas)));
    const [otra] = await app.db.select({ token: pacientes.tokenCampanas }).from(pacientes).where(eq(pacientes.id, pacienteId));
    token = otra!.token!;
  }
  return `${app.urlDe("dental")}/baja-campanas/${token}`;
}

/** Manda los emails pendientes de una campaña, uno por uno (no frena la pantalla) */
export async function enviarCampana(app: FastifyInstance, campanaId: string) {
  const [c] = await app.db.select().from(campanas).where(eq(campanas.id, campanaId));
  if (!c || c.canal !== "Email") return;
  const { consultorio } = await datosConsultorio(app, c.empresaId);
  const pendientes = await app.db
    .select({ envio: campanaEnvios, nombre: pacientes.nombre })
    .from(campanaEnvios)
    .innerJoin(pacientes, eq(pacientes.id, campanaEnvios.pacienteId))
    .where(and(eq(campanaEnvios.campanaId, campanaId), eq(campanaEnvios.estado, "Pendiente")));
  for (const { envio, nombre } of pendientes) {
    const baja = await linkDeBaja(app, envio.pacienteId);
    const { html, texto } = armarEmail({
      color: COLOR_DENTAL,
      empresa: consultorio,
      saludo: `Hola ${nombre},`,
      parrafos: [envio.texto],
      pie: `${consultorio} · Si no querés recibir más estos emails, entrá acá: ${baja}`,
    });
    const asunto = (c.asunto ?? c.nombre).replace(/\{nombre\}/g, nombre).replace(/\{consultorio\}/g, consultorio).replace(/\{(apellido|saldo|link_turnos)\}/g, "").trim();
    const r = await enviarEmail(app, { empresaId: c.empresaId, para: envio.destino, asunto, html, texto: `${texto}\n\nPara no recibir más estos emails: ${baja}`, tipo: "campana", refId: c.id, usuarioId: c.usuarioId, automatico: true });
    await app.db.update(campanaEnvios).set({ estado: r.estado, error: r.error, enviadoEn: new Date() }).where(eq(campanaEnvios.id, envio.id));
  }
}
