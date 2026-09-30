/**
 * Emails de acompañamiento durante la prueba gratis (días 1, 3, 7 y 10): ayudan a arrancar y a decidir.
 * Cada uno sale una sola vez por empresa (queda anotado en avisos_enviados), y solo mientras está en prueba.
 */
import { and, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { avisosEnviados, empresas } from "../db/schema.js";
import { diasEntre, hoyAr } from "./cuentas.js";
import { enviarDePlataforma } from "./email/plataforma.js";
import { MESES_COBRADOS_ANUAL } from "./precios.js";
import { marcaDe, productoDe, type ProductoId } from "./productos.js";
import { estadoDe, obtenerSuscripcion } from "./suscripcion.js";
import { administradores } from "./tareas.js";

interface Mensaje {
  asunto: string;
  parrafos: string[];
  boton: { texto: string; ruta: string };
}

const MENSAJES: Record<ProductoId, Record<number, Mensaje>> = {
  gestion: {
    1: {
      asunto: "¿Pudiste cargar tus datos?",
      parrafos: [
        "Lo que más ayuda a arrancar es tener cargados tus clientes y productos.",
        "Si ya los tenés en Excel (o en otro sistema), importalos en un minuto desde Importar y exportar: el sistema reconoce las columnas solo y te muestra una vista previa antes de guardar.",
        "Si preferís, mandanos el archivo desde Soporte y te lo cargamos nosotros, sin costo.",
      ],
      boton: { texto: "Importar mis datos", ruta: "/importar-exportar" },
    },
    3: {
      asunto: "Facturá con ARCA desde el sistema",
      parrafos: [
        "Con ARCA conectado, cada factura sale con su CAE en segundos y descuenta el stock sola.",
        "Mientras tanto podés practicar en modo prueba: las facturas no tienen validez fiscal y no pasa nada si te equivocás.",
        "La conexión se hace una sola vez, paso a paso, desde Configuración → Facturación ARCA.",
      ],
      boton: { texto: "Conectar ARCA", ruta: "/configuracion?tab=arca" },
    },
    7: {
      asunto: "Vas por la mitad de la prueba",
      parrafos: [
        "¿Cómo viene? Si algo no te cierra, el botón ? de arriba de todo tiene la ayuda de cada pantalla, con un buscador.",
        "Y si necesitás una mano, escribinos desde Soporte: te respondemos nosotros, no un robot.",
      ],
      boton: { texto: "Abrir el sistema", ruta: "/" },
    },
    10: {
      asunto: "Elegí tu plan y no pierdas nada de lo cargado",
      parrafos: [
        "Tu prueba gratis está por terminar. Todo lo que cargaste queda tal cual cuando elegís un plan.",
        `Pagando el año, pagás ${MESES_COBRADOS_ANUAL} meses: 2 gratis.`,
      ],
      boton: { texto: "Ver los planes", ruta: "/configuracion?tab=plan" },
    },
  },
  dental: {
    1: {
      asunto: "¿Ya cargaste tus primeros pacientes?",
      parrafos: [
        "Para arrancar: cargá a los profesionales como usuarios (aparecen solos en la agenda) y empezá a dar turnos.",
        "Los pacientes nuevos se dan de alta en el momento, desde el mismo turno. Si ya tenés una lista, mandánosla desde Soporte y te la cargamos sin costo.",
      ],
      boton: { texto: "Ir a Pacientes", ruta: "/pacientes" },
    },
    3: {
      asunto: "Menos ausencias: recordatorios de turnos",
      parrafos: [
        "Activá los recordatorios automáticos en Configuración → Agenda: a cada paciente le llega un email antes de su turno, con un botón para confirmar o cancelar.",
        "Desde Turnos también podés mandarle el recordatorio por WhatsApp con un clic. Cuando confirma o cancela, te llega el aviso.",
      ],
      boton: { texto: "Activar recordatorios", ruta: "/configuracion?tab=agenda" },
    },
    7: {
      asunto: "Odontograma, presupuestos y obras sociales",
      parrafos: [
        "Lo que marcás en rojo en el odontograma se convierte en presupuesto con un clic, con los precios de la obra social del paciente.",
        "A fin de mes, la liquidación a cada obra social sale sola, lista para exportar a Excel. Cargá tus precios en Prestaciones y precios.",
      ],
      boton: { texto: "Cargar mis precios", ruta: "/prestaciones" },
    },
    10: {
      asunto: "Elegí tu plan y no pierdas nada de lo cargado",
      parrafos: [
        "Tu prueba gratis está por terminar. Las historias clínicas y todo lo que cargaste quedan tal cual cuando elegís un plan.",
        `Pagando el año, pagás ${MESES_COBRADOS_ANUAL} meses: 2 gratis.`,
      ],
      boton: { texto: "Ver los planes", ruta: "/configuracion?tab=plan" },
    },
  },
};

export const DIAS_ACOMPANAMIENTO = [1, 3, 7, 10];

export async function emailsDePrueba(app: FastifyInstance, hoy = hoyAr()) {
  let enviados = 0;
  const lista = await app.db.select({ id: empresas.id, producto: empresas.producto, createdAt: empresas.createdAt }).from(empresas).where(isNull(empresas.suspendidaEn));
  for (const e of lista) {
    const alta = new Date(e.createdAt.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
    const dias = diasEntre(alta, hoy);
    // El día que toca (o el siguiente, si el servidor estuvo apagado); nunca atrasados de más
    const dia = DIAS_ACOMPANAMIENTO.find((d) => dias === d || dias === d + 1);
    if (!dia) continue;
    if (estadoDe(await obtenerSuscripcion(app.db, e.id), hoy).estado !== "Prueba") continue;
    const clave = `acompanamiento-d${dia}`;
    const [ya] = await app.db.select({ id: avisosEnviados.id }).from(avisosEnviados).where(and(eq(avisosEnviados.empresaId, e.id), eq(avisosEnviados.clave, clave)));
    if (ya) continue;
    const r = await app.db.insert(avisosEnviados).values({ empresaId: e.id, clave }).onConflictDoNothing().returning({ id: avisosEnviados.id });
    if (!r.length) continue;
    const producto = productoDe(e.producto);
    const m = MENSAJES[producto][dia]!;
    for (const a of await administradores(app, e.id)) {
      const ok = await enviarDePlataforma(app, {
        producto,
        para: a.email,
        asunto: m.asunto,
        saludo: `Hola ${a.nombre.split(" ")[0]},`,
        parrafos: m.parrafos,
        boton: { texto: m.boton.texto, url: `${app.urlDe(producto)}${m.boton.ruta}` },
        pie: `${marcaDe(producto).nombre} · Si no querés recibir estos consejos, respondé este email y te sacamos de la lista.`,
      });
      if (ok) enviados++;
    }
  }
  return enviados;
}
