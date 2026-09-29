/**
 * Texto → número, con la convención argentina (coma decimal, punto de miles):
 * - "1.234,50" → 1234.5   (con coma: los puntos son de miles)
 * - "12.500" → 12500      (puntos agrupando de a 3 dígitos: son de miles)
 * - "5.5" → 5.5            (un punto que no agrupa miles: se toma como decimal)
 * - "$ 1.000" y "21%" también se aceptan. Vacío → NaN (lo valida el servidor).
 */
export function aNumero(s: string): number {
  const t = s.trim().replace(/^\$\s*/, "").replace(/\s*%$/, "").replace(/\s/g, "");
  if (t === "") return Number.NaN;
  if (t.includes(",")) return Number(t.replace(/\./g, "").replace(",", "."));
  if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ""));
  return Number(t);
}
