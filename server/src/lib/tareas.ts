/**
 * Tareas automáticas que corren solas cada hora en el servidor:
 *  - avisos de la suscripción a los administradores de cada empresa (prueba por terminar, pago por vencer, vencida, solo lectura)
 *  - recordatorios de facturas por vencer y vencidas a los clientes (si la empresa lo activó)
 * Cada aviso se manda una sola vez: queda anotado en avisos_enviados.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { avisosEnviados, clientes, configEmail, empresas, roles, usuarios } from "../db/schema.js";
import { hoyAr, saldosFacturas } from "./cuentas.js";
import { enviarDocumentoPorEmail } from "./documentos.js";
import { enviarDePlataforma } from "./email/plataforma.js";
import { marcaDe } from "./productos.js";
import { estadoDe, obtenerSuscripcion, sumarDias } from "./suscripcion.js";

const fecha = (f: string) => f.split("-").reverse().join("/");
const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);

/** Anota el aviso; devuelve false si ya se había mandado */
async function primeraVez(app: FastifyInstance, empresaId: string, clave: string) {
  const r = await app.db.insert(avisosEnviados).values({ empresaId, clave }).onConflictDoNothing().returning({ id: avisosEnviados.id });
  return r.length > 0;
}

async function administradores(app: FastifyInstance, empresaId: string) {
  return app.db
    .select({ email: usuarios.email, nombre: usuarios.nombre })
    .from(usuarios)
    .innerJoin(roles, eq(roles.id, usuarios.rolId))
    .where(and(eq(usuarios.empresaId, empresaId), eq(usuarios.estado, "Activo"), eq(roles.esAdmin, true)));
}

/** Avisos por email de la suscripción, a los administradores de cada empresa */
export async function avisosDeSuscripcion(app: FastifyInstance, hoy = hoyAr()) {
  let enviados = 0;
  const lista = await app.db.select({ id: empresas.id, razonSocial: empresas.razonSocial, producto: empresas.producto }).from(empresas).where(isNull(empresas.suspendidaEn));
  for (const e of lista) {
    const plan = `${app.urlDe(e.producto)}/configuracion?tab=plan`;
    const nombre = marcaDe(e.producto).nombre;
    const s = await obtenerSuscripcion(app.db, e.id);
    const est = estadoDe(s, hoy);
    let aviso: { clave: string; asunto: string; parrafos: string[] } | null = null;
    if (est.estado === "Prueba" && est.diasRestantes <= 3) {
      aviso = {
        clave: `prueba-termina|${est.vence}`,
        asunto: `Tu prueba gratis de ${nombre} termina el ${fecha(est.vence)}`,
        parrafos: [
          `La prueba gratis de ${e.razonSocial} termina el ${fecha(est.vence)}.`,
          "Si elegís un plan ahora no perdés ningún día: el pago empieza a correr cuando termina la prueba. Tus datos quedan tal cual.",
        ],
      };
    } else if (est.estado === "Activa" && est.diasRestantes <= 5 && !s.bajaSolicitadaEn) {
      aviso = {
        clave: `pago-vence|${est.vence}`,
        asunto: `Tu suscripción a ${nombre} vence el ${fecha(est.vence)}`,
        parrafos: [`La suscripción de ${e.razonSocial} vence el ${fecha(est.vence)}.`, "Renovala cuando quieras: el período nuevo empieza al día siguiente del vencimiento, así no perdés días."],
      };
    } else if (est.estado === "Gracia") {
      aviso = {
        clave: `vencida|${est.vence}`,
        asunto: `Tu suscripción a ${nombre} venció`,
        parrafos: [
          `La suscripción de ${e.razonSocial} venció el ${fecha(est.vence)}.`,
          `Podés seguir usando todo normalmente hasta el ${fecha(est.graciaHasta)}. Después el sistema queda en solo lectura (podés ver y exportar, pero no cargar) hasta que se renueve.`,
        ],
      };
    } else if (est.estado === "SoloLectura") {
      aviso = {
        clave: `solo-lectura|${est.vence}`,
        asunto: `${nombre} quedó en modo solo lectura`,
        parrafos: [
          `Como la suscripción de ${e.razonSocial} no se renovó, el sistema quedó en solo lectura: tus datos están completos y los podés ver y exportar, pero no cargar ni modificar.`,
          "En cuanto se renueva, vuelve todo en el momento.",
        ],
      };
    }
    if (!aviso || !(await primeraVez(app, e.id, aviso.clave))) continue;
    for (const a of await administradores(app, e.id)) {
      if (await enviarDePlataforma(app, { producto: e.producto, para: a.email, asunto: aviso.asunto, saludo: `Hola ${a.nombre.split(" ")[0]},`, parrafos: aviso.parrafos, boton: { texto: "Ver mi plan", url: plan } })) enviados++;
    }
  }
  return enviados;
}

/** Recordatorios a los clientes: 3 días antes del vencimiento, y cuando ya venció (una vez cada uno) */
export async function recordatoriosDeFacturas(app: FastifyInstance, hoy = hoyAr()) {
  let enviados = 0;
  const activas = await app.db.select({ empresaId: configEmail.empresaId }).from(configEmail).where(eq(configEmail.recordarFacturas, true));
  for (const { empresaId } of activas) {
    const [emp] = await app.db.select({ suspendida: empresas.suspendidaEn }).from(empresas).where(eq(empresas.id, empresaId));
    if (!emp || emp.suspendida) continue;
    if (estadoDe(await obtenerSuscripcion(app.db, empresaId), hoy).estado === "SoloLectura") continue;
    const pendientes = (await saldosFacturas(app.db, empresaId)).filter((f) => f.saldo > 0);
    if (!pendientes.length) continue;
    const emails = new Map(
      (await app.db.select({ id: clientes.id, email: clientes.email }).from(clientes).where(inArray(clientes.id, [...new Set(pendientes.map((p) => p.clienteId))]))).map((c) => [c.id, c.email]),
    );
    for (const f of pendientes) {
      const para = emails.get(f.clienteId);
      if (!para) continue;
      const faltan = diasEntre(hoy, f.vencimiento);
      const saldo = f.saldo.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      let clave: string | null = null;
      let mensaje = "";
      if (faltan > 0 && faltan <= 3) {
        clave = `factura-por-vencer|${f.id}`;
        mensaje = `Te recordamos que vence el ${fecha(f.vencimiento)}. Saldo: $ ${saldo}.`;
      } else if (faltan < 0 && f.vencimiento >= sumarDias(hoy, -30)) {
        // Vencidas hace menos de un mes (al activar la opción no se reclaman facturas viejas)
        clave = `factura-vencida|${f.id}`;
        mensaje = `Te recordamos que venció el ${fecha(f.vencimiento)} y tiene un saldo pendiente de $ ${saldo}. Si ya la pagaste, no tengas en cuenta este mensaje.`;
      }
      if (!clave || !(await primeraVez(app, empresaId, clave))) continue;
      const r = await enviarDocumentoPorEmail(app, { empresaId, tipo: "comprobante", id: f.id, para, mensaje, automatico: true, asuntoPrefijo: faltan > 0 ? "Recordatorio de vencimiento" : "Factura vencida" });
      if (r && r.estado !== "Error") enviados++;
    }
  }
  return enviados;
}

export async function tareasAutomaticas(app: FastifyInstance) {
  const avisos = await avisosDeSuscripcion(app);
  const recordatorios = await recordatoriosDeFacturas(app);
  if (avisos || recordatorios) app.log.info({ avisos, recordatorios }, "Tareas automáticas: emails enviados");
}
