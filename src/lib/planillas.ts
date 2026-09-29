/**
 * Importación y exportación de planillas (Excel / CSV).
 * La librería se carga solo cuando se usa, para no agrandar la app.
 */
import type { ClienteApi, ProductoApi } from "@/api/types";
import { aNumero } from "@/lib/numeros";

export type Entidad = "clientes" | "productos";
type Tipo = "texto" | "numero" | "booleano" | "condicionIva" | "estado";

interface Columna {
  campo: string;
  encabezado: string;
  /** Otros nombres con los que puede venir la columna en planillas de otros sistemas */
  sinonimos: string[];
  tipo: Tipo;
  obligatoria?: boolean;
  ejemplo: string | number;
}

export const COLUMNAS: Record<Entidad, Columna[]> = {
  clientes: [
    { campo: "razonSocial", encabezado: "Razón social", sinonimos: ["nombre", "cliente", "denominacion", "nombre o razon social"], tipo: "texto", obligatoria: true, ejemplo: "Ferretería El Tornillo S.R.L." },
    { campo: "cuit", encabezado: "CUIT", sinonimos: ["cuil", "cuit/cuil", "cuit cuil", "documento", "nro documento"], tipo: "texto", obligatoria: true, ejemplo: "30-50001091-2" },
    { campo: "condicionIva", encabezado: "Condición IVA", sinonimos: ["iva", "condicion frente al iva", "situacion iva", "cond iva", "categoria iva"], tipo: "condicionIva", obligatoria: true, ejemplo: "Responsable Inscripto" },
    { campo: "contacto", encabezado: "Contacto", sinonimos: ["persona de contacto", "responsable"], tipo: "texto", ejemplo: "Jorge Albornoz" },
    { campo: "email", encabezado: "Email", sinonimos: ["e-mail", "mail", "correo", "correo electronico"], tipo: "texto", ejemplo: "compras@eltornillo.com.ar" },
    { campo: "telefono", encabezado: "Teléfono", sinonimos: ["tel", "celular", "whatsapp", "telefono / whatsapp"], tipo: "texto", ejemplo: "+54 11 4752-1180" },
    { campo: "domicilio", encabezado: "Domicilio", sinonimos: ["direccion", "calle"], tipo: "texto", ejemplo: "Av. San Martín 1234" },
    { campo: "localidad", encabezado: "Localidad", sinonimos: ["ciudad", "partido"], tipo: "texto", ejemplo: "San Martín" },
    { campo: "rubro", encabezado: "Rubro", sinonimos: ["actividad", "segmento"], tipo: "texto", ejemplo: "Ferretería" },
    { campo: "notas", encabezado: "Notas", sinonimos: ["observaciones", "comentarios"], tipo: "texto", ejemplo: "" },
    { campo: "estado", encabezado: "Estado", sinonimos: [], tipo: "estado", ejemplo: "Activo" },
  ],
  productos: [
    { campo: "codigo", encabezado: "Código", sinonimos: ["cod", "sku", "codigo interno", "articulo"], tipo: "texto", obligatoria: true, ejemplo: "RESMA-A4" },
    { campo: "descripcion", encabezado: "Descripción", sinonimos: ["producto", "nombre", "detalle", "descripcion del producto"], tipo: "texto", obligatoria: true, ejemplo: "Resma A4 75 g" },
    { campo: "categoria", encabezado: "Categoría", sinonimos: ["rubro", "familia", "grupo"], tipo: "texto", ejemplo: "Librería" },
    { campo: "unidad", encabezado: "Unidad", sinonimos: ["um", "unidad de medida", "u. medida"], tipo: "texto", ejemplo: "u." },
    { campo: "precio", encabezado: "Precio sin IVA", sinonimos: ["precio", "precio neto", "precio s/iva", "precio unitario", "neto"], tipo: "numero", obligatoria: true, ejemplo: 8950.5 },
    { campo: "alicuotaIva", encabezado: "IVA %", sinonimos: ["iva", "alicuota", "alicuota iva", "alicuota de iva", "tasa iva"], tipo: "numero", obligatoria: true, ejemplo: 21 },
    { campo: "controlaStock", encabezado: "Controla stock", sinonimos: ["maneja stock", "lleva stock", "stockeable"], tipo: "booleano", ejemplo: "Sí" },
    { campo: "stock", encabezado: "Stock", sinonimos: ["stock actual", "existencia", "cantidad", "existencias"], tipo: "numero", ejemplo: 120 },
    { campo: "stockMinimo", encabezado: "Stock mínimo", sinonimos: ["minimo", "stock min", "punto de pedido"], tipo: "numero", ejemplo: 50 },
    { campo: "activo", encabezado: "Activo", sinonimos: ["habilitado"], tipo: "booleano", ejemplo: "Sí" },
  ],
};

