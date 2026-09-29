/**
 * PUNTA A PUNTA CON TODO LO NUEVO: una librería mayorista con su equipo, por la pantalla.
 *
 * Personas (cada una en su ventana): la dueña (administradora), un vendedor, una cajera (rol a medida:
 * solo cobra), el de depósito, y la contadora (rol a medida: solo mira sueldos). Del otro lado, el panel
 * de Prexacode.
 *
 * Números que se cruzan al final (todo en pesos):
 *   Precios: Resma 8.950,50 → +10 % Librería, de a $10 → 9.850 · Birome 12.300 → 13.530 · Tóner 32.000 (no cambia)
 *   Factura A (cta. cte.) a Imprenta Del Sur: 10 resmas + 2 tóner = neto 162.500 + IVA 34.125 = 196.625
 *   Cobro de la cajera: 100.000 → por cobrar 96.625
 *   Stock: Resma 100 → inventario 95 → −10 = 85 · Tóner 20 → inventario 18 → −2 = 16 · Cartucho 30 → remito −3 = 27
 *   Sueldos: Sofía 800.000 + 30.000 extra − 100.000 adelanto = 730.000; Martín 650.000 → pagado en el mes 1.480.000
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import * as XLSX from "xlsx";
import { cuitValido, elegir, emailUnico, entrarAlPanel, formatear, loginUI, PASSWORD } from "./helpers";

const excel = (filas: (string | number)[][]) => {
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), "Clientes");
  return XLSX.write(libro, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

/** Pedidos que una pantalla hizo sin tener permiso: no debería haber ninguno */
const prohibidos: string[] = [];
function vigilar(p: Page, quien: string) {
  p.on("response", (r) => {
    if (r.status() === 403 && r.url().includes("/api/")) prohibidos.push(`${quien}: ${r.request().method()} ${new URL(r.url()).pathname}`);
  });
  return p;
}

async function ventana(browser: Browser, email: string) {
  const p = vigilar(await browser.newPage(), email.split(".")[0]!);
  await loginUI(p, email);
  await expect(p.getByRole("heading", { name: /^Hola, / })).toBeVisible();
  return p;
}

async function agregarProducto(page: Page, nombre: RegExp) {
  await page.getByRole("combobox", { name: "Agregar producto" }).click();
  await page.getByRole("option", { name: nombre }).click();
}

async function importar(page: Page, entidad: "clientes" | "productos", nombre: string, buffer: Buffer, mimeType = "text/csv") {
  await page.goto("/importar-exportar");
  await page.getByTestId(`tarjeta-${entidad}`).getByRole("button", { name: /^Importar/ }).click();
  await page.getByLabel("Archivo a importar").setInputFiles({ name: nombre, mimeType, buffer });
  return page.getByRole("dialog");
}

