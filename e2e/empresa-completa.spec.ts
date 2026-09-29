/**
 * TRAZADO COMPLETO: una empresa real usando Prexacode de punta a punta, por la pantalla,
 * con tres personas (administrador, vendedor y depósito) en ventanas separadas.
 *
 * En cada paso se cruzan los números entre módulos: stock, cuenta corriente, cobranzas,
 * reportes, Libro IVA, Inicio y el Excel exportado tienen que decir lo mismo.
 *
 * Cuentas de la empresa (todo en pesos):
 *   A1  Constructora (RI)  3 notebooks + 2 monitores ........ 3.253.350,00  cuenta corriente (desde presupuesto)
 *   B1  Laura (CF)         2 tóner + 1 mouse ...................  92.565,00  contado, efectivo
 *   B2  Colegio (Exento)   3 horas de soporte ..................  145.200,00  cuenta corriente
 *   A2  Estudio (Monotr.)  14 tóner ............................  542.080,00  cuenta corriente
 *   NC  Constructora       devuelve 1 monitor ................. −217.800,00
 *   Cobro a Constructora ....................................... 1.500.000,00
 */
import { readFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import * as XLSX from "xlsx";
import { cuitValido, elegir, emailUnico, formatear, loginUI, PASSWORD, entrarAlPanel } from "./helpers";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

const excel = (filas: (string | number)[][]) => {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), "Clientes");
  return XLSX.write(libro, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

async function nuevaVentana(browser: Browser, email: string) {
  const page = await browser.newPage();
  await loginUI(page, email);
  await expect(page.getByRole("heading", { name: /^Hola, / })).toBeVisible();
  return page;
}

async function agregarProducto(page: Page, nombre: RegExp) {
  await page.getByRole("combobox", { name: "Agregar producto" }).click();
  await page.getByRole("option", { name: nombre }).click();
}

async function stockDe(page: Page, descripcion: string) {
  await page.goto("/productos");
  await page.getByRole("cell", { name: new RegExp(descripcion) }).first().click();
  return page.getByTestId("stock-actual");
}

test("una empresa real de punta a punta: todo cierra en todos los módulos", async ({ page, browser, request }) => {
  test.setTimeout(240_000);
  const t0 = Date.now();
  const paso = test.step;
  const conTiempo = (async (nombre: string, fn: () => Promise<unknown>) => {
    const t = Date.now();
    await paso(nombre, fn as () => Promise<void>);
    console.log(`[${((Date.now() - t0) / 1000).toFixed(1)} s] ${nombre} (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  }) as typeof test.step;
  const admin = { email: emailUnico("andina"), cuit: formatear(cuitValido("30")) };
  const vendedor = emailUnico("diego");
  const deposito = emailUnico("oscar");

  await conTiempo("1. Se registra la empresa, aceptando los términos", async () => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Crear cuenta" }).click();
    await page.getByLabel("Razón social").fill("Distribuidora Andina S.R.L.");
    await page.getByLabel("CUIT").fill(admin.cuit);
    await elegir(page, "Condición frente al IVA", "Responsable Inscripto");
    await page.getByLabel("Nombre y apellido").fill("Martín Andina");
    await page.getByLabel("Email").fill(admin.email);
    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByLabel(/Leí y acepto/).check();
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByRole("heading", { name: "Hola, Martín" })).toBeVisible();
    await expect(page.getByTestId("aviso-suscripcion")).toContainText("14 días de prueba gratis");
    await expect(page.getByTestId("primeros-pasos")).toContainText("0 de 5");
  });

  await conTiempo("2. Completa los datos de la empresa y sube el logo", async () => {
    await page.goto("/configuracion?tab=empresa");
    await page.getByLabel("Nombre de fantasía").fill("Andina Tecnología");
    await page.getByLabel("Ingresos Brutos").fill("901-654321-8");
    await page.getByLabel("Inicio de actividades").fill("2015-04-01");
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText(/Datos guardados|guardad/i).first()).toBeVisible();
    await page.getByLabel("Archivo de logo").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByRole("img", { name: /Logo de/ }).first()).toBeVisible();
  });

  await conTiempo("3. Suma al equipo: un vendedor y uno de depósito", async () => {
    for (const [nombre, email, rol] of [
      ["Diego Vendedor", vendedor, "Ventas"],
      ["Oscar Depósito", deposito, "Operaciones"],
    ] as const) {
      await page.goto("/configuracion?tab=usuarios");
      await page.getByRole("button", { name: "Nuevo usuario" }).click();
      const d = page.getByRole("dialog");
      await d.getByLabel("Nombre y apellido").fill(nombre);
      await d.getByLabel("Email").fill(email);
      await elegir(page, "Rol", rol);
      await d.getByLabel("Contraseña inicial").fill(PASSWORD);
      await d.getByRole("button", { name: "Crear usuario" }).click();
      await expect(page.getByTestId(`usuario-${email}`)).toBeVisible();
    }
  });

  await conTiempo("4. Importa sus clientes de un Excel del sistema anterior y carga uno a mano", async () => {
    await page.goto("/importar-exportar");
    await page.getByTestId("tarjeta-clientes").getByRole("button", { name: /^Importar/ }).click();
    await page.getByLabel("Archivo a importar").setInputFiles({
      name: "clientes.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: excel([
        ["Nombre", "CUIT", "IVA", "Mail", "Domicilio", "Ciudad"],
        ["Constructora Del Plata S.A.", formatear(cuitValido("30")), "RI", "compras@delplata.com.ar", "Calle 7 N° 1234", "La Plata"],
        ["Estudio Contable Ríos", formatear(cuitValido("20")), "Monotributo", "info@estudiorios.com.ar", "", "CABA"],
        ["Colegio San Martín", formatear(cuitValido("30")), "Exento", "", "", "Quilmes"],
      ]),
    });
    const d = page.getByRole("dialog");
    await expect(d.getByTestId("vista-previa").getByText("Nuevos").locator("..")).toContainText("3");
    await d.getByRole("button", { name: "Importar 3 registros" }).click();
    await expect(d.getByRole("status")).toContainText("3 nuevos");
    await d.getByRole("button", { name: "Listo" }).click();

    await page.goto("/clientes");
    await page.getByRole("button", { name: "Nuevo cliente" }).click();
    const c = page.getByRole("dialog");
    await c.getByLabel("Razón social / Nombre").fill("Laura Giménez");
    await c.getByLabel("CUIT / CUIL").fill(formatear(cuitValido("27")));
    await elegir(page, "Condición frente al IVA", "Consumidor Final");
    await c.getByRole("button", { name: "Guardar cliente" }).click();
    await page.goto("/clientes");
    await expect(page.getByRole("row")).toHaveCount(5); // encabezado + 4
  });

  await conTiempo("5. Importa el catálogo con stock (CSV con formato argentino) y carga un servicio", async () => {
    await page.goto("/importar-exportar");
    await page.getByTestId("tarjeta-productos").getByRole("button", { name: /^Importar/ }).click();
    const csv = "﻿Código;Descripción;Precio sin IVA;IVA %;Stock;Stock mínimo\nNB-14;Notebook 14 Ryzen 5;850.000;10,5;10;2\nMON-24;Monitor 24 pulgadas;180.000;21;6;3\nTON-85;Tóner 85A;32.000;21;20;5\nMOU-01;Mouse inalámbrico;12.500;21;50;10\n";
    await page.getByLabel("Archivo a importar").setInputFiles({ name: "productos.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
    const d = page.getByRole("dialog");
    await d.getByRole("button", { name: "Importar 4 registros" }).click();
    await expect(d.getByRole("status")).toContainText("4 nuevos");
    await d.getByRole("button", { name: "Listo" }).click();

    await page.goto("/productos");
    await page.getByRole("button", { name: "Nuevo producto" }).click();
    const p = page.getByRole("dialog");
    await p.getByLabel("Código").fill("SOP-H");
    await p.getByLabel("Descripción").fill("Hora de soporte técnico");
    await p.getByLabel("Precio sin IVA").fill("40.000");
    await p.getByLabel("Controlar stock").click();
    await p.getByRole("button", { name: "Guardar producto" }).click();
    await expect(page.getByTestId("stock-actual")).toHaveText("No controla stock");
    await expect(await stockDe(page, "Notebook 14 Ryzen 5")).toHaveText("10 u.");
  });

  // Las otras dos personas entran en sus propias ventanas
  const diego = await nuevaVentana(browser, vendedor);
  const oscar = await nuevaVentana(browser, deposito);

  await conTiempo("6. El vendedor no ve la configuración; arma una oportunidad y le hace el presupuesto", async () => {
    await expect(diego.getByRole("link", { name: "Configuración", exact: true })).toHaveCount(0);
    await diego.goto("/oportunidades");
    await diego.getByRole("button", { name: "Nueva oportunidad" }).click();
    await diego.getByLabel("Título").fill("Equipamiento oficina central");
    await elegir(diego, "Cliente", "Constructora Del Plata S.A.");
    await diego.getByRole("button", { name: "Guardar" }).click();
    await diego.getByTestId("tarjeta-oportunidad").filter({ hasText: "Equipamiento oficina" }).getByRole("button", { name: /Abrir/ }).click();
    await diego.getByTestId("oportunidad-presupuesto").getByRole("link", { name: "Hacer presupuesto" }).click();

    await agregarProducto(diego, /Notebook 14 Ryzen 5/);
    await agregarProducto(diego, /Monitor 24 pulgadas/);
    await diego.getByLabel("Cantidad de Notebook 14 Ryzen 5").fill("3");
    await diego.getByLabel("Cantidad de Monitor 24 pulgadas").fill("2");
    // 3 × 850.000 × 1,105 + 2 × 180.000 × 1,21
    await expect(diego.getByTestId("total-presupuesto")).toHaveText("$ 3.253.350,00");
    await diego.getByLabel("Condiciones").fill("50 % anticipado, saldo a 30 días");
    await diego.getByRole("button", { name: "Guardar presupuesto" }).click();
    await expect(diego.getByRole("heading", { name: /Presupuesto 00000001/ })).toBeVisible();

    await diego.goto("/oportunidades");
    await expect(diego.locator('[data-testid="columna-etapa"][data-etapa="Propuesta"]')).toContainText("Equipamiento oficina central");
  });

  let urlFacturaA1 = "";
  await conTiempo("7. El cliente acepta: se factura el presupuesto a cuenta corriente y la oportunidad queda ganada", async () => {
    await diego.goto("/presupuestos");
    await diego.getByRole("cell", { name: "00000001" }).click();
    await diego.getByRole("button", { name: "Aceptado" }).click();
    await expect(diego.getByRole("heading", { name: /Presupuesto 00000001/ })).toContainText("Aceptado");
    await diego.getByRole("link", { name: "Facturar", exact: true }).click();
    await expect(diego.getByTestId("tipo-comprobante")).toHaveText(/Factura A/);
    await elegir(diego, "Condición de venta", "Cuenta corriente (30 días)");
    await expect(diego.getByTestId("total-factura")).toHaveText("$ 3.253.350,00");
    await diego.getByRole("button", { name: "Emitir y obtener CAE" }).click();
    await expect(diego.getByRole("heading", { name: /Factura A 0001-00000001/ })).toBeVisible();
    await expect(diego.getByTestId("estado-cobro")).toContainText("Impaga");
    urlFacturaA1 = new URL(diego.url()).pathname;

    await diego.goto("/oportunidades");
    await expect(diego.locator('[data-testid="columna-etapa"][data-etapa="Ganada"]')).toContainText("Equipamiento oficina central");
  });

  await conTiempo("8. Venta de mostrador de contado a consumidor final, cobrada en efectivo", async () => {
    await page.goto("/facturacion/nueva");
    await elegir(page, "Cliente", "Laura Giménez");
    await expect(page.getByTestId("tipo-comprobante")).toHaveText(/Factura B/);
    await agregarProducto(page, /Tóner 85A/);
    await agregarProducto(page, /Mouse inalámbrico/);
    await page.getByLabel("Cantidad de Tóner 85A").fill("2");
    await expect(page.getByTestId("total-factura")).toHaveText("$ 92.565,00");
    await expect(page.getByRole("checkbox", { name: "Cobrada en el momento" })).toBeChecked();
    await elegir(page, "Medio de cobro", "Efectivo");
    await page.getByRole("button", { name: "Emitir y obtener CAE" }).click();
    await expect(page.getByRole("heading", { name: /Factura B 0001-00000001/ })).toBeVisible();
    await expect(page.getByTestId("estado-cobro")).toContainText("Pagada");
  });

  await conTiempo("9. Depósito entrega 5 mouse al colegio con remito", async () => {
    await oscar.goto("/remitos/nuevo");
    await elegir(oscar, "Cliente", "Colegio San Martín");
    await agregarProducto(oscar, /Mouse inalámbrico/);
    await oscar.getByLabel("Cantidad de Mouse inalámbrico").fill("5");
    await oscar.getByRole("button", { name: "Emitir remito" }).click();
    await expect(oscar.getByRole("heading", { name: /Remito 0001-00000001/ })).toBeVisible();
  });

  await conTiempo("10. Se le facturan al colegio 3 horas de soporte a cuenta corriente", async () => {
    await page.goto("/facturacion/nueva");
    await elegir(page, "Cliente", "Colegio San Martín");
    await elegir(page, "Condición de venta", "Cuenta corriente (30 días)");
    await agregarProducto(page, /Hora de soporte técnico/);
    await page.getByLabel("Cantidad de Hora de soporte técnico").fill("3");
    await expect(page.getByTestId("total-factura")).toHaveText("$ 145.200,00");
    await page.getByRole("button", { name: "Emitir y obtener CAE" }).click();
    await expect(page.getByRole("heading", { name: /Factura B 0001-00000002/ })).toBeVisible();
  });

  await conTiempo("11. La constructora paga una parte por transferencia", async () => {
    await page.goto(urlFacturaA1);
    await expect(page.getByRole("heading", { name: /Factura A 0001-00000001/ })).toBeVisible();
    await page.getByRole("link", { name: "Registrar cobro" }).click();
    await page.getByLabel(/Importe a aplicar a Factura A 0001-00000001/).fill("1.500.000");
    await elegir(page, "Medio de pago 1", "Transferencia");
    await page.getByRole("button", { name: "Registrar recibo" }).click();
    await expect(page.getByTestId("recibo-total")).toHaveText("$ 1.500.000,00");
    await page.goto(urlFacturaA1);
    await expect(page.getByTestId("estado-cobro")).toContainText("Saldo $ 1.753.350,00");
  });

  await conTiempo("12. Devuelve un monitor: nota de crédito, vuelve al stock y baja la deuda", async () => {
    await page.goto(urlFacturaA1);
    await page.getByRole("link", { name: "Nota de crédito" }).click();
    await page.getByRole("button", { name: "Quitar Notebook 14 Ryzen 5" }).click();
    await page.getByLabel("Cantidad de Monitor 24 pulgadas").fill("1");
    await expect(page.getByTestId("total-factura")).toHaveText("$ 217.800,00");
    await page.getByRole("button", { name: "Emitir y obtener CAE" }).click();
    await expect(page.getByRole("heading", { name: /Nota de crédito A 0001-00000001/ })).toBeVisible();
    await page.goto(urlFacturaA1);
    await expect(page.getByTestId("estado-cobro")).toContainText("Saldo $ 1.535.550,00");
  });

  await conTiempo("13. El vendedor le vende 14 tóner al estudio: el tóner queda bajo el mínimo", async () => {
    await diego.goto("/facturacion/nueva");
    await elegir(diego, "Cliente", "Estudio Contable Ríos");
    await expect(diego.getByTestId("tipo-comprobante")).toHaveText(/Factura A/); // monotributista: A
    await elegir(diego, "Condición de venta", "Cuenta corriente (30 días)");
    await agregarProducto(diego, /Tóner 85A/);
    await diego.getByLabel("Cantidad de Tóner 85A").fill("14");
    await expect(diego.getByTestId("total-factura")).toHaveText("$ 542.080,00");
    await diego.getByRole("button", { name: "Emitir y obtener CAE" }).click();
    await expect(diego.getByRole("heading", { name: /Factura A 0001-00000002/ })).toBeVisible();
  });

  await conTiempo("14. Depósito recibe el aviso de stock bajo y repone", async () => {
    await oscar.goto("/");
    await expect(oscar.getByTestId("notificaciones-contador")).toBeVisible();
    await oscar.getByRole("button", { name: /Notificaciones/ }).click();
    await oscar.getByTestId("notificacion").filter({ hasText: "Tóner 85A" }).first().click();
    await expect(oscar.getByTestId("stock-actual")).toHaveText("4 u.");
    await oscar.getByRole("button", { name: "Movimiento de stock" }).click();
    const d = oscar.getByRole("dialog");
    await d.getByRole("radio", { name: "Ingreso" }).click();
    await d.getByLabel("Cantidad").fill("30");
    await d.getByLabel("Motivo").fill("Compra a Distribuidora Mayorista");
    await d.getByRole("button", { name: "Registrar" }).click();
    await expect(oscar.getByTestId("stock-actual")).toHaveText("34 u.");
  });

  await conTiempo("15. El vendedor agenda la instalación y le llega el aviso al de depósito", async () => {
    await diego.goto("/agenda");
    await diego.getByRole("button", { name: "Agendar visita" }).click();
    await diego.getByLabel("Título").fill("Instalación de equipos");
    await elegir(diego, "Responsable", "Oscar Depósito");
    await elegir(diego, "Cliente", "Constructora Del Plata S.A.");
    await diego.getByLabel("Desde").fill("16:00");
    await diego.getByRole("button", { name: "Guardar" }).click();
    await expect(diego.getByText("Quedó agendado")).toBeVisible();
    await oscar.goto("/");
    await expect(oscar.getByTestId("agenda-hoy")).toContainText("Instalación de equipos");
    await oscar.getByRole("button", { name: /Notificaciones/ }).click();
    await expect(oscar.getByTestId("notificacion").filter({ hasText: "Te agendaron algo nuevo" })).toBeVisible();
    await oscar.keyboard.press("Escape");
  });

  await conTiempo("16. Se le manda la factura al cliente: la ve por el link sin usuario", async () => {
    await page.goto(urlFacturaA1);
    await page.getByRole("button", { name: "Enviar", exact: true }).click();
    await expect(page.getByRole("dialog").getByLabel("Para", { exact: true })).toHaveValue("compras@delplata.com.ar");
    const link = await page.getByTestId("link-publico").inputValue();
    await page.keyboard.press("Escape");
    const cliente = await browser.newPage();
    await cliente.goto(link);
    await expect(cliente.getByTestId("publico-titulo")).toHaveText("Factura A 0001-00000001");
    await expect(cliente.getByTestId("comprobante-total")).toHaveText("$ 3.253.350,00");
    await cliente.close();
  });

  await conTiempo("17. Stock final: coincide con todo lo vendido, entregado, devuelto y repuesto", async () => {
    await expect(await stockDe(page, "Notebook 14 Ryzen 5")).toHaveText("7 u."); // 10 − 3
    await expect(await stockDe(page, "Monitor 24 pulgadas")).toHaveText("5 u."); // 6 − 2 + 1
    await expect(await stockDe(page, "Tóner 85A")).toHaveText("34 u."); // 20 − 2 − 14 + 30
    await expect(await stockDe(page, "Mouse inalámbrico")).toHaveText("44 u."); // 50 − 1 − 5
  });

  await conTiempo("18. Cuentas corrientes y cobranzas: lo que debe cada cliente", async () => {
    await page.goto("/clientes");
    await page.getByRole("cell", { name: /Constructora Del Plata/ }).click();
    // 3.253.350 − 1.500.000 − 217.800
    await expect(page.getByTestId("cuenta-corriente")).toContainText("$ 1.535.550,00");
    await expect(page.getByTestId("presupuestos-cliente")).toContainText("Facturado");
    await expect(page.getByTestId("oportunidades-cliente")).toContainText("Ganada");
    await expect(page.getByTestId("agenda-cliente")).toContainText("Instalación de equipos");

    await page.goto("/cobranzas");
    await expect(page.getByRole("row", { name: /Constructora Del Plata/ })).toContainText("$ 1.535.550,00");
    await expect(page.getByRole("row", { name: /Estudio Contable Ríos/ })).toContainText("$ 542.080,00");
    await expect(page.getByRole("row", { name: /Colegio San Martín/ })).toContainText("$ 145.200,00");
    await expect(page.getByRole("row", { name: /Laura Giménez/ })).toHaveCount(0); // pagó de contado
  });

  await conTiempo("19. Reportes, Libro IVA, Excel e Inicio dicen lo mismo", async () => {
    // Ventas: 3.253.350 + 92.565 + 145.200 + 542.080 − 217.800 = 3.815.395
    // Neto:   2.910.000 + 76.500 + 120.000 + 448.000 − 180.000 = 3.374.500
    await page.goto("/reportes");
    await expect(page.getByTestId("kpi-ventas")).toContainText("$ 3,8 M");
    await expect(page.getByTestId("kpi-ventas")).toContainText("$ 3.374.500,00 sin IVA");
    await expect(page.getByRole("row", { name: /Constructora Del Plata/ })).toContainText("$ 3.035.550,00"); // 3.253.350 − 217.800

    await page.getByRole("tab", { name: "Libro IVA Ventas" }).click();
    await expect(page.getByTestId("renglon-libro")).toHaveCount(5);
    const totales = page.getByTestId("libro-totales");
    await expect(totales).toContainText("$ 3.374.500,00"); // neto
    await expect(totales).toContainText("$ 173.145,00"); // IVA 21 %
    await expect(totales).toContainText("$ 267.750,00"); // IVA 10,5 %
    await expect(totales).toContainText("$ 3.815.395,00"); // total

    const [descarga] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Exportar a Excel" }).click()]);
    const libro = XLSX.read(readFileSync((await descarga.path())!));
    const iva = XLSX.utils.sheet_to_json<(string | number)[]>(libro.Sheets["Libro IVA Ventas"]!, { header: 1 });
    expect(iva.at(-1)).toEqual(["Totales", "", "", "", "", "", 3374500, 0, 173145, 267750, 3815395]);
    const resumen = XLSX.utils.sheet_to_json<(string | number)[]>(libro.Sheets["Resumen"]!, { header: 1 });
    expect(resumen.find((f) => f[0] === "Ventas (total)")?.[1]).toBe(3815395);

    await page.goto("/");
    await expect(page.getByTestId("kpis-inicio")).toContainText("$ 3,8 M"); // ventas del mes
    await expect(page.getByTestId("kpis-inicio")).toContainText("$ 2,2 M"); // por cobrar: 1.535.550 + 542.080 + 145.200
    await expect(page.getByTestId("agenda-hoy")).toContainText("Instalación de equipos");
  });

  await conTiempo("20. Paga la suscripción y deja de ver el aviso de prueba", async () => {
    await page.goto("/configuracion?tab=plan");
    await expect(page.getByTestId("uso-usuarios")).toContainText("3 de 5");
    await page.getByRole("button", { name: "Pagar 1 mes" }).click();
    await expect(page.getByTestId("importe-pago")).toHaveText("$ 75.000,00");
    await page.getByRole("button", { name: "Aprobar pago de prueba" }).click();
    await expect(page.getByText("Pago de prueba aprobado")).toBeVisible();
    await expect(page.getByTestId("aviso-suscripcion")).toHaveCount(0);
  });

  await conTiempo("21. El dueño de Prexacode ve a la empresa en su panel", async () => {
    const duenio = await browser.newPage();
    await entrarAlPanel(duenio);
    await duenio.goto("/admin/empresas");
    // Por CUIT (único): otras pruebas que corren en paralelo pueden tener empresas con nombres parecidos
    await duenio.getByPlaceholder("Buscar por nombre, CUIT o email…").fill(admin.cuit.replace(/\D/g, ""));
    const fila = duenio.getByRole("row", { name: /Distribuidora Andina S\.R\.L\./ });
    await expect(fila).toContainText("Activa");
    await expect(fila).toContainText("3 / 5"); // usuarios activos del plan Profesional
    await fila.click();
    await expect(duenio.getByTestId("pago-empresa").first()).toContainText("Aprobado");
    await expect(duenio.getByTestId("actividad-empresa")).toContainText("5 comprobantes");
    await duenio.close();
  });

  await diego.close();
  await oscar.close();
});
