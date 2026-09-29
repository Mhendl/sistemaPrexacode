import { and, eq, inArray, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z, ZodError, type ZodTypeAny } from "zod";
import { clientes, movimientosStock, productos } from "../db/schema.js";
import { requirePermiso } from "../lib/auth.js";
import { badRequest, parse } from "../lib/errors.js";
import { clienteInputSchema } from "../lib/validation.js";
import { productoSchema } from "./productos.js";

export const MAX_FILAS = 5000;

const pedidoSchema = z.object({
  filas: z.array(z.record(z.unknown())).min(1, "El archivo no tiene filas").max(MAX_FILAS, `Se pueden importar hasta ${MAX_FILAS} filas por vez`),
  /** Qué hacer si el registro ya existe (mismo CUIT o mismo código) */
  siExiste: z.enum(["actualizar", "omitir"]),
  /** true: solo valida y cuenta, no guarda nada (vista previa) */
  simular: z.boolean().default(false),
});

export interface ErrorFila {
  /** Número de fila como se ve en Excel (la 1 es el encabezado) */
  fila: number;
  errores: Record<string, string>;
}

interface Resumen {
  total: number;
  crear: number;
  actualizar: number;
  omitir: number;
  errores: ErrorFila[];
  aplicado: boolean;
}

const filaExcel = (i: number) => i + 2;

function validar<S extends ZodTypeAny>(schema: S, fila: unknown): { ok: true; datos: z.infer<S> } | { ok: false; errores: Record<string, string> } {
  try {
    return { ok: true, datos: schema.parse(fila) };
  } catch (e) {
    if (!(e instanceof ZodError)) throw e;
    const errores: Record<string, string> = {};
    for (const issue of e.issues) errores[issue.path.join(".") || "fila"] ??= issue.message;
    return { ok: false, errores };
  }
}

/** Una misma clave repetida dentro del archivo es un error de la segunda aparición en adelante */
function marcarRepetidos<T>(validas: { i: number; datos: T }[], clave: (d: T) => string, campo: string, errores: ErrorFila[]) {
  const vistas = new Map<string, number>();
  return validas.filter(({ i, datos }) => {
    const k = clave(datos);
    const primera = vistas.get(k);
    if (primera !== undefined) {
      errores.push({ fila: filaExcel(i), errores: { [campo]: `Repetido en el archivo (ya está en la fila ${filaExcel(primera)})` } });
      return false;
    }
    vistas.set(k, i);
    return true;
  });
}

const importarProductoSchema = productoSchema.extend({
  /** Stock que tiene que quedar (opcional). Si difiere del actual se registra un ajuste */
  stock: z.coerce.number({ invalid_type_error: "Stock inválido" }).min(0, "El stock no puede ser negativo").optional(),
});

const r3 = (n: number) => Math.round(n * 1000) / 1000;
/** CUIT del archivo, solo dígitos (para buscar el cliente existente) */
const cuitDe = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).replace(/\D/g, "") || null : null);

