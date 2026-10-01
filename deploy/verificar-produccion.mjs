// Recorre producción con las cuentas demo, como lo haría un cliente: entra, abre cada pantalla y revisa que cargue
// sin errores, con datos y que entre en el ancho del celular. Solo mira: no carga ni modifica nada.
// Uso:  CLAVE_DEMO=… node deploy/verificar-produccion.mjs        (necesita Chrome instalado)
import { chromium } from "@playwright/test";

const CLAVE = process.env.CLAVE_DEMO;
if (!CLAVE) throw new Error("Falta CLAVE_DEMO");
const GESTION = "https://sistema.prexacode.com";
const DENTAL = "https://app.coredental.com.ar";

const RECORRIDOS = [
  {
    nombre: "Prexacode · Distribuidora (administrador)",
    base: GESTION,
    email: "demo.distribuidora@prexacode.com",
    pantallas: [
      ["/", /Hola, /],
      ["/clientes", /Supermercado El Sol/],
      ["/oportunidades", /Abastecimiento mensual/],
      ["/agenda", /Agenda/],
      ["/facturacion", /Factura/],
      ["/presupuestos", /Presupuesto|Despensa María/],
      ["/cobranzas", /Cobranzas|Recibo/],
      ["/remitos", /Remito/],
      ["/productos", /Yerba mate/],
      ["/movimientos", /Movimientos/],
      ["/empleados", /Ramírez/],
      ["/reportes", /Reportes/],
      ["/configuracion", /Configuración/],
      ["/ayuda", /ayuda/i],
    ],
  },
  { nombre: "Prexacode · Distribuidora (vendedora)", base: GESTION, email: "demo.vendedor@prexacode.com", pantallas: [["/", /Hola, /], ["/clientes", /Supermercado El Sol/], ["/facturacion", /Factura/]] },
  {
    nombre: "Prexacode · Servicio técnico",
    base: GESTION,
    email: "demo.servicios@prexacode.com",
    pantallas: [["/", /Hola, /], ["/agenda", /Agendar orden de servicio|Orden de servicio/i], ["/clientes", /Hotel Plaza/], ["/productos", /Instalación de aire/], ["/facturacion", /Factura/], ["/presupuestos", /Estudio Contable|Presupuesto/]],
  },
  {
    nombre: "CoreDental · Consultorio",
    base: DENTAL,
    email: "demo.consultorio@prexacode.com",
    pantallas: [
      ["/", /Hola, /],
      ["/pacientes", /González, María/],
      ["/agenda", /Turnos|Agenda/],
      ["/prestaciones", /Prestaciones y precios/],
      ["/presupuestos", /Presupuesto|Martínez, Sofía/],
      ["/cobranzas", /Cobros|deuda/i],
      ["/caja", /Caja/],
      ["/gastos", /Gastos/],
      ["/laboratorios", /Laboratorio Dental Belgrano/],
      ["/liquidacion", /Liquidación/],
      ["/facturacion", /Facturación/],
      ["/campanas", /Campañas/],
      ["/configuracion?tab=agenda", /Turnos online/],
    ],
  },
  {
    nombre: "CoreDental · Clínica (dueño)",
    base: DENTAL,
    email: "demo.clinica@prexacode.com",
    pantallas: [["/", /Hola, /], ["/pacientes", /Romero, Ana/], ["/agenda", /Turnos|Agenda/], ["/honorarios", /Florencia Ruiz/], ["/laboratorios", /Ortolab/], ["/campanas", /Control semestral/], ["/empleados", /Equipo|Empleados/]],
  },
  { nombre: "CoreDental · Clínica (profesional)", base: DENTAL, email: "demo.profesional@prexacode.com", pantallas: [["/", /Hola, /], ["/pacientes", /López, Jorge/], ["/agenda", /Turnos|Agenda/]] },
  { nombre: "CoreDental · Clínica (recepción)", base: DENTAL, email: "demo.recepcion@prexacode.com", pantallas: [["/", /Hola, /], ["/pacientes", /López, Jorge/], ["/caja", /Caja/]] },
];