/** Minúsculas, sin acentos ni signos: "Condición  IVA:" → "condicion iva" */
const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%/ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function convertirCondicionIva(v: string): string {
  const n = normalizar(v);
  if (["ri", "resp inscripto", "responsable inscripto", "iva responsable inscripto", "inscripto"].includes(n)) return "Responsable Inscripto";
  if (["mt", "monotributo", "monotributista", "responsable monotributo"].includes(n)) return "Monotributista";
  if (["cf", "consumidor final", "final"].includes(n)) return "Consumidor Final";
  if (["ex", "exento", "iva exento"].includes(n)) return "Exento";
  return v; // lo valida el servidor y muestra el error en la fila
}

function convertirBooleano(v: string): boolean | string {
  const n = normalizar(v);
  if (["si", "s", "x", "1", "true", "verdadero", "yes"].includes(n)) return true;
  if (["no", "n", "0", "false", "falso"].includes(n)) return false;
  return v;
}

function convertir(valor: unknown, tipo: Tipo): unknown {
  if (valor === null || valor === undefined) return undefined;
  if (typeof valor === "number") {
    if (tipo === "texto") return String(valor);
    if (tipo === "booleano") return valor !== 0;
    return valor;
  }
  if (typeof valor === "boolean") return tipo === "booleano" ? valor : String(valor);
  const s = String(valor).trim();
  if (s === "") return undefined;
  switch (tipo) {
    case "numero": {
      const n = aNumero(s);
      return Number.isNaN(n) ? s : n;
    }
    case "booleano":
      return convertirBooleano(s);
    case "condicionIva":
      return convertirCondicionIva(s);
    case "estado":
      return normalizar(s).startsWith("inac") ? "Inactivo" : "Activo";
    default:
      return s;
  }
}

export interface Mapeo {
  filas: Record<string, unknown>[];
  /** encabezado del archivo → campo reconocido */
  reconocidas: { encabezado: string; campo: string; nombre: string }[];
  ignoradas: string[];
  /** Falta la columna que identifica cada registro (CUIT o código): sin ella no se puede importar */
  faltantes: string[];
  /** true si trae todas las columnas obligatorias; si no, solo sirve para actualizar los que ya existen */
  completo: boolean;
}

/** Columna que identifica cada registro */
const CLAVE: Record<Entidad, string> = { clientes: "cuit", productos: "codigo" };

/** Traduce las filas del archivo (claves = encabezados) a los campos que entiende la API */
export function mapearFilas(entidad: Entidad, crudas: Record<string, unknown>[]): Mapeo {
  const columnas = COLUMNAS[entidad];
  const encabezados = [...new Set(crudas.flatMap((f) => Object.keys(f)))];
  const reconocidas: Mapeo["reconocidas"] = [];
  const ignoradas: string[] = [];

  for (const enc of encabezados) {
    const n = normalizar(enc);
    const col = columnas.find((c) => normalizar(c.encabezado) === n || normalizar(c.campo) === n || c.sinonimos.some((s) => normalizar(s) === n));
    if (col && !reconocidas.some((r) => r.campo === col.campo)) reconocidas.push({ encabezado: enc, campo: col.campo, nombre: col.encabezado });
    else ignoradas.push(enc);
  }

  const filas = crudas
    .map((cruda) => {
      const fila: Record<string, unknown> = {};
      for (const r of reconocidas) {
        const col = columnas.find((c) => c.campo === r.campo)!;
        const v = convertir(cruda[r.encabezado], col.tipo);
        if (v !== undefined) fila[r.campo] = v;
      }
      return fila;
    })
    // Filas totalmente vacías (típicas al final de un Excel) no cuentan
    .filter((f) => Object.keys(f).length > 0);

  const sinColumna = columnas.filter((c) => c.obligatoria && !reconocidas.some((r) => r.campo === c.campo));
  const faltantes = sinColumna.filter((c) => c.campo === CLAVE[entidad]).map((c) => c.encabezado);
  return { filas, reconocidas, ignoradas, faltantes, completo: sinColumna.length === 0 };
}

const cargarXlsx = () => import("xlsx");

/**
 * Excel en Windows en español guarda los CSV en "ANSI" (Windows-1252), no en UTF-8:
 * si el texto no es UTF-8 válido, se lee con esa codificación para que los acentos y la ñ salgan bien.
 */
export function decodificarCsv(datos: ArrayBuffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(datos);
  } catch {
    return new TextDecoder("windows-1252").decode(datos);
  }
}

