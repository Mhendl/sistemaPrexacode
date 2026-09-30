/**
 * CoreDental: lo propio de los consultorios odontológicos que no depende de una pantalla en particular.
 */
import type { Db } from "../db/client.js";
import { agendaRecursos, configAgenda, obrasSociales, prestaciones } from "../db/schema.js";

type Tx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Nomenclatura FDI: permanentes 11–18, 21–28, 31–38, 41–48; temporarias 51–55, 61–65, 71–75, 81–85 */
export const PIEZAS_PERMANENTES = [1, 2, 3, 4].flatMap((c) => [1, 2, 3, 4, 5, 6, 7, 8].map((n) => c * 10 + n));
export const PIEZAS_TEMPORARIAS = [5, 6, 7, 8].flatMap((c) => [1, 2, 3, 4, 5].map((n) => c * 10 + n));
export const PIEZAS = [...PIEZAS_PERMANENTES, ...PIEZAS_TEMPORARIAS];
/** V vestibular · L lingual/palatino · M mesial · D distal · O oclusal/incisal */
export const CARAS = ["V", "L", "M", "D", "O"] as const;
export const ESTADOS_ODONTOGRAMA = ["existente", "a_realizar", "realizado"] as const;
export const ALCANCES = ["cara", "pieza", "general"] as const;
export const SIMBOLOS = ["relleno", "cruz", "circulo", "ausente", "texto"] as const;
export const TIPOS_ARCHIVO = ["Radiografía", "Foto", "Estudio", "Documento"] as const;

/** Nomenclador con el que arranca un consultorio (lo puede editar y ampliar) */
export const PRESTACIONES_INICIALES: { codigo: string; nombre: string; alcance: (typeof ALCANCES)[number]; simbolo: (typeof SIMBOLOS)[number]; etiqueta?: string }[] = [
  { codigo: "01.01", nombre: "Consulta y examen", alcance: "general", simbolo: "relleno" },
  { codigo: "01.04", nombre: "Limpieza y fluoración", alcance: "general", simbolo: "relleno" },
  { codigo: "09.01", nombre: "Radiografía periapical", alcance: "general", simbolo: "relleno" },
  { codigo: "CAR", nombre: "Caries", alcance: "cara", simbolo: "relleno" },
  { codigo: "02.01", nombre: "Obturación con amalgama", alcance: "cara", simbolo: "relleno" },
  { codigo: "02.08", nombre: "Obturación con resina", alcance: "cara", simbolo: "relleno" },
  { codigo: "01.05", nombre: "Sellador de fosas y fisuras", alcance: "cara", simbolo: "relleno" },
  { codigo: "03.01", nombre: "Tratamiento de conducto", alcance: "pieza", simbolo: "texto", etiqueta: "TC" },
  { codigo: "04.01", nombre: "Corona", alcance: "pieza", simbolo: "circulo" },
  { codigo: "05.01", nombre: "Prótesis", alcance: "pieza", simbolo: "texto", etiqueta: "PR" },
  { codigo: "08.01", nombre: "Implante", alcance: "pieza", simbolo: "texto", etiqueta: "IMP" },
  { codigo: "10.01", nombre: "Extracción", alcance: "pieza", simbolo: "cruz" },
  { codigo: "AUS", nombre: "Pieza ausente", alcance: "pieza", simbolo: "ausente" },
];

const OBRAS_SOCIALES_INICIALES = ["OSDE", "Swiss Medical", "Galeno", "Medifé", "Sancor Salud", "Omint", "IOMA", "PAMI", "OSECAC", "OSDEPYM"];

/** Un consultorio nuevo arranca con su nomenclador, las obras sociales más comunes y la agenda de turnos */
export async function prepararConsultorio(db: Tx, empresaId: string, admin: { id: string; nombre: string }) {
  await db.insert(prestaciones).values(PRESTACIONES_INICIALES.map((p) => ({ ...p, etiqueta: p.etiqueta ?? null, empresaId })));
  await db.insert(obrasSociales).values(OBRAS_SOCIALES_INICIALES.map((nombre) => ({ empresaId, nombre })));
  await db.insert(configAgenda).values({ empresaId, nombreEvento: "Turno", nombreRecurso: "Profesional", tiposEvento: ["Consulta", "Control", "Tratamiento", "Limpieza", "Urgencia"] });
  await db.insert(agendaRecursos).values({ empresaId, nombre: admin.nombre, usuarioId: admin.id, color: "oklch(0.64 0.14 200)" });
}

/** Edad cumplida a una fecha (aaaa-mm-dd) */
export function edad(nacimiento: string | null, hoy: string): number | null {
  if (!nacimiento) return null;
  const [a, m, d] = nacimiento.split("-").map(Number) as [number, number, number];
  const [ha, hm, hd] = hoy.split("-").map(Number) as [number, number, number];
  return ha - a - (hm < m || (hm === m && hd < d) ? 1 : 0);
}
