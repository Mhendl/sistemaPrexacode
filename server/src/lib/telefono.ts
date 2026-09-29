/**
 * Teléfono argentino → formato internacional para WhatsApp (wa.me): 549 + característica + número, sin 0 ni 15.
 * Devuelve null si no se puede interpretar con seguridad (entonces WhatsApp deja elegir el contacto).
 *
 * Ejemplos: "11 5555-1234" → 5491155551234 · "011 15 5555-1234" → 5491155551234
 *           "(0221) 15-555-0101" → 5492215550101 · "+54 9 351 555 0101" → 5493515550101
 */
export function telefonoWhatsapp(entrada: string | null | undefined): string | null {
  if (!entrada) return null;
  let d = entrada.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("54")) {
    d = d.slice(2);
    if (d.startsWith("9")) d = d.slice(1);
  }
  if (d.startsWith("0")) d = d.slice(1);
  // Nacional: característica (2 a 4 dígitos) + número; con el "15" del celular son 12 dígitos
  if (d.length === 12) {
    for (const largo of [2, 3, 4]) {
      if (d.slice(largo, largo + 2) === "15") {
        d = d.slice(0, largo) + d.slice(largo + 2);
        break;
      }
    }
  }
  if (d.length !== 10) return null;
  return `549${d}`;
}
