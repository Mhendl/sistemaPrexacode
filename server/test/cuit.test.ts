import { describe, expect, it } from "vitest";
import { esCuitValido } from "../src/lib/cuit.js";

describe("validación de CUIT", () => {
  it("acepta CUITs reales conocidos, con o sin guiones", () => {
    expect(esCuitValido("30500010912")).toBe(true); // Banco de la Nación Argentina
    expect(esCuitValido("33-69345023-9")).toBe(true); // ARCA (ex AFIP)
  });

  it("rechaza dígito verificador incorrecto", () => {
    expect(esCuitValido("30500010913")).toBe(false);
  });

  it("rechaza largo o prefijo inválidos", () => {
    expect(esCuitValido("3050001091")).toBe(false);
    expect(esCuitValido("99500010912")).toBe(false);
    expect(esCuitValido("")).toBe(false);
  });
});
