const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
const PREFIJOS = ["20", "23", "24", "25", "26", "27", "30", "33", "34"];

export const soloDigitos = (v: string) => v.replace(/\D/g, "");

/** Calcula el dígito verificador de un CUIT/CUIL a partir de sus primeros 10 dígitos */
export function digitoVerificador(base10: string): number {
  const suma = PESOS.reduce((acc, p, i) => acc + p * Number(base10[i]), 0);
  const resto = 11 - (suma % 11);
  if (resto === 11) return 0;
  if (resto === 10) return 9; // casos con prefijo 23/33 que ARCA reasigna
  return resto;
}

/** Valida formato, prefijo y dígito verificador (acepta con o sin guiones) */
export function esCuitValido(valor: string): boolean {
  const d = soloDigitos(valor);
  if (d.length !== 11) return false;
  if (!PREFIJOS.includes(d.slice(0, 2))) return false;
  return digitoVerificador(d.slice(0, 10)) === Number(d[10]);
}
