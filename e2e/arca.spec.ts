import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { crearCa } from "../server/test/arca-falso";
import { crearCuenta, entrarCon } from "./helpers";

test.describe("Conexión con ARCA", () => {
  test("generar el pedido, subir el certificado de homologación y cambiar de modo", async ({ page, request }) => {
    const cuenta = await crearCuenta(request, "Ñandú Hogar S.A.");
    await entrarCon(page, cuenta);
    await page.goto("/configuracion?tab=arca");
    await expect(page.getByTestId("modo-arca")).toContainText("Modo de prueba (simulador)");
    await expect(page.getByTestId("certificado-arca")).toContainText("Todavía no hay certificado cargado");
    // Sin certificado, solo el simulador
    await expect(page.getByRole("radio", { name: /Homologación/ })).toBeDisabled();
    await expect(page.getByRole("radio", { name: /Producción/ })).toBeDisabled();

    // 1. Pedido de certificado: se descarga el .csr
    const [descarga] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Generar pedido (.csr)" }).click()]);
    expect(descarga.suggestedFilename()).toBe("prexacode-nandu-hogar-s-a.csr");
    const csr = readFileSync((await descarga.path())!, "utf8");
    expect(csr).toContain("-----BEGIN CERTIFICATE REQUEST-----");
    await expect(page.getByTestId("csr-pendiente")).toBeVisible();

    // Un archivo que no es certificado
    await page.getByLabel("Archivo del certificado").setInputFiles({ name: "cualquiera.crt", mimeType: "application/x-x509-ca-cert", buffer: Buffer.from("esto no es un certificado ".repeat(10)) });
    await expect(page.getByText("no es un certificado válido")).toBeVisible();

    // 2. El certificado que "devuelve ARCA" (firmado por la CA de homologación de prueba)
    const cert = crearCa("Computadores Test").firmar(csr);
    await page.getByLabel("Archivo del certificado").setInputFiles({ name: "prexacode-nandu-hogar-s-a.crt", mimeType: "application/x-x509-ca-cert", buffer: Buffer.from(cert) });
    await expect(page.getByText("Certificado cargado")).toBeVisible();
    await expect(page.getByTestId("certificado-arca")).toContainText("De homologación (prueba)");
    await expect(page.getByTestId("certificado-arca")).toContainText("prexacode-nandu-hogar-s-a");
    await expect(page.getByTestId("csr-pendiente")).toHaveCount(0);

    // Con certificado de prueba: homologación sí, producción no
    await expect(page.getByRole("radio", { name: /Producción/ })).toBeDisabled();
    await page.getByRole("radio", { name: /Homologación/ }).click();
    await expect(page.getByTestId("modo-arca")).toContainText("ARCA homologación");
    await expect(page.getByRole("button", { name: "Probar conexión" })).toBeVisible();

    // En facturación se sigue avisando que no hay validez fiscal
    await page.goto("/facturacion");
    await expect(page.getByTestId("aviso-modo-prueba")).toContainText("homologación");

    // Volver al simulador
    await page.goto("/configuracion?tab=arca");
    await page.getByRole("radio", { name: /Simulador/ }).click();
    await expect(page.getByTestId("modo-arca")).toContainText("Modo de prueba (simulador)");
  });
});
