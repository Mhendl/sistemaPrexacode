import { describe, expect, it } from "vitest";
// Regla de la web para leer números tipeados por el usuario (misma que usan formularios e importación)
import { aNumero } from "../../src/lib/numeros.js";

describe("lectura de números con formato argentino", () => {
  it.each([
    ["12.500", 12500],
    ["1.234.567", 1234567],
    ["1.234,50", 1234.5],
    ["8,5", 8.5],
    ["5.5", 5.5],
    ["0.25", 0.25],
    ["$ 24.900,50", 24900.5],
    ["21%", 21],
    ["1500", 1500],
  ])("%s → %d", (texto, esperado) => {
    expect(aNumero(texto)).toBe(esperado);
  });

  it("vacío o basura da NaN (lo rechaza la validación)", () => {
    expect(aNumero("")).toBeNaN();
    expect(aNumero("caro")).toBeNaN();
  });
});
