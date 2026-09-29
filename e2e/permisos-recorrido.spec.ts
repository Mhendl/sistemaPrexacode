/**
 * RECORRIDO DE PERMISOS: por cada permiso del catálogo, un rol que tiene solo ese permiso.
 * Con ese usuario se abren todas las pantallas que le corresponden (listados y fichas):
 * ninguna puede fallar, mostrar "Sin acceso", ni pedirle al servidor algo que su rol no puede ver.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PERMISOS, REQUIERE, type Permiso } from "../server/src/lib/permisos";
import { crearCuenta, cuitValido, emailUnico, PASSWORD } from "./helpers";

/** Pantalla → permiso que la habilita (vacío: todos) */
const PANTALLAS: { url: (ids: Record<string, string>) => string; permiso?: Permiso[] }[] = [
  { url: () => "/" },
  { url: () => "/soporte" },
  { url: () => "/cuenta/notificaciones" },
  { url: () => "/clientes", permiso: ["clientes.ver"] },
  { url: (i) => `/clientes/${i.cliente}`, permiso: ["clientes.ver"] },
  { url: () => "/oportunidades", permiso: ["oportunidades.ver"] },
  { url: () => "/agenda", permiso: ["agenda.ver"] },
  { url: () => "/remitos", permiso: ["remitos.ver"] },
  { url: (i) => `/remitos/${i.remito}`, permiso: ["remitos.ver"] },
  { url: () => "/remitos/nuevo", permiso: ["remitos.emitir"] },
  { url: () => "/facturacion", permiso: ["facturacion.ver"] },
  { url: (i) => `/facturacion/${i.factura}`, permiso: ["facturacion.ver"] },
  { url: () => "/facturacion/nueva", permiso: ["facturacion.emitir"] },
  { url: () => "/presupuestos", permiso: ["presupuestos.ver"] },
  { url: (i) => `/presupuestos/${i.presupuesto}`, permiso: ["presupuestos.ver"] },
  { url: () => "/presupuestos/nuevo", permiso: ["presupuestos.editar"] },
  { url: () => "/cobranzas", permiso: ["cobranzas.ver"] },
  { url: (i) => `/cobranzas/recibos/${i.recibo}`, permiso: ["cobranzas.ver"] },
  { url: () => "/cobranzas/nuevo", permiso: ["cobranzas.cobrar"] },
  { url: () => "/productos", permiso: ["productos.ver"] },
  { url: (i) => `/productos/${i.producto}`, permiso: ["productos.ver"] },
  { url: () => "/movimientos", permiso: ["stock.movimientos"] },
  { url: () => "/empleados", permiso: ["empleados.ver"] },
  { url: (i) => `/empleados/${i.empleado}`, permiso: ["empleados.ver"] },
  { url: (i) => `/empleados/pagos/${i.pago}`, permiso: ["empleados.ver"] },
  { url: () => "/reportes", permiso: ["reportes.ver"] },
  { url: () => "/importar-exportar", permiso: ["clientes.ver", "productos.ver"] },
  { url: () => "/configuracion", permiso: ["configuracion"] },
];

/** Todo lo que el rol termina teniendo (el permiso y los que se agregan solos) */
function efectivos(p: Permiso) {
  const s = new Set<Permiso>([p]);
  for (const x of [...s]) for (const r of REQUIERE[x] ?? []) s.add(r);
  return s;
}