const problemas = [];
const anotar = problemas.push.bind(problemas);
problemas.push = (...xs) => { for (const x of xs) console.log("  ✗", x); return anotar(...xs); };
const navegador = await chromium.launch({ channel: "chrome" });
for (const r of RECORRIDOS) {
  let sesion = null; // se entra una sola vez por usuario (el login tiene un límite de intentos por minuto)
  for (const ancho of [1366, 390]) {
    const ctx = await navegador.newContext({ viewport: { width: ancho, height: 900 }, ...(sesion ? { storageState: sesion } : {}) });
    const page = await ctx.newPage();
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));
    page.on("console", (m) => m.type() === "error" && !/favicon|cloudflareinsights|Failed to load resource: the server responded with a status of 40[134]/.test(m.text()) && errores.push(m.text()));
    page.on("response", (res) => res.url().includes("/api/") && res.status() === 400 && errores.push(`400 ${res.url()}`));
    page.on("response", (res) => res.url().includes("/api/") && res.status() >= 500 && errores.push(`${res.status()} ${res.url()}`));
    if (sesion) await page.goto(`${r.base}/`);
    else {
      await page.goto(`${r.base}/login`);
      await page.getByLabel("Email").fill(r.email);
      await page.getByLabel("Contraseña").fill(CLAVE);
      await page.getByRole("button", { name: "Ingresar" }).click();
    }
    try {
      await page.getByRole("heading", { name: /^Hola, / }).waitFor({ timeout: 20_000 });
    } catch {
      problemas.push(`${r.nombre} (${ancho}px): no pudo entrar`);
      await ctx.close();
      continue;
    }
    sesion ??= await ctx.storageState();
    // Si tiene ficha de paciente, también se abre una
    const pantallas = [...r.pantallas];
    for (const [ruta, espera] of pantallas) {
      const antes = errores.length;
      await page.goto(`${r.base}${ruta}`);
      try {
        await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
        await page.getByText(espera).locator("visible=true").first().waitFor({ timeout: 15_000 });
      } catch {
        problemas.push(`${r.nombre} (${ancho}px) ${ruta}: no aparece "${espera.source}"`);
      }
      const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (desborde > 1) problemas.push(`${r.nombre} (${ancho}px) ${ruta}: se sale del ancho (${desborde}px)`);
      if (/No tenés permiso|Algo salió mal|Error inesperado/.test(await page.locator("body").innerText())) problemas.push(`${r.nombre} (${ancho}px) ${ruta}: muestra un error en pantalla`);
      for (const e of errores.slice(antes)) problemas.push(`${r.nombre} (${ancho}px) ${ruta}: ${e.slice(0, 200)}`);
    }
    // Ficha de un paciente con todas sus pestañas (CoreDental)
    if (r.base === DENTAL) {
      await page.goto(`${r.base}/pacientes`);
      await page.waitForLoadState("networkidle");
      const fila = page.getByRole("row").nth(1);
      if (await fila.count()) {
        await fila.click();
        await page.waitForLoadState("networkidle");
        for (const tab of await page.getByRole("tab").all()) {
          const nombre = (await tab.textContent())?.trim();
          const antes = errores.length;
          await tab.click();
          await page.waitForLoadState("networkidle");
          for (const e of errores.slice(antes)) problemas.push(`${r.nombre} (${ancho}px) ficha · ${nombre}: ${e.slice(0, 200)}`);
          const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          if (desborde > 1) problemas.push(`${r.nombre} (${ancho}px) ficha · ${nombre}: se sale del ancho (${desborde}px)`);
        }
      }
    }
    console.log(`— ${r.nombre} (${ancho}px) revisado`);
    await ctx.close();
  }
}

// Páginas públicas
const pub = await navegador.newPage();
for (const [url, espera] of [
  ["https://coredental.com.ar/", /Probar 14 días gratis/],
  ["https://productos.prexacode.com/", /Probar 14 días gratis/],
  [`${DENTAL}/registro`, /Creá la cuenta/],
  [`${GESTION}/registro`, /Creá la cuenta/],
  [`${GESTION}/terminos`, /Términos/],
]) {
  await pub.goto(url);
  try {
    await pub.getByText(espera).first().waitFor({ timeout: 15_000 });
  } catch {
    problemas.push(`${url}: no aparece "${espera.source}"`);
  }
}
await navegador.close();
console.log(problemas.length ? `\n${problemas.length} problemas:\n- ${problemas.join("\n- ")}` : "\nTodo bien: cada pantalla cargó, con datos, sin errores y entrando en el celular.");
