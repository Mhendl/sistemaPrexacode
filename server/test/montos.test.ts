import { describe, expect, it } from "vitest";
import { letraSegun } from "../src/lib/arca/codigos.js";
import { calcularTotales } from "../src/lib/arca/montos.js";

describe("letra del comprobante", () => {
  it("Responsable Inscripto: A a RI y a monotributistas; B al resto", () => {
    expect(letraSegun("Responsable Inscripto", "Responsable Inscripto")).toBe("A");
    expect(letraSegun("Responsable Inscripto", "Monotributista")).toBe("A");
    expect(letraSegun("Responsable Inscripto", "Consumidor Final")).toBe("B");
    expect(letraSegun("Responsable Inscripto", "Exento")).toBe("B");
  });
  it("Monotributista y Exento emiten C a cualquiera", () => {
    expect(letraSegun("Monotributista", "Responsable Inscripto")).toBe("C");
    expect(letraSegun("Exento", "Consumidor Final")).toBe("C");
  });
});

describe("cálculo de importes", () => {
  it("agrupa el IVA por alícuota y redondea como ARCA", () => {
    const t = calcularTotales(
      [
        { cantidad: 3, precioUnitario: 33.333, alicuotaIva: 21 }, // 99.999 → 100.00
        { cantidad: 1, precioUnitario: 1089000, alicuotaIva: 10.5 },
        { cantidad: 2, precioUnitario: 0.125, alicuotaIva: 21 }, // 0.25
      ],
      "A",
    );
    expect(t.subtotales).toEqual([100, 1089000, 0.25]);
    expect(t.iva).toEqual([
      { alicuota: 10.5, baseImponible: 1089000, importe: 114345 },
      { alicuota: 21, baseImponible: 100.25, importe: 21.05 },
    ]);
    expect(t.neto).toBe(1089100.25);
    expect(t.totalIva).toBe(114366.05);
    expect(t.total).toBe(1203466.3);
    expect(Math.round((t.neto + t.exento + t.totalIva) * 100)).toBe(Math.round(t.total * 100));
  });

  it("los ítems con alícuota 0 van como exentos", () => {
    const t = calcularTotales([{ cantidad: 1, precioUnitario: 1000, alicuotaIva: 0 }, { cantidad: 1, precioUnitario: 100, alicuotaIva: 21 }], "B");
    expect(t).toMatchObject({ exento: 1000, neto: 100, totalIva: 21, total: 1121 });
  });

  it("aplica bonificación por ítem", () => {
    const t = calcularTotales([{ cantidad: 2, precioUnitario: 500, alicuotaIva: 21, bonificacion: 10 }], "A");
    expect(t).toMatchObject({ neto: 900, totalIva: 189, total: 1089 });
  });

  it("en factura C no se discrimina IVA", () => {
    const t = calcularTotales([{ cantidad: 2, precioUnitario: 1500.5, alicuotaIva: 21 }], "C");
    expect(t).toMatchObject({ neto: 3001, totalIva: 0, iva: [], total: 3001 });
  });
});