async function empresaConDatos(request: APIRequestContext) {
  const cuenta = await crearCuenta(request, `Empresa Permisos ${Date.now()}`);
  const h = { authorization: `Bearer ${cuenta.token}` };
  const post = async (url: string, data: object) => {
    const r = await request.post(url, { headers: h, data });
    expect(r.ok(), `${url}: ${await r.text()}`).toBe(true);
    return r.json();
  };
  await request.put("/api/suscripcion", { headers: h, data: { plan: "profesional", usuariosAdicionales: 2 } });
  const cliente = await post("/api/clientes", { razonSocial: "Cliente Recorrido S.A.", cuit: cuitValido(), condicionIva: "Responsable Inscripto" });
  const producto = await post("/api/productos", { codigo: "REC-1", descripcion: "Producto recorrido", precio: 1000, alicuotaIva: 21, controlaStock: true, stockInicial: 50, stockMinimo: 60 });
  const factura = await post("/api/comprobantes", { clienteId: cliente.id, condicionVenta: "Cuenta corriente", items: [{ productoId: producto.id, cantidad: 2 }] });
  const presupuesto = await post("/api/presupuestos", { clienteId: cliente.id, items: [{ productoId: producto.id, cantidad: 1 }] });
  const remito = await post("/api/remitos", { clienteId: cliente.id, items: [{ productoId: producto.id, cantidad: 1 }] });
  const recibo = await post("/api/recibos", { clienteId: cliente.id, medios: [{ medio: "Efectivo", importe: 100 }], imputaciones: [{ comprobanteId: factura.id, importe: 100 }] });
  await post("/api/oportunidades", { titulo: "Oportunidad recorrido", clienteId: cliente.id, monto: 1000 });
  const empleado = await post("/api/empleados", { nombre: "Ana", apellido: "Recorrido", fechaIngreso: "2022-01-10", sueldo: 500000 });
  const pago = await post(`/api/empleados/${empleado.id}/pagos`, { tipo: "Bono", periodo: "2026-05", conceptos: [{ concepto: "Bono", importe: 1000 }], medio: "Efectivo" });
  return { h, post, ids: { cliente: cliente.id, producto: producto.id, factura: factura.id, presupuesto: presupuesto.id, remito: remito.id, recibo: recibo.id, empleado: empleado.id, pago: pago.id } };
}

async function cargada(page: Page) {
  await expect(page.locator("main h1").first()).toBeVisible();
  await expect(page.locator("main").getByText("Cargando…")).toHaveCount(0);
}

for (const permiso of PERMISOS) {
  test(`un rol con solo "${permiso}" abre todo lo suyo sin errores`, async ({ page, request }) => {
    test.setTimeout(90_000);
    const { post, ids } = await empresaConDatos(request);
    const rol = await post("/api/roles", { nombre: `Solo ${permiso}`, permisos: [permiso] });
    const email = emailUnico("rol");
    await post("/api/usuarios", { nombre: "Persona Con Rol", email, password: PASSWORD, rolId: rol.id });
    const token = (await (await request.post("/api/auth/login", { data: { email, password: PASSWORD } })).json()).token;

    const problemas: string[] = [];
    page.on("response", (r) => r.status() === 403 && r.url().includes("/api/") && problemas.push(`403 ${r.request().method()} ${new URL(r.url()).pathname}`));
    page.on("pageerror", (e) => problemas.push(`error de la página: ${e.message.slice(0, 150)}`));
    await page.goto("/login");
    await page.evaluate((t) => localStorage.setItem("prexacode-token", t), token);

    const tiene = efectivos(permiso);
    for (const pantalla of PANTALLAS) {
      const url = pantalla.url(ids);
      const puede = !pantalla.permiso || pantalla.permiso.some((p) => tiene.has(p));
      await page.goto(url);
      if (puede) {
        try {
          await cargada(page);
        } catch {
          problemas.push(`${url}: no terminó de cargar ("${(await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 160)}")`);
          continue;
        }
        if (await page.getByText("Sin acceso a este módulo").count()) problemas.push(`${url}: dice "Sin acceso" pero tiene permiso`);
      } else {
        await expect(page.getByText("Sin acceso a este módulo").or(page.getByRole("heading", { name: /^Hola, / }))).toBeVisible();
      }
    }
    expect([...new Set(problemas)], [...new Set(problemas)].join("\n")).toEqual([]);
  });
}
