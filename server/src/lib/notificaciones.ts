import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { notificaciones, preferenciasNotificacion, productos, roles, usuarios } from "../db/schema.js";
import type { Permiso } from "./permisos.js";

/** Catálogo de avisos que el usuario puede activar o desactivar */
export const TIPOS_NOTIFICACION = {
  stock_bajo: {
    nombre: "Stock bajo el mínimo",
    descripcion: "Cuando un producto queda por debajo de su stock mínimo",
    /** Quién lo recibe: alguien con alguno de estos permisos (vacío: todos) */
    permisos: ["productos.editar", "stock.movimientos"] as Permiso[],
    disponible: true,
  },
  sin_stock: {
    nombre: "Producto sin stock",
    descripcion: "Cuando un producto se queda en cero",
    /** Quién lo recibe: alguien con alguno de estos permisos (vacío: todos) */
    permisos: ["productos.editar", "stock.movimientos"] as Permiso[],
    disponible: true,
  },
  vencimiento_factura: {
    nombre: "Vencimiento de facturas",
    descripcion: "Facturas de clientes por vencer y vencidas",
    /** Quién lo recibe: alguien con alguno de estos permisos (vacío: todos) */
    permisos: ["cobranzas.ver"] as Permiso[],
    disponible: true,
  },
  agenda_asignacion: {
    nombre: "Agenda: me asignaron algo",
    descripcion: "Cuando otra persona te agenda un evento, lo cambia de día u hora, o lo cancela",
    /** Quién lo recibe: alguien con alguno de estos permisos (vacío: todos) */
    permisos: ["agenda.ver"] as Permiso[],
    disponible: true,
  },
  soporte_respuesta: {
    nombre: "Soporte: me respondieron",
    descripcion: "Cuando el equipo de Prexacode responde un pedido de ayuda tuyo",
    /** Quién lo recibe: alguien con alguno de estos permisos (vacío: todos) */
    permisos: [] as Permiso[],
    disponible: true,
  },
  oportunidad_asignada: {
    nombre: "Oportunidades: me asignaron una",
    descripcion: "Cuando otra persona te deja como responsable de una oportunidad de venta",
    /** Quién lo recibe: alguien con alguno de estos permisos (vacío: todos) */
    permisos: ["oportunidades.ver"] as Permiso[],
    disponible: true,
  },
} as const;

export type TipoNotificacion = keyof typeof TIPOS_NOTIFICACION;

/** Avisos que le corresponden a quien tiene este rol */
export const tiposPara = (esAdmin: boolean, permisos: string[]) =>
  (Object.keys(TIPOS_NOTIFICACION) as TipoNotificacion[]).filter((t) => {
    const req = TIPOS_NOTIFICACION[t].permisos as readonly string[];
    return esAdmin || req.length === 0 || req.some((x) => permisos.includes(x));
  });

/** Usuarios activos de la empresa a los que les corresponde un tipo de aviso, con su preferencia */
async function destinatariosDe(db: Db, empresaId: string, tipo: TipoNotificacion) {
  const candidatos = await db
    .select({ id: usuarios.id, enSistema: preferenciasNotificacion.enSistema, esAdmin: roles.esAdmin, permisos: roles.permisos })
    .from(usuarios)
    .leftJoin(roles, eq(roles.id, usuarios.rolId))
    .leftJoin(preferenciasNotificacion, and(eq(preferenciasNotificacion.usuarioId, usuarios.id), eq(preferenciasNotificacion.tipo, tipo)))
    .where(and(eq(usuarios.empresaId, empresaId), eq(usuarios.estado, "Activo")));
  return candidatos.filter((c) => c.enSistema !== false && tiposPara(!!c.esAdmin, c.permisos ?? []).includes(tipo));
}

interface Aviso {
  tipo: TipoNotificacion;
  titulo: string;
  detalle: string;
  link?: string;
}

/** Crea el aviso para cada usuario activo de la empresa con un rol habilitado que no lo haya desactivado */
export async function notificar(db: Db, empresaId: string, aviso: Aviso) {
  const destinatarios = await destinatariosDe(db, empresaId, aviso.tipo);
  if (destinatarios.length === 0) return;
  await db.insert(notificaciones).values(destinatarios.map((d) => ({ empresaId, usuarioId: d.id, ...aviso, link: aviso.link ?? null })));
}

