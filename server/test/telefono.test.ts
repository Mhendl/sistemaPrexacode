import { describe, expect, it } from "vitest";
import { telefonoWhatsapp } from "../src/lib/telefono.js";

describe("teléfono para WhatsApp", () => {
  it.each([
    ["11 5555-1234", "5491155551234"],
    ["011 15 5555-1234", "5491155551234"],
    ["(011) 15-5555-1234", "5491155551234"],
    ["1155551234", "5491155551234"],
    ["+54 9 11 5555-1234", "5491155551234"],
    ["+54 11 5555-1234", "5491155551234"],
    ["0054 9 11 5555 1234", "5491155551234"],
    ["(0221) 15-555-0101", "5492215550101"],
    ["221 555-0101", "5492215550101"],
    ["+54 9 351 555 0101", "5493515550101"],
    ["0351 15 555 0101", "5493515550101"],
    ["(02944) 15-12-3456", "5492944123456"],
  ])("%s → %s", (entrada, esperado) => {
    expect(telefonoWhatsapp(entrada)).toBe(esperado);
  });

  it.each([[null], [""], ["sin teléfono"], ["4555-1234"], ["123"]])("no se puede interpretar: %s", (entrada) => {
    expect(telefonoWhatsapp(entrada)).toBeNull();
  });
});