export const importarRoutes: FastifyPluginAsync = async (app) => {
  const opciones = { bodyLimit: 15 * 1024 * 1024 };

  app.post("/clientes", { ...opciones, preHandler: requirePermiso("importar.clientes") }, async (req) => {
    const { filas, siExiste, simular } = parse(pedidoSchema, req.body);
    const empresaId = req.user.empresaId;
    const errores: ErrorFila[] = [];

    // Para actualizar alcanza con el CUIT y las columnas a cambiar: lo que no viene queda como estaba
    const cuitsArchivo = filas.map((f) => cuitDe(f.cuit)).filter((c): c is string => !!c);
    const previos = cuitsArchivo.length && siExiste === "actualizar" ? await app.db.select().from(clientes).where(and(eq(clientes.empresaId, empresaId), inArray(clientes.cuit, cuitsArchivo))) : [];
    const previoPorCuit = new Map(previos.map((c) => [c.cuit, c]));
    let validas: { i: number; datos: z.infer<typeof clienteInputSchema> }[] = [];
    filas.forEach((f, i) => {
      const previo = previoPorCuit.get(cuitDe(f.cuit) ?? "");
      const base = previo ? { razonSocial: previo.razonSocial, condicionIva: previo.condicionIva, contacto: previo.contacto, email: previo.email, telefono: previo.telefono, domicilio: previo.domicilio, localidad: previo.localidad, rubro: previo.rubro, notas: previo.notas, estado: previo.estado } : {};
      const r = validar(clienteInputSchema, { ...base, ...f });
      if (r.ok) validas.push({ i, datos: r.datos });
      else errores.push({ fila: filaExcel(i), errores: r.errores });
    });
    validas = marcarRepetidos(validas, (d) => d.cuit, "cuit", errores);

    const cuits = validas.map((v) => v.datos.cuit);
    const existentes = cuits.length
      ? await app.db.select({ id: clientes.id, cuit: clientes.cuit }).from(clientes).where(and(eq(clientes.empresaId, empresaId), inArray(clientes.cuit, cuits)))
      : [];
    const porCuit = new Map(existentes.map((e) => [e.cuit, e.id]));

    const nuevos = validas.filter((v) => !porCuit.has(v.datos.cuit));
    const repetidos = validas.filter((v) => porCuit.has(v.datos.cuit));
    const resumen: Resumen = {
      total: filas.length,
      crear: nuevos.length,
      actualizar: siExiste === "actualizar" ? repetidos.length : 0,
      omitir: siExiste === "omitir" ? repetidos.length : 0,
      errores: errores.sort((a, b) => a.fila - b.fila),
      aplicado: false,
    };
    if (simular) return resumen;

    await app.db.transaction(async (tx) => {
      if (nuevos.length) await tx.insert(clientes).values(nuevos.map((v) => ({ ...v.datos, empresaId })));
      if (siExiste === "actualizar") {
        for (const v of repetidos) {
          await tx
            .update(clientes)
            .set({ ...v.datos, version: sql`${clientes.version} + 1`, updatedAt: new Date() })
            .where(and(eq(clientes.id, porCuit.get(v.datos.cuit)!), eq(clientes.empresaId, empresaId)));
        }
      }
    });
    return { ...resumen, aplicado: true };
  });

  app.post("/productos", { ...opciones, preHandler: requirePermiso("importar.productos") }, async (req) => {
    const { filas, siExiste, simular } = parse(pedidoSchema, req.body);
    const empresaId = req.user.empresaId;
    const errores: ErrorFila[] = [];

    // Para actualizar alcanza con el código y las columnas a cambiar (ej. solo Stock, o solo Precio)
    const codigosArchivo = filas.map((f) => (typeof f.codigo === "string" || typeof f.codigo === "number" ? String(f.codigo).trim() : "")).filter(Boolean);
    const previos = codigosArchivo.length && siExiste === "actualizar" ? await app.db.select().from(productos).where(and(eq(productos.empresaId, empresaId), inArray(productos.codigo, codigosArchivo))) : [];
    const previoPorCodigo = new Map(previos.map((p) => [p.codigo, p]));
    let validas: { i: number; datos: z.infer<typeof importarProductoSchema> }[] = [];
    filas.forEach((f, i) => {
      const previo = previoPorCodigo.get(String(f.codigo ?? "").trim());
      const base = previo
        ? { descripcion: previo.descripcion, categoria: previo.categoria, unidad: previo.unidad, precio: previo.precio, alicuotaIva: previo.alicuotaIva, controlaStock: previo.controlaStock, stockMinimo: previo.stockMinimo, activo: previo.activo }
        : {};
      const r = validar(importarProductoSchema, { ...base, ...f });
      if (r.ok) validas.push({ i, datos: r.datos });
      else errores.push({ fila: filaExcel(i), errores: previo ? r.errores : { ...r.errores, ...(f.descripcion === undefined ? { descripcion: "Producto nuevo: falta la descripción" } : {}) } });
    });
    validas = marcarRepetidos(validas, (d) => d.codigo, "codigo", errores);

    const codigos = validas.map((v) => v.datos.codigo);
    const existentes = codigos.length ? await app.db.select().from(productos).where(and(eq(productos.empresaId, empresaId), inArray(productos.codigo, codigos))) : [];
    const porCodigo = new Map(existentes.map((e) => [e.codigo, e]));

    // Mismo control que al editar a mano: para dejar de controlar stock, el stock tiene que estar en cero
    if (siExiste === "actualizar") {
      validas = validas.filter((v) => {
        const actual = porCodigo.get(v.datos.codigo);
        const stockFinal = v.datos.stock ?? actual?.stock ?? 0;
        if (actual?.controlaStock && !v.datos.controlaStock && stockFinal !== 0) {
          errores.push({ fila: filaExcel(v.i), errores: { controlaStock: "Tiene stock: para pasarlo a servicio, el stock tiene que ser 0" } });
          return false;
        }
        return true;
      });
    }

    const nuevos = validas.filter((v) => !porCodigo.has(v.datos.codigo));
    const repetidos = validas.filter((v) => porCodigo.has(v.datos.codigo));
    const resumen: Resumen = {
      total: filas.length,
      crear: nuevos.length,
      actualizar: siExiste === "actualizar" ? repetidos.length : 0,
      omitir: siExiste === "omitir" ? repetidos.length : 0,
      errores: errores.sort((a, b) => a.fila - b.fila),
      aplicado: false,
    };
    if (simular) return resumen;

    await app.db.transaction(async (tx) => {
      for (const { datos } of nuevos) {
        const { stock, ...campos } = datos;
        const inicial = campos.controlaStock ? r3(stock ?? 0) : 0;
        const [p] = await tx.insert(productos).values({ ...campos, empresaId, stock: inicial }).returning();
        if (inicial > 0) {
          await tx.insert(movimientosStock).values({ empresaId, productoId: p.id, tipo: "ingreso", cantidad: inicial, stockResultante: inicial, motivo: "Importación: stock inicial", usuarioId: req.user.sub });
        }
      }
      if (siExiste === "actualizar") {
        for (const { datos } of repetidos) {
          const actual = porCodigo.get(datos.codigo)!;
          const { stock, ...campos } = datos;
          // Si el archivo trae stock distinto al actual, se registra como ajuste (queda en el historial)
          const nuevoStock = campos.controlaStock && stock !== undefined ? r3(stock) : actual.stock;
          const delta = r3(nuevoStock - actual.stock);
          await tx
            .update(productos)
            .set({ ...campos, stock: nuevoStock, version: sql`${productos.version} + 1`, updatedAt: new Date() })
            .where(and(eq(productos.id, actual.id), eq(productos.empresaId, empresaId)));
          if (delta !== 0) {
            await tx.insert(movimientosStock).values({ empresaId, productoId: actual.id, tipo: "ajuste", cantidad: delta, stockResultante: nuevoStock, motivo: "Importación: corrección de stock", usuarioId: req.user.sub });
          }
        }
      }
    });
    return { ...resumen, aplicado: true };
  });

  app.setNotFoundHandler(() => {
    throw badRequest("Solo se pueden importar clientes o productos");
  });
};