/** Aviso a un usuario puntual (si está activo y no lo desactivó) */
export async function notificarUsuario(db: Db, empresaId: string, usuarioId: string, aviso: Aviso) {
  const [u] = await db
    .select({ id: usuarios.id, enSistema: preferenciasNotificacion.enSistema })
    .from(usuarios)
    .leftJoin(preferenciasNotificacion, and(eq(preferenciasNotificacion.usuarioId, usuarios.id), eq(preferenciasNotificacion.tipo, aviso.tipo)))
    .where(and(eq(usuarios.id, usuarioId), eq(usuarios.empresaId, empresaId), eq(usuarios.estado, "Activo")));
  if (!u || u.enSistema === false) return;
  await db.insert(notificaciones).values({ empresaId, usuarioId, ...aviso, link: aviso.link ?? null });
}

type Producto = typeof productos.$inferSelect;
const cant = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 3 });

/**
 * Avisa solo cuando el producto CRUZA el umbral (no en cada movimiento mientras siga bajo),
 * así no se llena la campanita de avisos repetidos.
 */
export async function alertasStock(db: Db, antes: Producto, despues: Producto) {
  if (!despues.controlaStock || !despues.activo) return;
  const link = `/productos/${despues.id}`;

  const teniaStock = antes.controlaStock ? antes.stock > 0 : true;
  if (teniaStock && despues.stock <= 0) {
    await notificar(db, despues.empresaId, {
      tipo: "sin_stock",
      titulo: "Producto sin stock",
      detalle: `${despues.descripcion} (${despues.codigo}) se quedó sin stock`,
      link,
    });
    return;
  }

  const estabaBajo = antes.controlaStock && antes.stock < antes.stockMinimo;
  const quedoBajo = despues.stock > 0 && despues.stock < despues.stockMinimo;
  if (!estabaBajo && quedoBajo) {
    await notificar(db, despues.empresaId, {
      tipo: "stock_bajo",
      titulo: "Stock bajo el mínimo",
      detalle: `${despues.descripcion} (${despues.codigo}): quedan ${cant(despues.stock)} ${despues.unidad} · mínimo ${cant(despues.stockMinimo)}`,
      link,
    });
  }
}

/** Última revisión de vencimientos por empresa (para no recalcular en cada consulta) */
const ultimaRevision = new Map<string, number>();
export const INTERVALO_REVISION_MS = 10 * 60_000;

/**
 * Avisa de facturas que vencieron sin cobrarse. Cada factura se avisa una sola vez por usuario.
 * Se ejecuta al consultar las notificaciones, como máximo cada 10 minutos por empresa.
 */
export async function revisarVencimientos(db: Db, empresaId: string, forzar = false) {
  const ahora = Date.now();
  if (!forzar && ahora - (ultimaRevision.get(empresaId) ?? 0) < INTERVALO_REVISION_MS) return;
  ultimaRevision.set(empresaId, ahora);

  const { saldosFacturas } = await import("./cuentas.js");
  const { describirTipo } = await import("./arca/codigos.js");
  const { clientes } = await import("../db/schema.js");
  const vencidas = (await saldosFacturas(db, empresaId)).filter((s) => s.diasVencida > 0);
  if (vencidas.length === 0) return;

  const avisadas = await db
    .select({ usuarioId: notificaciones.usuarioId, link: notificaciones.link })
    .from(notificaciones)
    .where(and(eq(notificaciones.empresaId, empresaId), eq(notificaciones.tipo, "vencimiento_factura")));
  const destinatarios = await destinatariosDe(db, empresaId, "vencimiento_factura");

  const nombres = new Map(
    (await db.select({ id: clientes.id, razonSocial: clientes.razonSocial }).from(clientes).where(inArray(clientes.id, [...new Set(vencidas.map((v) => v.clienteId))]))).map((c) => [c.id, c.razonSocial]),
  );
  const nuevas = [];
  for (const v of vencidas) {
    const link = `/facturacion/${v.id}`;
    const numero = `${String(v.puntoVenta).padStart(4, "0")}-${String(v.numero).padStart(8, "0")}`;
    for (const d of destinatarios) {
      if (avisadas.some((a) => a.usuarioId === d.id && a.link === link)) continue;
      nuevas.push({
        empresaId,
        usuarioId: d.id,
        tipo: "vencimiento_factura",
        titulo: "Factura vencida",
        detalle: `${describirTipo(v.tipoCbte).nombre} ${numero} · ${nombres.get(v.clienteId) ?? ""} · saldo $ ${v.saldo.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`,
        link,
      });
    }
  }
  if (nuevas.length) await db.insert(notificaciones).values(nuevas);
}
