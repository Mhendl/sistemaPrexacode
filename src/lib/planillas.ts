/**
 * Importación y exportación de planillas (Excel / CSV).
 * La librería se carga solo cuando se usa, para no agrandar la app.
 */
import type { ClienteApi, ProductoApi } from "@/api/types";
import { aNumero } from "@/lib/numeros";

export type Entidad = "clientes" | "productos" | "pacientes";
type Tipo = "texto" | "numero" | "booleano" | "condicionIva" | "estado" | "fecha" | "sexo";

/** Un paciente tal como se exporta */
export interface PacienteExportado {
  apellido: string;
  nombre: string;
  dni: string | null;
  fechaNacimiento: string | null;
  sexo: string | null;
  telefono: string | null;
  email: string | null;
  domicilio: string | null;
  localidad: string | null;
  obraSocial: string | null;
  plan: string | null;
  numeroAfiliado: string | null;
  notas: string | null;
  estado: string;
}

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
  pacientes: [
    { campo: "apellido", encabezado: "Apellido", sinonimos: ["apellidos"], tipo: "texto", obligatoria: true, ejemplo: "Pérez" },
    { campo: "nombre", encabezado: "Nombre", sinonimos: ["nombres"], tipo: "texto", obligatoria: true, ejemplo: "Juan Carlos" },
    { campo: "dni", encabezado: "DNI", sinonimos: ["documento", "nro documento", "numero de documento", "nro doc", "doc", "d.n.i."], tipo: "texto", ejemplo: "30123456" },
    { campo: "fechaNacimiento", encabezado: "Fecha de nacimiento", sinonimos: ["nacimiento", "fecha nac", "fecha nacimiento", "f. nacimiento", "fec nac", "fecha de nac"], tipo: "fecha", ejemplo: "15/03/1985" },
    { campo: "sexo", encabezado: "Sexo", sinonimos: ["genero"], tipo: "sexo", ejemplo: "M" },
    { campo: "telefono", encabezado: "Teléfono", sinonimos: ["tel", "celular", "whatsapp", "movil", "telefono celular", "cel"], tipo: "texto", ejemplo: "11 5555-1234" },
    { campo: "email", encabezado: "Email", sinonimos: ["e-mail", "mail", "correo", "correo electronico"], tipo: "texto", ejemplo: "juan.perez@gmail.com" },
    { campo: "domicilio", encabezado: "Domicilio", sinonimos: ["direccion", "calle"], tipo: "texto", ejemplo: "Av. Rivadavia 1234" },
    { campo: "localidad", encabezado: "Localidad", sinonimos: ["ciudad", "partido", "barrio"], tipo: "texto", ejemplo: "CABA" },
    { campo: "obraSocial", encabezado: "Obra social", sinonimos: ["cobertura", "prepaga", "os", "obra social / prepaga", "obra social o prepaga"], tipo: "texto", ejemplo: "OSDE" },
    { campo: "plan", encabezado: "Plan", sinonimos: ["plan obra social"], tipo: "texto", ejemplo: "210" },
    { campo: "numeroAfiliado", encabezado: "N° de afiliado", sinonimos: ["nro afiliado", "numero de afiliado", "afiliado", "n afiliado", "credencial", "nro de afiliado", "numero afiliado"], tipo: "texto", ejemplo: "61-123456-01" },
    { campo: "alergias", encabezado: "Alergias", sinonimos: ["alergia"], tipo: "texto", ejemplo: "" },
    { campo: "medicacion", encabezado: "Medicación", sinonimos: ["medicamentos"], tipo: "texto", ejemplo: "" },
    { campo: "antecedentes", encabezado: "Antecedentes", sinonimos: ["antecedentes medicos", "antecedentes de salud", "enfermedades"], tipo: "texto", ejemplo: "" },
    { campo: "notas", encabezado: "Notas", sinonimos: ["observaciones", "comentarios"], tipo: "texto", ejemplo: "" },
    { campo: "estado", encabezado: "Estado", sinonimos: [], tipo: "estado", ejemplo: "Activo" },
    // Si la planilla trae todo junto ("Pérez, Juan"): se separa solo
    { campo: "nombreCompleto", encabezado: "Apellido y nombre", sinonimos: ["paciente", "nombre y apellido", "nombre completo", "apellido, nombre", "apellidos y nombres"], tipo: "texto", ejemplo: "" },
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

/** "15/03/1985", "15-3-85" o "1985-03-15" → "1985-03-15" (si no se entiende, se deja como vino y el servidor marca el error) */
function convertirFecha(v: string): string {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  if (iso) return `${iso[1]}-${iso[2]!.padStart(2, "0")}-${iso[3]!.padStart(2, "0")}`;
  const m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/.exec(v);
  if (!m) return v;
  const anio = m[3]!.length === 2 ? (Number(m[3]) > new Date().getFullYear() % 100 ? `19${m[3]}` : `20${m[3]}`) : m[3]!;
  return `${anio}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
}
/** Fecha guardada por Excel como número de serie (días desde 1900) */
const fechaDeExcel = (n: number) => new Date(Math.round((n - 25569) * 86_400_000)).toISOString().slice(0, 10);

function convertirSexo(v: string): string {
  const n = normalizar(v);
  if (["f", "femenino", "mujer", "fem"].includes(n)) return "F";
  if (["m", "masculino", "hombre", "varon", "masc"].includes(n)) return "M";
  if (["x", "otro", "no binario"].includes(n)) return "X";
  return v;
}

function convertirBooleano(v: string): boolean | string {
  const n = normalizar(v);
  if (["si", "s", "x", "1", "true", "verdadero", "yes"].includes(n)) return true;
  if (["no", "n", "0", "false", "falso"].includes(n)) return false;
  return v;
}

function convertir(valor: unknown, tipo: Tipo): unknown {
  if (valor === null || valor === undefined) return undefined;
  if (valor instanceof Date) return tipo === "fecha" ? valor.toISOString().slice(0, 10) : String(valor);
  if (typeof valor === "number") {
    if (tipo === "fecha") return valor > 1000 && valor < 80000 ? fechaDeExcel(valor) : String(valor);
    if (tipo === "texto" || tipo === "sexo") return String(valor);
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
    case "fecha":
      return convertirFecha(s);
    case "sexo":
      return convertirSexo(s);
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
const CLAVE: Record<Entidad, string> = { clientes: "cuit", productos: "codigo", pacientes: "apellido" };

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

  // Pacientes: "Apellido y nombre" en una sola columna vale por las dos
  const juntos = entidad === "pacientes" && reconocidas.some((r) => r.campo === "nombreCompleto");
  const sinColumna = juntos ? [] : columnas.filter((c) => c.obligatoria && !reconocidas.some((r) => r.campo === c.campo));
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
    libro = XLSX.read(await archivo.arrayBuffer(), { type: "array", cellDates: true });
  }
  const hoja = libro.Sheets[libro.SheetNames[0]!];
  if (!hoja) throw new Error("El archivo no tiene hojas");
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { defval: "" });
}

const siNo = (b: boolean) => (b ? "Sí" : "No");

const fechaAr = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "");

function filasExportacion(entidad: Entidad, datos: ClienteApi[] | ProductoApi[] | PacienteExportado[]) {
  if (entidad === "pacientes") {
    return (datos as PacienteExportado[]).map((p) => ({
      Apellido: p.apellido,
      Nombre: p.nombre,
      DNI: p.dni ?? "",
      "Fecha de nacimiento": fechaAr(p.fechaNacimiento),
      Sexo: p.sexo ?? "",
      Teléfono: p.telefono ?? "",
      Email: p.email ?? "",
      Domicilio: p.domicilio ?? "",
      Localidad: p.localidad ?? "",
      "Obra social": p.obraSocial ?? "",
      Plan: p.plan ?? "",
      "N° de afiliado": p.numeroAfiliado ?? "",
      Notas: p.notas ?? "",
      Estado: p.estado,
    }));
  }
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
export async function exportar(entidad: Entidad, datos: ClienteApi[] | ProductoApi[] | PacienteExportado[], formato: "xlsx" | "csv") {
  const XLSX = await cargarXlsx();
  const filas = filasExportacion(entidad, datos);
  const encabezados = filas[0] ? Object.keys(filas[0]) : COLUMNAS[entidad].map((c) => c.encabezado);
  const hoja = XLSX.utils.json_to_sheet(filas, { header: encabezados });
  const nombre = `${entidad}-${hoy()}`;
  if (formato === "csv") {
    // Separador ";" y BOM: así Excel en español lo abre bien, con acentos
    descargar("﻿" + XLSX.utils.sheet_to_csv(hoja, { FS: ";" }), `${nombre}.csv`, "text/csv;charset=utf-8");
    return;
  }
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, entidad === "clientes" ? "Clientes" : entidad === "pacientes" ? "Pacientes" : "Productos");
  descargar(XLSX.write(libro, { bookType: "xlsx", type: "array" }), `${nombre}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

/** Planilla modelo con los encabezados y una fila de ejemplo */
export async function descargarPlantilla(entidad: Entidad) {
  const XLSX = await cargarXlsx();
  const columnas = COLUMNAS[entidad].filter((c) => c.campo !== "nombreCompleto");
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
