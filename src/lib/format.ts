const moneyFmt = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** $ 1.234.567,89 */
export function formatMoney(value: number): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}$ ${moneyFmt.format(Math.abs(value))}`;
}

/** $ 12,4 M — para indicadores y ejes de gráficos */
export function formatMoneyShort(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `$ ${(value / 1_000_000).toLocaleString("es-AR", { maximumFractionDigits: 1 })} M`;
  }
  // Debajo del millón se muestra el importe exacto: redondear a "mil" confunde en los indicadores
  return formatMoney(value);
}

/** Para ejes de gráficos, donde sí conviene abreviar: $ 500 mil, $ 12,4 M */
export function formatEje(value: number): string {
  if (Math.abs(value) >= 1_000_000) return formatMoneyShort(value);
  if (Math.abs(value) >= 1_000) return `$ ${(value / 1_000).toLocaleString("es-AR", { maximumFractionDigits: 0 })} mil`;
  return `$ ${value}`;
}

/** dd/mm/aaaa (acepta "aaaa-mm-dd" o Date) */
export function formatDate(value: string | Date): string {
  const d = typeof value === "string" ? new Date(`${value}T00:00:00`) : value;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** 30-12345678-9 */
export function formatCuit(value: string): string {
  if (!value) return "—"; // consumidor final sin identificar
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 11) return value;
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}