test("una librería con su equipo, roles a medida, carga masiva, sueldos y soporte: todo cierra", async ({ page, browser }) => {
  test.setTimeout(300_000);
  const t0 = Date.now();
  const paso = (async (nombre: string, fn: () => Promise<unknown>) => {
    const t = Date.now();
    await test.step(nombre, fn as () => Promise<void>);
    console.log(`[${((Date.now() - t0) / 1000).toFixed(1)} s] ${nombre} (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  }) as (nombre: string, fn: () => Promise<unknown>) => Promise<void>;

  const cuit = formatear(cuitValido("30"));
  const duenia = emailUnico("duenia");
  const vendedor = emailUnico("vendedor");
  const cajera = emailUnico("cajera");
  const deposito = emailUnico("deposito");
  const contadora = emailUnico("contadora");
  vigilar(page, "dueña");

  await paso("1. La dueña registra la librería", async () => {
    await page.goto("/registro");
    await page.getByLabel("Razón social").fill("Librería Central S.R.L.");
    await page.getByLabel("CUIT").fill(cuit);
    await elegir(page, "Condición frente al IVA", "Responsable Inscripto");
    await page.getByLabel("Nombre y apellido").fill("Silvia Central");
    await page.getByLabel("Email").fill(duenia);
    await page.getByLabel("Contraseña").fill(PASSWORD);
    await page.getByLabel(/Leí y acepto/).check();
    await page.getByRole("button", { name: "Crear cuenta" }).click();
    await expect(page.getByRole("heading", { name: "Hola, Silvia" })).toBeVisible();
  });

  await paso("2. Arma dos roles a medida: Cajero (solo cobra) y Contadora (solo mira sueldos)", async () => {
    for (const [nombre, permisos] of [
      ["Cajero", ["Registrar cobros"]],
      ["Contadora", ["Ver empleados y sueldos"]],
    ] as const) {
      await page.goto("/configuracion?tab=roles");
      await page.getByRole("button", { name: "Nuevo rol" }).click();
      const d = page.getByRole("dialog");
      await d.getByLabel("Nombre", { exact: true }).fill(nombre);
      for (const p of permisos) await d.getByRole("checkbox", { name: p }).click();
      await d.getByRole("button", { name: "Crear rol" }).click();
      await expect(page.getByTestId(`rol-${nombre}`)).toBeVisible();
    }
    await expect(page.getByTestId("rol-Cajero")).toContainText("Ver deudas y cobros"); // se agregó solo
  });

  await paso("3. Suma a su equipo (5 usuarios: el máximo del plan Profesional)", async () => {
    for (const [nombre, email, rol] of [
      ["Diego Vendedor", vendedor, "Ventas"],
      ["Carla Cajera", cajera, "Cajero"],
      ["Oscar Depósito", deposito, "Operaciones"],
      ["Paula Contadora", contadora, "Contadora"],
    ] as const) {
      await page.goto("/configuracion?tab=usuarios");
      await page.getByRole("button", { name: "Nuevo usuario" }).click();
      const d = page.getByRole("dialog");
      await d.getByLabel("Nombre y apellido").fill(nombre);
      await d.getByLabel("Email").fill(email);
      await elegir(page, "Rol", rol);
      await d.getByLabel("Contraseña inicial").fill(PASSWORD);
      await d.getByRole("button", { name: "Crear usuario" }).click();
      await expect(page.getByTestId(`usuario-${email}`)).toContainText(rol);
    }
    // El sexto no entra: le ofrece sumar un usuario
    await page.getByRole("button", { name: "Nuevo usuario" }).click();
    await expect(page.getByTestId("aviso-limite-usuarios")).toContainText("Ya usás los 5 usuarios de tu plan");
    await expect(page.getByTestId("aviso-limite-usuarios").getByRole("button", { name: /Sumar 1 usuario/ })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  await paso("4. Importa clientes (Excel de otro sistema) y el catálogo (CSV de Excel en español, con acentos)", async () => {
    let d = await importar(
      page,
      "clientes",
      "clientes.xlsx",
      excel([
        ["Nombre", "CUIT", "IVA", "Mail", "Ciudad"],
        ["Imprenta Del Sur S.A.", formatear(cuitValido("30")), "RI", "compras@imprentadelsur.com.ar", "Lanús"],
        ["Colegio Nuestra Señora", formatear(cuitValido("30")), "Exento", "", "Quilmes"],
        ["Kiosco Ñandú", formatear(cuitValido("20")), "Monotributo", "", "Lomas"],
      ]),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    await d.getByRole("button", { name: "Importar 3 registros" }).click();
    await expect(d.getByRole("status")).toContainText("3 nuevos");
    await d.getByRole("button", { name: "Listo" }).click();

    // Guardado por Excel en Windows: Windows-1252 y punto y coma
    const csv = "Código;Descripción;Categoría;Precio sin IVA;IVA %;Stock;Stock mínimo\r\nLIB-A4;Resma A4 75 g;Librería;8.950,50;21;100;20\r\nLIB-BIR;Birome azul x 50;Librería;12.300;21;40;5\r\nINS-TON;Tóner 85A compatible;Insumos;32.000;21;20;5\r\nINS-CAR;Cartucho 664 negro;Insumos;18.500;21;30;5\r\n";
    d = await importar(page, "productos", "catalogo.csv", Buffer.from(csv, "latin1"));
    await d.getByRole("button", { name: "Importar 4 registros" }).click();
    await expect(d.getByRole("status")).toContainText("4 nuevos");
    await d.getByRole("button", { name: "Listo" }).click();
    await page.goto("/productos");
    await expect(page.getByRole("row", { name: /Tóner 85A compatible/ })).toContainText("Insumos");
  });

  await paso("5. Recuento de inventario con una planilla de dos columnas (Código y Stock)", async () => {
    const d = await importar(page, "productos", "conteo.csv", Buffer.from("Código;Stock\nLIB-A4;95\nINS-TON;18\n", "utf8"));
    await expect(d.getByTestId("planilla-parcial")).toBeVisible();
    await d.getByRole("button", { name: "Importar 2 registros" }).click();
    await expect(d.getByRole("status")).toContainText("2 actualizados");
    await d.getByRole("button", { name: "Listo" }).click();
  });

  await paso("6. Aumento de 10 % a la categoría Librería, redondeado de a $ 10", async () => {
    await page.goto("/productos");
    await page.getByRole("button", { name: "Actualizar precios" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Porcentaje").fill("10");
    await d.getByLabel("Redondear a").click();
    await page.getByRole("option", { name: "De a $ 10", exact: true }).click();
    await d.getByLabel("Productos").click();
    await page.getByRole("option", { name: "Categoría: Librería" }).click();
    await d.getByRole("button", { name: "Ver cómo quedan" }).click();
    await expect(d.getByTestId("vista-precios")).toContainText("Cambian 2 de 2");
    await d.getByRole("button", { name: "Aplicar a 2 productos" }).click();
    await expect(page.getByRole("row", { name: /Resma A4/ })).toContainText("$ 9.850,00");
    await expect(page.getByRole("row", { name: /Birome/ })).toContainText("$ 13.530,00");
    await expect(page.getByRole("row", { name: /Tóner/ })).toContainText("$ 32.000,00");
  });

  await paso("7. Edición masiva: dos clientes pasan a la zona sur", async () => {
    await page.goto("/clientes");
    await page.getByRole("row", { name: /Imprenta Del Sur/ }).getByRole("checkbox", { name: "Elegir" }).click();
    await page.getByRole("row", { name: /Kiosco Ñandú/ }).getByRole("checkbox", { name: "Elegir" }).click();
    await page.getByTestId("barra-seleccion").getByRole("button", { name: "Editar datos" }).click();
    await page.getByRole("dialog").getByLabel("Rubro").fill("Zona sur");
    await page.getByRole("dialog").getByRole("button", { name: "Aplicar a 2" }).click();
    await expect(page.getByText("2 clientes actualizados")).toBeVisible();
  });

  const diego = await ventana(browser, vendedor);
  const carla = await ventana(browser, cajera);
  const oscar = await ventana(browser, deposito);

  await paso("8. El vendedor factura a cuenta corriente con los precios nuevos", async () => {
    await diego.goto("/facturacion/nueva");
    await elegir(diego, "Cliente", "Imprenta Del Sur S.A.");
    await expect(diego.getByTestId("tipo-comprobante")).toHaveText(/Factura A/);
    await elegir(diego, "Condición de venta", "Cuenta corriente (30 días)");
    await agregarProducto(diego, /Resma A4 75 g/);
    await agregarProducto(diego, /Tóner 85A compatible/);
    await diego.getByLabel("Cantidad de Resma A4 75 g").fill("10");
    await diego.getByLabel("Cantidad de Tóner 85A compatible").fill("2");
    await expect(diego.getByTestId("total-factura")).toHaveText("$ 196.625,00");
    await diego.getByRole("button", { name: "Emitir y obtener CAE" }).click();
    await expect(diego.getByRole("heading", { name: /Factura A 0001-00000001/ })).toBeVisible();
  });

  await paso("9. La cajera solo ve Cobranzas: registra un pago parcial", async () => {
    const menu = carla.getByRole("navigation").first();
    await expect(menu.getByRole("link", { name: "Cobranzas" })).toBeVisible();
    for (const oculto of ["Facturación", "Clientes", "Productos y stock", "Empleados y sueldos", "Configuración"]) {
      await expect(menu.getByRole("link", { name: oculto, exact: true })).toHaveCount(0);
    }
    await carla.goto("/cobranzas");
    await expect(carla.getByRole("row", { name: /Imprenta Del Sur/ })).toContainText("$ 196.625,00");
    await carla.goto("/cobranzas/nuevo");
    await elegir(carla, "Cliente", "Imprenta Del Sur S.A.");
    await carla.getByRole("checkbox", { name: "Aplicar a Factura A 0001-00000001" }).click();
    await carla.getByLabel(/Importe a aplicar a Factura A 0001-00000001/).fill("100.000");
    await elegir(carla, "Medio de pago 1", "Transferencia");
    await carla.getByRole("button", { name: "Registrar recibo" }).click();
    await expect(carla.getByTestId("recibo-total")).toHaveText("$ 100.000,00");
    // No puede anular (no tiene ese permiso)
    await expect(carla.getByRole("button", { name: "Anular" })).toHaveCount(0);
    await carla.goto("/facturacion");
    await expect(carla.getByText("Sin acceso a este módulo")).toBeVisible();
  });

  await paso("10. Depósito entrega 3 cartuchos al colegio con remito", async () => {
    await oscar.goto("/remitos/nuevo");
    await elegir(oscar, "Cliente", "Colegio Nuestra Señora");
    await agregarProducto(oscar, /Cartucho 664 negro/);
    await oscar.getByLabel("Cantidad de Cartucho 664 negro").fill("3");
    await oscar.getByRole("button", { name: "Emitir remito" }).click();
    await expect(oscar.getByRole("heading", { name: /Remito 0001-00000001/ })).toBeVisible();
    await expect(oscar.getByRole("link", { name: "Empleados y sueldos" })).toHaveCount(0);
  });

  await paso("11. Sueldos: dos empleados, un adelanto y los dos sueldos del mes", async () => {
    for (const [nombre, apellido, sueldo] of [
      ["Sofía", "Paz", "800.000"],
      ["Martín", "Díaz", "650.000"],
    ] as const) {
      await page.goto("/empleados");
      await page.getByRole("button", { name: "Nuevo empleado" }).click();
      const d = page.getByRole("dialog");
      await d.getByLabel("Nombre", { exact: true }).fill(nombre);
      await d.getByLabel("Apellido").fill(apellido);
      await d.getByLabel("Fecha de ingreso").fill("2023-03-01");
      await d.getByLabel("Sueldo básico").fill(sueldo);
      await d.getByRole("button", { name: "Cargar empleado" }).click();
      await expect(page.getByRole("heading", { name: new RegExp(`${nombre} ${apellido}`) })).toBeVisible();
    }
    // Martín: sueldo liso
    await page.getByRole("button", { name: "Pagar sueldo" }).click();
    await page.getByRole("dialog").getByRole("button", { name: /Registrar \$ 650\.000,00/ }).click();
    await expect(page.getByTestId("pago-total")).toHaveText("$ 650.000,00");

    // Sofía: adelanto y después sueldo con horas extra
    await page.goto("/empleados");
    await page.getByRole("cell", { name: /Paz, Sofía/ }).click();
    await page.getByRole("button", { name: "Adelanto" }).click();
    await page.getByRole("dialog").getByLabel("Importe 1").fill("100.000");
    await page.getByRole("dialog").getByRole("button", { name: /Registrar \$ 100\.000,00/ }).click();
    await page.getByRole("link", { name: "Sofía Paz" }).click();
    await page.getByRole("button", { name: "Pagar sueldo" }).click();
    const s = page.getByRole("dialog");
    await s.getByRole("button", { name: "Agregar concepto" }).click();
    await s.getByLabel("Concepto 2").fill("Horas extra");
    await s.getByLabel("Importe 2").fill("30.000");
    await expect(s.getByTestId("total-pago")).toHaveText("$ 730.000,00");
    await s.getByRole("button", { name: /Registrar \$ 730\.000,00/ }).click();
    await expect(page.getByTestId("pago-total")).toHaveText("$ 730.000,00");

    await page.goto("/empleados");
    await expect(page.getByRole("row", { name: /Paz, Sofía/ })).toContainText("Pagado");
    await expect(page.getByRole("row", { name: /Díaz, Martín/ })).toContainText("Pagado");
    await expect(page.getByTestId("kpis-empleados")).toContainText("Sueldos por pagar0");
  });

  await paso("12. La contadora ve los sueldos y los comprobantes, pero no puede pagar ni anular", async () => {
    const paula = await ventana(browser, contadora);
    await paula.getByRole("link", { name: "Empleados y sueldos" }).first().click();
    await expect(paula.getByRole("button", { name: "Nuevo empleado" })).toHaveCount(0);
    await paula.getByRole("cell", { name: /Paz, Sofía/ }).click();
    await expect(paula.getByRole("button", { name: "Pagar sueldo" })).toHaveCount(0);
    await paula.getByTestId("pagos-empleado").getByRole("link", { name: /Sueldo/ }).click();
    await expect(paula.locator(".hoja")).toContainText("Adelantos del mes");
    await expect(paula.getByRole("button", { name: "Anular" })).toHaveCount(0);
    await paula.close();
  });

  await paso("13. La cajera pide ayuda; Prexacode le responde desde el panel", async () => {
    await carla.goto("/soporte");
    await carla.getByRole("button", { name: "Nuevo pedido" }).click();
    await carla.getByLabel("Asunto").fill("No encuentro cómo anular un recibo");
    await carla.getByLabel("Contanos qué pasa").fill("Me equivoqué de importe en un recibo y no me aparece el botón de anular.");
    await carla.getByRole("button", { name: "Enviar pedido" }).click();
    await expect(carla.getByText(/Pedido #\d+ enviado/)).toBeVisible();

    const panel = await browser.newPage();
    await entrarAlPanel(panel);
    await panel.goto("/admin/soporte");
    await panel.getByPlaceholder("Buscar por número, asunto o empresa…").fill("anular un recibo");
    await panel.getByRole("row", { name: /No encuentro cómo anular/ }).click();
    await panel.getByLabel("Tu mensaje").fill("Hola Carla: anular recibos lo puede hacer un administrador. Pedíselo a Silvia.");
    await panel.getByRole("button", { name: "Responder y cerrar" }).click();
    await expect(panel.getByText("Respondido y cerrado")).toBeVisible();

    await carla.goto("/soporte");
    await expect(carla.getByTestId("ticket").filter({ hasText: "anular un recibo" })).toContainText("Nueva respuesta");

    // La ficha de la empresa en el panel: 5 usuarios, facturó en el mes
    await panel.goto("/admin/empresas");
    await panel.getByPlaceholder("Buscar por nombre, CUIT o email…").fill(cuit.replace(/\D/g, ""));
    await expect(panel.getByRole("row", { name: /Librería Central/ })).toContainText("5 / 5");
    await expect(panel.getByRole("row", { name: /Librería Central/ })).toContainText("$ 196.625,00");
    await panel.close();
  });

  await paso("14. El vendedor presta su usuario: la sesión anterior se cierra y el panel lo marca", async () => {
    const otraCompu = await ventana(browser, vendedor);
    await diego.goto("/clientes");
    await expect(diego.getByTestId("aviso-sesion")).toContainText("Se abrió tu usuario en otro dispositivo");
    const panel = await browser.newPage();
    await entrarAlPanel(panel);
    await panel.goto("/admin/empresas");
    await panel.getByPlaceholder("Buscar por nombre, CUIT o email…").fill(cuit.replace(/\D/g, ""));
    await expect(panel.getByRole("row", { name: /Librería Central/ })).toContainText("¿compartido?");
    await panel.close();
    await otraCompu.close();
  });

  await paso("15. Todo cierra: stock, cuentas, reportes, Inicio y sueldos", async () => {
    await page.goto("/productos");
    await expect(page.getByRole("row", { name: /Resma A4/ })).toContainText("85 u."); // 100 → 95 → −10
    await expect(page.getByRole("row", { name: /Tóner 85A/ })).toContainText("16 u."); // 20 → 18 → −2
    await expect(page.getByRole("row", { name: /Cartucho 664/ })).toContainText("27 u."); // 30 − 3
    await expect(page.getByRole("row", { name: /Birome/ })).toContainText("40 u.");

    await page.goto("/cobranzas");
    await expect(page.getByRole("row", { name: /Imprenta Del Sur/ })).toContainText("$ 96.625,00");

    await page.goto("/reportes");
    await expect(page.getByTestId("kpi-ventas")).toContainText("$ 162.500,00 sin IVA");
    await page.getByRole("tab", { name: "Libro IVA Ventas" }).click();
    await expect(page.getByTestId("libro-totales")).toContainText("$ 196.625,00");
    await expect(page.getByTestId("libro-totales")).toContainText("$ 34.125,00");

    await page.goto("/clientes");
    await expect(page.getByRole("row", { name: /Imprenta Del Sur/ })).toBeVisible();
    await page.getByRole("cell", { name: /Imprenta Del Sur/ }).click();
    await expect(page.getByTestId("cuenta-corriente")).toContainText("$ 96.625,00");

    // Sueldos del mes, directo de la API con la sesión de la dueña
    const token = await page.evaluate(() => localStorage.getItem("prexacode-token"));
    const r = await page.request.get("/api/empleados", { headers: { authorization: `Bearer ${token}` } });
    expect((await r.json()).resumen).toMatchObject({ activos: 2, pagadoMes: 1_480_000, sueldosPendientes: 0, sueldosMensuales: 1_450_000 });
  });

  await paso("16. Nadie vio un 'no tenés permiso': cada pantalla pidió solo lo que su rol puede ver", async () => {
    expect([...new Set(prohibidos)]).toEqual([]);
  });

  await carla.close();
  await oscar.close();
  await diego.close();
});
