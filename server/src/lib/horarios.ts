/** Horarios de atención de cada profesional (o recurso) de la agenda, bloqueos y turnos libres */

export type Franja = { dia: number; desde: string; hasta: string };
export type Bloqueo = { recursoId: string | null; desde: string; hasta: string; horaDesde: string | null; horaHasta: string | null; motivo: string };
type Ocupado = { inicio: string; fin: string };

export const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

export const aMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
export const aHora = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Día de la semana de una fecha "aaaa-mm-dd" (0 domingo … 6 sábado), sin depender del huso horario */
export const diaDeSemana = (fecha: string) => new Date(`${fecha}T12:00:00Z`).getUTCDay();

/** Las franjas en que atiende ese día, ordenadas. Sin horarios cargados no hay restricción: null */
export function franjasDelDia(horarios: Franja[], fecha: string): Franja[] | null {
  if (!horarios.length) return null;
  const dia = diaDeSemana(fecha);
  return horarios.filter((h) => h.dia === dia).sort((a, b) => a.desde.localeCompare(b.desde));
}

/** Texto para el aviso: "los lunes atiende de 09:00 a 13:00 y de 16:00 a 20:00" */
export function textoHorario(horarios: Franja[], fecha: string) {
  const f = franjasDelDia(horarios, fecha) ?? [];
  const dia = DIAS[diaDeSemana(fecha)];
  if (!f.length) return `los ${dia === "sábado" || dia === "domingo" ? `${dia}s` : dia} no atiende`;
  return `los ${dia === "sábado" || dia === "domingo" ? `${dia}s` : dia} atiende ${f.map((x) => `de ${x.desde} a ${x.hasta}`).join(" y ")}`;
}

/** Si el horario entra completo en una de las franjas del día (o no hay horarios cargados) */
export function dentroDeHorario(horarios: Franja[], fecha: string, inicio: string, fin: string) {
  const f = franjasDelDia(horarios, fecha);
  if (f === null) return true;
  return f.some((x) => x.desde <= inicio && fin <= x.hasta);
}

/** El primer bloqueo (del recurso o general) que cae sobre ese horario */
export function bloqueoQueCae(bloqueos: Bloqueo[], recursoId: string, fecha: string, inicio: string, fin: string) {
  return bloqueos.find((b) => (!b.recursoId || b.recursoId === recursoId) && b.desde <= fecha && fecha <= b.hasta && (!b.horaDesde || !b.horaHasta || (b.horaDesde < fin && inicio < b.horaHasta)));
}

/** Validación de las franjas: horas bien formadas, que terminen después de empezar y que no se pisen el mismo día */
export function errorEnFranjas(horarios: Franja[]): string | null {
  for (const [i, h] of horarios.entries()) {
    if (h.hasta <= h.desde) return `El ${DIAS[h.dia]} tiene que terminar después de empezar`;
    const pisa = horarios.find((o, j) => j !== i && o.dia === h.dia && o.desde < h.hasta && h.desde < o.hasta);
    if (pisa) return `El ${DIAS[h.dia]} tiene dos franjas que se pisan`;
  }
  return null;
}

/**
 * Horarios de inicio libres de un día, cada `duracion` minutos: dentro de sus franjas (o de la franja general de la
 * agenda si no tiene horarios cargados), sin pisar turnos ni bloqueos, y si es hoy, desde ahora en adelante.
 */
export function turnosLibres(opts: {
  horarios: Franja[];
  franjaGeneral: { desde: string; hasta: string };
  duracion: number;
  fecha: string;
  recursoId: string;
  ocupados: Ocupado[];
  bloqueos: Bloqueo[];
  desdeMin?: number;
}) {
  const franjas = franjasDelDia(opts.horarios, opts.fecha) ?? [{ dia: 0, ...opts.franjaGeneral }];
  const libres: string[] = [];
  for (const f of franjas) {
    for (let m = aMin(f.desde); m + opts.duracion <= aMin(f.hasta); m += opts.duracion) {
      if (opts.desdeMin !== undefined && m < opts.desdeMin) continue;
      const inicio = aHora(m);
      const fin = aHora(m + opts.duracion);
      if (opts.ocupados.some((o) => o.inicio < fin && inicio < o.fin)) continue;
      if (bloqueoQueCae(opts.bloqueos, opts.recursoId, opts.fecha, inicio, fin)) continue;
      libres.push(inicio);
    }
  }
  return libres;
}
