/**
 * CoreDental: avisos de turnos a los pacientes.
 *  - Email al darle el turno y recordatorio automático antes (si el consultorio lo activa)
 *  - Texto listo para mandar por WhatsApp (con un clic, desde el celular o la compu)
 *  - Link único para que el paciente confirme o cancele sin usuario
 */
import { randomBytes } from "node:crypto";
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { agendaRecursos, configAgenda, empresas, eventos, pacientes } from "../db/schema.js";
import { hoyAr } from "./cuentas.js";
import { armarEmail } from "./email/plantilla.js";
import { COLOR_DENTAL } from "./email/plataforma.js";
import { enviarEmail } from "./email/servicio.js";
import { sumarDias } from "./suscripcion.js";
import { telefonoWhatsapp } from "./telefono.js";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "martes 6 de octubre a las 10:30" */
export function cuandoEs(fecha: string, hora: string) {
  const d = new Date(`${fecha}T12:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} a las ${hora}`;
}

/** Fecha y hora de Argentina ahora ("aaaa-mm-ddTHH:MM") */
export const ahoraAr = (ahora = Date.now()) => new Date(ahora - 3 * 3600_000).toISOString().slice(0, 16);

/** El link de confirmación del turno (se crea la primera vez que hace falta) */
export async function tokenDeTurno(app: FastifyInstance, eventoId: string): Promise<string> {
  const [ev] = await app.db.select({ token: eventos.confirmacionToken }).from(eventos).where(eq(eventos.id, eventoId));
  if (ev?.token) return ev.token;
  const token = randomBytes(18).toString("base64url");
  const [r] = await app.db.update(eventos).set({ confirmacionToken: token }).where(and(eq(eventos.id, eventoId), isNull(eventos.confirmacionToken))).returning({ token: eventos.confirmacionToken });
  if (r?.token) return r.token;
  const [otro] = await app.db.select({ token: eventos.confirmacionToken }).from(eventos).where(eq(eventos.id, eventoId));
  return otro!.token!;
}

/** Todo lo necesario para avisarle al paciente */
export async function datosDelTurno(app: FastifyInstance, eventoId: string) {
  const [t] = await app.db
    .select({
      id: eventos.id,
      empresaId: eventos.empresaId,
      fecha: eventos.fecha,
      inicio: eventos.inicio,
      estado: eventos.estado,
      tipo: eventos.tipo,
      lugar: eventos.lugar,
      profesional: agendaRecursos.nombre,
      paciente: { id: pacientes.id, nombre: pacientes.nombre, apellido: pacientes.apellido, email: pacientes.email, telefono: pacientes.telefono },
      consultorio: { razonSocial: empresas.razonSocial, nombreFantasia: empresas.nombreFantasia, domicilio: empresas.domicilio, localidad: empresas.localidad, telefono: empresas.telefono },
    })
    .from(eventos)
    .innerJoin(agendaRecursos, eq(agendaRecursos.id, eventos.recursoId))
    .innerJoin(empresas, eq(empresas.id, eventos.empresaId))
    .leftJoin(pacientes, eq(pacientes.id, eventos.pacienteId))
    .where(eq(eventos.id, eventoId));
  return t ?? null;
}

type Turno = NonNullable<Awaited<ReturnType<typeof datosDelTurno>>>;

const nombreConsultorio = (t: Turno) => t.consultorio.nombreFantasia || t.consultorio.razonSocial;
const direccion = (t: Turno) => [t.consultorio.domicilio, t.consultorio.localidad].filter(Boolean).join(", ");

/** Mensaje para WhatsApp, con el link para confirmar o cancelar */
export async function textoWhatsappTurno(app: FastifyInstance, t: Turno) {
  const link = `${app.urlDe("dental")}/turno/${await tokenDeTurno(app, t.id)}`;
  const texto = [
    `Hola ${t.paciente?.nombre ?? ""}! Te recordamos tu turno en ${nombreConsultorio(t)} el ${cuandoEs(t.fecha, t.inicio)} con ${t.profesional}.`,
    direccion(t) ? `Dirección: ${direccion(t)}.` : null,
    `Confirmalo o avisanos si no podés venir: ${link}`,
  ]
    .filter(Boolean)
    .join("\n");
  const telefono = telefonoWhatsapp(t.paciente?.telefono);
  return { telefono, texto, url: `https://wa.me/${telefono ?? ""}?text=${encodeURIComponent(texto)}` };
}

/** Email al paciente: cuando se le da el turno, o el recordatorio */
export async function enviarEmailTurno(app: FastifyInstance, eventoId: string, tipo: "agendado" | "recordatorio", usuarioId?: string | null) {
  const t = await datosDelTurno(app, eventoId);
  if (!t?.paciente?.email || ["Cancelado", "Ausente", "Realizado"].includes(t.estado)) return null;
  const link = `${app.urlDe("dental")}/turno/${await tokenDeTurno(app, t.id)}`;
  const consultorio = nombreConsultorio(t);
  const cuando = cuandoEs(t.fecha, t.inicio);
  const { html, texto } = armarEmail({
    color: COLOR_DENTAL,
    empresa: consultorio,
    saludo: `Hola ${t.paciente.nombre},`,
    parrafos: [
      tipo === "agendado" ? `Te dimos un turno para el ${cuando} con ${t.profesional}.` : `Te recordamos tu turno del ${cuando} con ${t.profesional}.`,
      [direccion(t) && `Dirección: ${direccion(t)}`, t.consultorio.telefono && `Teléfono: ${t.consultorio.telefono}`].filter(Boolean).join("\n"),
      "Por favor confirmá que venís, o avisanos si no podés así le damos el horario a otro paciente.",
    ].filter(Boolean),
    boton: { texto: "Confirmar o cancelar el turno", url: link },
    pie: `${consultorio} · Si tenés dudas, respondé este email.`,
  });
  const r = await enviarEmail(app, {
    empresaId: t.empresaId,
    para: t.paciente.email,
    asunto: tipo === "agendado" ? `Tu turno del ${cuando} · ${consultorio}` : `Recordatorio: tu turno del ${cuando} · ${consultorio}`,
    html,
    texto,
    tipo: "turno",
    refId: t.id,
    usuarioId: usuarioId ?? null,
    automatico: tipo === "recordatorio" || !usuarioId,
  });
  if (tipo === "recordatorio" && r.estado !== "Error") await app.db.update(eventos).set({ recordatorioEnviadoEn: new Date() }).where(eq(eventos.id, t.id));
  return r;
}

/**
 * Tarea automática: a cada consultorio que lo activó, manda el recordatorio de los turnos que empiezan
 * dentro de las próximas N horas (una sola vez por turno).
 */
export async function recordatoriosDeTurnos(app: FastifyInstance, ahora = Date.now()) {
  const configs = await app.db
    .select({ empresaId: configAgenda.empresaId, horas: configAgenda.recordatorioHoras })
    .from(configAgenda)
    .innerJoin(empresas, eq(empresas.id, configAgenda.empresaId))
    .where(and(eq(configAgenda.recordatorioEmail, true), eq(empresas.producto, "dental"), isNull(empresas.suspendidaEn)));
  const actual = ahoraAr(ahora);
  const hoy = hoyAr();
  let enviados = 0;
  for (const c of configs) {
    const hasta = ahoraAr(ahora + c.horas * 3600_000);
    const candidatos = await app.db
      .select({ id: eventos.id, fecha: eventos.fecha, inicio: eventos.inicio })
      .from(eventos)
      .where(
        and(
          eq(eventos.empresaId, c.empresaId),
          gte(eventos.fecha, hoy),
          lte(eventos.fecha, sumarDias(hoy, Math.ceil(c.horas / 24) + 1)),
          inArray(eventos.estado, ["Pendiente", "Confirmado"]),
          isNull(eventos.recordatorioEnviadoEn),
        ),
      );
    for (const ev of candidatos) {
      const cuando = `${ev.fecha}T${ev.inicio}`;
      if (cuando <= actual || cuando > hasta) continue;
      const r = await enviarEmailTurno(app, ev.id, "recordatorio");
      if (r && r.estado !== "Error") enviados++;
    }
  }
  return enviados;
}
