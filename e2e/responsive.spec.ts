import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { crearCuenta, cuitValido, entrarAlPanel, entrarCon, type Cuenta } from "./helpers";

/**
 * Celular y tablet: cada pantalla entra en el ancho (sin scroll horizontal de la página; las tablas anchas
 * se desplazan dentro de su recuadro) y el menú se puede abrir y usar.
 */
const PANTALLAS = [
  { nombre: "celular", viewport: { width: 375, height: 812 } },
  { nombre: "tablet", viewport: { width: 768, height: 1024 } },
];

async function conDatos(request: APIRequestContext): Promise<Cuenta & { clienteId: string; facturaId: string }> {
  const cuenta = await crearCuenta(request, `Comercio Responsive ${Date.now()}`);
  const h = { authorization: `Bearer ${cuenta.token}` };
  const cliente = await (await request.post("/api/clientes", { headers: h, data: { razonSocial: "Constructora del Litoral Sociedad Anónima con Nombre Largo", cuit: cuitValido(), condicionIva: "Responsable Inscripto", email: "compras.constructora.litoral@ejemplo.com.ar" } })).json();
  const producto = await (await request.post("/api/productos", { headers: h, data: { codigo: "NB-001", descripcion: "Notebook 15,6 pulgadas 16 GB RAM 512 GB SSD", precio: 850000, alicuotaIva: 21, controlaStock: true, stockInicial: 20, stockMinimo: 2 } })).json();
  const factura = await (await request.post("/api/comprobantes", { headers: h, data: { clienteId: cliente.id, condicionVenta: "Cuenta corriente", items: [{ productoId: producto.id, cantidad: 2 }] } })).json();
  await request.post("/api/presupuestos", { headers: h, data: { clienteId: cliente.id, items: [{ productoId: producto.id, cantidad: 1 }] } });
  return { ...cuenta, clienteId: cliente.id, facturaId: factura.id };
}

async function revisar(page: Page, url: string, problemas: string[]) {
  await page.goto(url);
  // Pantalla cargada: con su título y sin "Cargando…" (no se espera a la red: con consultas periódicas nunca queda quieta)
  await expect(page.locator("main h1").first()).toBeVisible();
  await expect(page.locator("main").getByText("Cargando…")).toHaveCount(0);
  const { ancho, contenido, culpables } = await page.evaluate(() => {
    const ancho = window.innerWidth;
    // Elementos que se salen por la derecha y no están dentro de algo que se desplaza
    const culpables: string[] = [];
    for (const el of Array.from(document.querySelectorAll("main *"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= ancho + 1) continue;
      let dentroDeScroll = false;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === "auto" || o === "scroll") {
          dentroDeScroll = true;
          break;
        }
      }
      if (!dentroDeScroll) culpables.push(`<${el.tagName.toLowerCase()} class="${(el.getAttribute("class") ?? "").slice(0, 60)}"> ${Math.round(r.right - ancho)}px`);
    }
    return { ancho, contenido: document.documentElement.scrollWidth, culpables: culpables.slice(0, 3) };
  });
  if (contenido > ancho + 1 || culpables.length) problemas.push(`${url}: se sale ${contenido - ancho}px ${culpables.join(" | ")}`);
}

for (const { nombre, viewport } of PANTALLAS) {
  test.describe(`En ${nombre} (${viewport.width}px)`, () => {
    test.use({ viewport });

    test("todas las pantallas de la empresa entran en el ancho y el menú funciona", async ({ page, request }) => {
      const cuenta = await conDatos(request);
      await entrarCon(page, cuenta);
      const problemas: string[] = [];
      for (const url of [
        "/",
        "/clientes",
        `/clientes/${cuenta.clienteId}`,
        "/oportunidades",
        "/agenda",
        "/remitos",
        "/remitos/nuevo",
        "/facturacion",
        "/facturacion/nueva",
        `/facturacion/${cuenta.facturaId}`,
        "/presupuestos",
        "/presupuestos/nuevo",
        "/cobranzas",
        "/cobranzas/nuevo",
        "/productos",
        "/movimientos",
        "/reportes",
        "/importar-exportar",
        "/configuracion",
        "/configuracion?tab=usuarios",
        "/configuracion?tab=plan",
        "/cuenta/notificaciones",
        "/soporte",
        "/ayuda",
        "/empleados",
        "/configuracion?tab=roles",
      ]) {
        await revisar(page, url, problemas);
      }
      expect(problemas, problemas.join("\n")).toEqual([]);

      // Menú: en el celular se abre con el botón; en la tablet también (la barra lateral es para pantallas grandes)
      await page.goto("/");
      await page.getByRole("button", { name: "Abrir menú" }).click();
      await page.getByRole("dialog").getByRole("link", { name: "Clientes" }).click();
      await expect(page).toHaveURL(/\/clientes$/);
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });

    test("el panel de administración entra en el ancho y el menú funciona", async ({ page, request }) => {
      await crearCuenta(request, `Empresa Para El Panel ${Date.now()}`);
      await entrarAlPanel(page);
      const problemas: string[] = [];
      for (const url of ["/admin", "/admin/empresas", "/admin/pagos", "/admin/solicitudes", "/admin/soporte", "/admin/auditoria", "/admin/administradores"]) {
        await revisar(page, url, problemas);
      }
      // El detalle de una empresa
      await page.goto("/admin/empresas");
      await page.getByRole("cell", { name: /Empresa Para El Panel/ }).first().click();
      await expect(page.getByTestId("suscripcion-empresa")).toBeVisible();
      await revisar(page, page.url().replace(/^https?:\/\/[^/]+/, ""), problemas);
      expect(problemas, problemas.join("\n")).toEqual([]);

      await page.getByRole("button", { name: "Abrir menú del panel" }).click();
      await page.getByRole("dialog").getByRole("link", { name: "Pagos" }).click();
      await expect(page).toHaveURL(/\/admin\/pagos$/);
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });
  });
}

test.describe("En celular: pantallas sin sesión", () => {
  test.use({ viewport: { width: 375, height: 812 } });
  test("login, registro, legales y el login del panel entran en el ancho", async ({ page }) => {
    for (const url of ["/login", "/registro", "/terminos", "/baja", "/arrepentimiento", "/admin/login"]) {
      await page.goto(url);
      await page.waitForLoadState("load");
      await page.waitForTimeout(300);
      const { ancho, contenido } = await page.evaluate(() => ({ ancho: window.innerWidth, contenido: document.documentElement.scrollWidth }));
      expect(contenido, `${url} se sale ${contenido - ancho}px`).toBeLessThanOrEqual(ancho + 1);
    }
  });
});