/** Lee un .xlsx, .xls o .csv y devuelve una fila por registro con los encabezados como claves */
export async function leerArchivo(archivo: File): Promise<Record<string, unknown>[]> {
  const XLSX = await cargarXlsx();
  let libro;
  if (/\.csv$/i.test(archivo.name) || archivo.type === "text/csv") {
    const texto = decodificarCsv(await archivo.arrayBuffer()).replace(/^﻿/, "");
    const primera = texto.split(/\r?\n/, 1)[0] ?? "";
    const separador = (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ";" : ",";
    // En CSV todo se lee como texto: los números con formato argentino se convierten después
    libro = XLSX.read(texto, { type: "string", FS: separador, raw: true });
  } else {
    libro = XLSX.read(await archivo.arrayBuffer(), { type: "array" });
  }
  const hoja = libro.Sheets[libro.SheetNames[0]!];
  if (!hoja) throw new Error("El archivo no tiene hojas");
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: "" });
}

const siNo = (b: boolean) => (b ? "Sí" : "No");

function filasExportacion(entidad: Entidad, datos: ClienteApi[] | ProductoApi[]) {
  if (entidad === "clientes") {
    return (datos as ClienteApi[]).map((c) => ({
      "Razón social": c.razonSocial,
      CUIT: `${c.cuit.slice(0, 2)}-${c.cuit.slice(2, 10)}-${c.cuit.slice(10)}`,
      "Condición IVA": c.condicionIva,
      Contacto: c.contacto ?? "",
      Email: c.email ?? "",
      Teléfono: c.telefono ?? "",
      Domicilio: c.domicilio ?? "",
      Localidad: c.localidad ?? "",
      Rubro: c.rubro ?? "",
      Notas: c.notas ?? "",
      Estado: c.estado,
    }));
  }
  return (datos as ProductoApi[]).map((p) => ({
    Código: p.codigo,
    Descripción: p.descripcion,
    Categoría: p.categoria ?? "",
    Unidad: p.unidad,
    "Precio sin IVA": p.precio,
    "IVA %": p.alicuotaIva,
    "Controla stock": siNo(p.controlaStock),
    Stock: p.controlaStock ? p.stock : "",
    "Stock mínimo": p.controlaStock ? p.stockMinimo : "",
    Activo: siNo(p.activo),
  }));
}

function descargar(contenido: BlobPart, nombre: string, tipo: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const hoy = () => new Date().toISOString().slice(0, 10);

/** Exporta con las mismas columnas que la plantilla: se puede editar y volver a importar */
export async function exportar(entidad: Entidad, datos: ClienteApi[] | ProductoApi[], formato: "xlsx" | "csv") {
  const XLSX = await cargarXlsx();
  const filas = filasExportacion(entidad, datos);
  const encabezados = COLUMNAS[entidad].map((c) => c.encabezado);
  const hoja = XLSX.utils.json_to_sheet(filas, { header: encabezados });
  const nombre = `${entidad}-${hoy()}`;
  if (formato === "csv") {
    // Separador ";" y BOM: así Excel en español lo abre bien, con acentos
    descargar("﻿" + XLSX.utils.sheet_to_csv(hoja, { FS: ";" }), `${nombre}.csv`, "text/csv;charset=utf-8");
    return;
  }
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, entidad === "clientes" ? "Clientes" : "Productos");
  descargar(XLSX.write(libro, { bookType: "xlsx", type: "array" }), `${nombre}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

/** Planilla modelo con los encabezados y una fila de ejemplo */
export async function descargarPlantilla(entidad: Entidad) {
  const XLSX = await cargarXlsx();
  const columnas = COLUMNAS[entidad];
  const hoja = XLSX.utils.aoa_to_sheet([columnas.map((c) => c.encabezado), columnas.map((c) => c.ejemplo)]);
  hoja["!cols"] = columnas.map((c) => ({ wch: Math.max(14, c.encabezado.length + 4) }));
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Plantilla");
  descargar(XLSX.write(libro, { bookType: "xlsx", type: "array" }), `plantilla-${entidad}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

export interface HojaReporte {
  nombre: string;
  filas: (string | number)[][];
  anchos?: number[];
}

/** Reporte en Excel: una hoja por sección, los importes como números (se pueden sumar en Excel) */
export async function exportarReporte(archivo: string, hojas: HojaReporte[]) {
  const XLSX = await cargarXlsx();
  const libro = XLSX.utils.book_new();
  for (const h of hojas) {
    const hoja = XLSX.utils.aoa_to_sheet(h.filas);
    if (h.anchos) hoja["!cols"] = h.anchos.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(libro, hoja, h.nombre.slice(0, 31));
  }
  descargar(XLSX.write(libro, { bookType: "xlsx", type: "array" }), `${archivo}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
