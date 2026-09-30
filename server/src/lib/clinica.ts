/**
 * CoreDental: plantillas de consentimiento informado y cálculos del periodontograma.
 */
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.js";
import { plantillasConsentimiento } from "../db/schema.js";
import { PIEZAS_PERMANENTES } from "./dental.js";

type Tx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Modelos de consentimiento con los que arranca un consultorio. Son orientativos: cada profesional los
 * revisa y adapta a su práctica. Se completan solos {paciente}, {dni}, {profesional}, {consultorio} y {fecha}.
 */
export const PLANTILLAS_INICIALES = [
  {
    titulo: "Consentimiento informado para tratamiento odontológico",
    texto: `Yo, {paciente}, DNI {dni}, autorizo a {profesional}, de {consultorio}, a realizarme el tratamiento odontológico que me fue explicado.

Declaro que se me informó, en forma clara y comprensible, el diagnóstico, el tratamiento propuesto, sus beneficios, los riesgos y molestias más frecuentes, las alternativas posibles y las consecuencias de no realizarlo, y que pude hacer todas las preguntas que consideré necesarias.

Informé mis antecedentes de salud, alergias y la medicación que tomo. Sé que el resultado no puede garantizarse y que durante el tratamiento pueden surgir situaciones que requieran cambiar lo planificado, lo que se me informará.

Sé que puedo revocar este consentimiento en cualquier momento antes o durante el tratamiento (Ley 26.529).

Fecha: {fecha}`,
  },
  {
    titulo: "Consentimiento para extracción dentaria",
    texto: `Yo, {paciente}, DNI {dni}, autorizo a {profesional} a realizarme la extracción de la/s pieza/s indicada/s.

Se me explicó que después de la extracción pueden presentarse dolor, inflamación, sangrado, hematomas, limitación para abrir la boca, infección o alveolitis, lesión de piezas vecinas o, con menor frecuencia, alteraciones de la sensibilidad del labio o la lengua, que en general son transitorias.

Me comprometo a seguir las indicaciones posteriores y a consultar ante cualquier síntoma. Informé mis antecedentes de salud, alergias y medicación (en especial anticoagulantes).

Sé que puedo revocar este consentimiento antes del procedimiento (Ley 26.529).

Fecha: {fecha}`,
  },
  {
    titulo: "Consentimiento para tratamiento de conducto (endodoncia)",
    texto: `Yo, {paciente}, DNI {dni}, autorizo a {profesional} a realizarme el tratamiento de conducto de la pieza indicada.

Se me explicó que el objetivo es conservar la pieza, que puede requerir varias sesiones y que después suele ser necesaria una restauración o corona. Entre los riesgos posibles están dolor o inflamación transitorios, fractura de instrumentos o de la pieza, perforaciones, y que el tratamiento no resulte exitoso y la pieza deba extraerse o retratarse.

Sé que puedo revocar este consentimiento en cualquier momento (Ley 26.529).

Fecha: {fecha}`,
  },
  {
    titulo: "Consentimiento para colocación de implante",
    texto: `Yo, {paciente}, DNI {dni}, autorizo a {profesional} a colocarme el/los implante/s dental/es planificado/s.

Se me explicó el procedimiento quirúrgico, el tiempo de integración del implante, que el éxito depende también de mis cuidados, de no fumar y de los controles, y que puede no integrarse y ser necesario retirarlo. Entre los riesgos están dolor, inflamación, hematomas, infección, alteraciones de la sensibilidad y, según la zona, compromiso del seno maxilar.

Informé mis antecedentes de salud, alergias y medicación. Sé que puedo revocar este consentimiento antes del procedimiento (Ley 26.529).

Fecha: {fecha}`,
  },
];

/** Las plantillas del consultorio (si todavía no tiene, se crean las iniciales) */
export async function plantillasDe(db: Tx, empresaId: string) {
  const actuales = await db.select().from(plantillasConsentimiento).where(eq(plantillasConsentimiento.empresaId, empresaId));
  if (actuales.length) return actuales;
  return db
    .insert(plantillasConsentimiento)
    .values(PLANTILLAS_INICIALES.map((p) => ({ ...p, empresaId })))
    .returning();
}

/** Completa los datos del paciente en el texto de la plantilla */
export function completarPlantilla(texto: string, datos: { paciente: string; dni: string | null; profesional: string; consultorio: string; fecha: string }) {
  const fecha = datos.fecha.split("-").reverse().join("/");
  return texto
    .replaceAll("{paciente}", datos.paciente)
    .replaceAll("{dni}", datos.dni ? Number(datos.dni).toLocaleString("es-AR") : "__________")
    .replaceAll("{profesional}", datos.profesional)
    .replaceAll("{consultorio}", datos.consultorio)
    .replaceAll("{fecha}", fecha);
}

// ---------------------------------------------------------------- periodontograma

export interface PiezaPerio {
  ausente?: boolean;
  /** Profundidad de sondaje (mm), 6 sitios: V distal, V medio, V mesial, L distal, L medio, L mesial */
  ps: (number | null)[];
  /** Margen gingival (mm): positivo = recesión, negativo = agrandamiento */
  mg: (number | null)[];
  sangrado: boolean[];
  placa: boolean[];
  movilidad: number;
  furca: number;
}

export const PIEZAS_PERIO = PIEZAS_PERMANENTES;

/** Índices del examen: los que el profesional mira para diagnosticar y comparar entre controles */
export function indicesPerio(piezas: Record<string, PiezaPerio>) {
  let sitios = 0;
  let sumaPs = 0;
  let sumaNic = 0;
  let sitiosNic = 0;
  let sangran = 0;
  let conPlaca = 0;
  let ps4 = 0;
  let ps6 = 0;
  let presentes = 0;
  for (const p of Object.values(piezas)) {
    if (p.ausente) continue;
    presentes++;
    for (let i = 0; i < 6; i++) {
      const ps = p.ps[i];
      if (ps === null || ps === undefined) continue;
      sitios++;
      sumaPs += ps;
      if (ps >= 4) ps4++;
      if (ps >= 6) ps6++;
      if (p.sangrado[i]) sangran++;
      if (p.placa[i]) conPlaca++;
      const mg = p.mg[i];
      if (mg !== null && mg !== undefined) {
        sumaNic += ps + mg;
        sitiosNic++;
      }
    }
  }
  const pct = (n: number) => (sitios ? Math.round((n / sitios) * 1000) / 10 : 0);
  return {
    piezas: presentes,
    sitios,
    psPromedio: sitios ? Math.round((sumaPs / sitios) * 10) / 10 : 0,
    nicPromedio: sitiosNic ? Math.round((sumaNic / sitiosNic) * 10) / 10 : null,
    sangrado: pct(sangran),
    placa: pct(conPlaca),
    sitiosPs4: ps4,
    sitiosPs6: ps6,
  };
}
