/**
 * PRUEBA FINAL: TRES EMPRESAS, SEIS MESES
 *
 * Tres empresas se suman el mismo día, una con cada plan, y trabajan medio año con el reloj simulado.
 * De un lado, cada empresa (cliente de Prexacode); del otro, el administrador del panel.
 *
 *  Kiosco (Básico, mensual)       llega al límite de usuarios, compra uno más a mitad de mes, se olvida
 *                                 de pagar (gracia → solo lectura → paga), y una vez paga por transferencia
 *  Estudio (Profesional, mensual) llena los 5 usuarios, sube a Empresa a mitad de período, recibe una
 *                                 compensación, lo suspenden un día, y después baja a Profesional
 *                                 (programado para la renovación)
 *  Distribuidora (Empresa, anual) paga el año, llena los 10 usuarios y compra 2 más (proporcional anual)
 *
 * Cada día hábil las empresas facturan y cobran. Cada mes se cruza todo:
 *  - lo que dice cada empresa (reportes, cobranzas, numeración) con un libro paralelo
 *  - que una empresa no vea nada de otra
 *  - que el panel (MRR, cobrado, estados, pagos por empresa, auditoría) coincida con lo que realmente se cobró
 *  - que los períodos pagos sean contiguos (renovar antes de vencer no hace perder días)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { usuarios } from "../src/db/schema.js";
import { hoyAr } from "../src/lib/cuentas.js";
import { precioUsd, sumarDias, type PlanId } from "../src/lib/suscripcion.js";
import { auth, crearApp, cuitValido, emailUnico, type TestApp } from "./helpers.js";

const INICIO = Date.UTC(2026, 2, 2, 13, 0); // lunes 02/03/2026, 10:00 en Argentina
const DIA = 86_400_000;
const DIAS = 184; // hasta fines de agosto
const ADMIN = { email: "duenio@prexacode.com.ar", password: "clave-del-panel-2026" };
const r2 = (n: number) => Math.round(n * 100) / 100;

let diaSimulado = 0;
const irAlDia = (n: number) => {
  diaSimulado = n;
  vi.setSystemTime(INICIO + n * DIA);
};
/** El dólar sube un poco cada mes */
const dolarDelDia = () => 1000 + 25 * Math.floor(diaSimulado / 30);

/** Azar con semilla: siempre la misma historia */
function azar(semilla: number) {
  let a = semilla >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { r, entero: (min: number, max: number) => min + Math.floor(r() * (max - min + 1)), uno: <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]! };
}

type Resp = { status: number; body: any };

interface PagoLibro {
  referencia: string;
  tipo: "periodo" | "cambio" | "manual";
  ars: number;
  mes: string;
}

interface Empresa {
  nombre: string;
  id: string;
  adminId: string;
  adminEmail: string;
  usuarios: { id: string; email: string; estado: "Activo" | "Suspendido" }[];
  clientes: string[];
  /** Libro paralelo */
  ventasPorMes: Map<string, number>;
  pendientes: { id: string; clienteId: string; saldo: number }[];
  pagos: PagoLibro[];
  /** Hasta cuándo está pago según los pagos que hizo */
  pagoHasta: string | null;
  comprobantes: number;
  /** Sueldos (libro paralelo) */
  empleados: { id: string; sueldo: number }[];
  sueldosPorMes: Map<string, number>;
  adelantos: Map<string, number>;
  sueldosPendientes: { empleadoId: string; periodo: string }[];
  producto: { id: string; precio: number };
  cajero?: string;
}

describe("prueba final: 3 empresas, una por plan, trabajando 6 meses", () => {
  let app: TestApp;
  let cerrar: () => Promise<void>;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    irAlDia(0);
    ({ app, cerrar } = await crearApp({ adminInicial: ADMIN, cotizacion: async () => dolarDelDia() }));
  });
  afterAll(async () => {
    await cerrar();
    vi.useRealTimers();
  });

  it("todo cierra, todos los meses, de los dos lados", async () => {
    const z = azar(Number(process.env.SIM_SEMILLA ?? 20260302));
    const pedido = async (token: string, method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, payload?: object): Promise<Resp> => {
      const res = await app.inject({ method, url: `/api${url}`, headers: auth(token), ...(payload ? { payload } : {}) });
      return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
    };
    // Sesiones del día (los tokens duran horas y el reloj avanza días): se firman igual que en el login
    // (con una sesión vigente por usuario, como la que deja el login)
    const sesiones = new Map<string, string>();
    const tokenDe = (e: Empresa, userId = e.adminId) => app.jwt.sign({ sub: userId, empresaId: e.id, rol: userId === e.adminId ? "admin" : "ventas", sid: sesiones.get(userId) });
    const abrirSesiones = async () => {
      for (const u of await app.db.select({ id: usuarios.id, sesionId: usuarios.sesionId }).from(usuarios)) {
        if (u.sesionId) sesiones.set(u.id, u.sesionId);
        else {
          const sid = randomUUID();
          await app.db.update(usuarios).set({ sesionId: sid }).where(eq(usuarios.id, u.id));
          sesiones.set(u.id, sid);
        }
      }
    };
    let adminPanelId = "";
    const panel = () => app.jwt.sign({ sub: adminPanelId, empresaId: "", rol: "admin", tipo: "plataforma" });
    const como = (e: Empresa) => ({
      get: (url: string) => pedido(tokenDe(e), "GET", url),
      post: (url: string, body: object = {}) => pedido(tokenDe(e), "POST", url, body),
      put: (url: string, body: object) => pedido(tokenDe(e), "PUT", url, body),
      patch: (url: string, body: object) => pedido(tokenDe(e), "PATCH", url, body),
    });
    const suscripcion = async (e: Empresa) => (await como(e).get("/suscripcion")).body;
    const problemas: string[] = [];

    // ---------------------------------------------------------------- el panel: entra con usuario y contraseña
    const login = await app.inject({ method: "POST", url: "/api/admin/login", payload: ADMIN });
    expect(login.statusCode).toBe(200);
    adminPanelId = login.json().admin.id;

    // ---------------------------------------------------------------- día 0: se suman las tres
    const registrar = async (nombre: string, plan: PlanId): Promise<Empresa> => {
      const email = emailUnico("admin");
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/registro",
        payload: { empresa: { razonSocial: nombre, cuit: cuitValido("30"), condicionIva: "Responsable Inscripto" }, usuario: { nombre: `Admin ${nombre}`, email, password: "clave-segura-123" }, aceptaTerminos: true },
      });
      expect(res.statusCode, res.body).toBe(201);
      const b = res.json();
      const e: Empresa = {
        nombre,
        id: b.empresa.id,
        adminId: b.usuario.id,
        adminEmail: email,
        usuarios: [{ id: b.usuario.id, email, estado: "Activo" }],
        clientes: [],
        ventasPorMes: new Map(),
        pendientes: [],
        pagos: [],
        pagoHasta: null,
        comprobantes: 0,
        empleados: [],
        sueldosPorMes: new Map(),
        adelantos: new Map(),
        sueldosPendientes: [],
        producto: { id: "", precio: 0 },
      };
      await abrirSesiones();
      const s = await suscripcion(e);
      expect(s).toMatchObject({ estado: "Prueba", plan: "profesional", pruebaHasta: sumarDias(hoyAr(), 14) });
      if (plan !== "profesional") expect((await como(e).put("/suscripcion", { plan, usuariosAdicionales: 0 })).body).toMatchObject({ aplicado: "inmediato", plan });
      for (let i = 0; i < 6; i++) {
        const c = await como(e).post("/clientes", { razonSocial: `Cliente ${i + 1} de ${nombre}`, cuit: cuitValido(i % 2 ? "20" : "30"), condicionIva: i % 2 ? "Consumidor Final" : "Responsable Inscripto" });
        expect(c.status).toBe(201);
        e.clientes.push(c.body.id);
      }
      // Empleados (la distribuidora tiene más) y un producto de catálogo
      for (let i = 0; i < (plan === "empresa" ? 3 : 2); i++) {
        const sueldo = 600000 + i * 150000;
        const emp = await como(e).post("/empleados", { nombre: `Empleado ${i + 1}`, apellido: nombre.split(" ")[0], fechaIngreso: "2025-06-01", sueldo, modalidad: "Mensual" });
        expect(emp.status, JSON.stringify(emp.body)).toBe(201);
        e.empleados.push({ id: emp.body.id, sueldo });
      }
      const prod = await como(e).post("/productos", { codigo: "CAT-1", descripcion: "Artículo de catálogo", precio: 10000, alicuotaIva: 21, controlaStock: false, stockMinimo: 0 });
      expect(prod.status).toBe(201);
      e.producto = { id: prod.body.id, precio: 10000 };
      return e;
    };
    await abrirSesiones();
    const kiosco = await registrar("Kiosco El Básico", "basico");
    const estudio = await registrar("Estudio Profesional S.A.", "profesional");
    const distri = await registrar("Distribuidora Empresa S.R.L.", "empresa");
    const todas = [kiosco, estudio, distri];

    /** Crea usuarios hasta el límite y comprueba que el siguiente se rechaza */
    const nuevoUsuario = (e: Empresa) => como(e).post("/usuarios", { nombre: "Usuario", email: emailUnico("u"), rol: "ventas", password: "clave-segura-123" });
    const llenarUsuarios = async (e: Empresa, limite: number) => {
      while (e.usuarios.filter((u) => u.estado === "Activo").length < limite) {
        const r = await nuevoUsuario(e);
        expect(r.status, `${e.nombre}: ${JSON.stringify(r.body)}`).toBe(201);
        e.usuarios.push({ id: r.body.id, email: r.body.email, estado: "Activo" });
        await abrirSesiones();
      }
      const extra = await nuevoUsuario(e);
      expect(extra.status, `${e.nombre} no debería poder pasar de ${limite} usuarios`).toBe(409);
      expect(extra.body.code).toBe("LIMITE_PLAN");
      expect((await suscripcion(e)).usos.usuarios).toBe(limite);
    };
    await llenarUsuarios(kiosco, 2);
    await llenarUsuarios(estudio, 5);
    await llenarUsuarios(distri, 10);
    // En el Estudio, uno de los usuarios pasa a un rol a medida: Cajero (solo cobra)
    {
      const rol = await como(estudio).post("/roles", { nombre: "Cajero", permisos: ["cobranzas.cobrar"] });
      expect(rol.status).toBe(201);
      const u = estudio.usuarios.filter((x) => x.id !== estudio.adminId).at(-1)!; // el último: nadie lo suspende
      expect((await como(estudio).patch(`/usuarios/${u.id}`, { rolId: rol.body.id })).status).toBe(200);
      estudio.cajero = u.id;
    }

    // Reactivar a alguien no puede ser una puerta trasera para pasar el límite
    const suspendido = estudio.usuarios[1]!;
    expect((await como(estudio).patch(`/usuarios/${suspendido.id}`, { estado: "Suspendido" })).status).toBe(200);
    suspendido.estado = "Suspendido";
    const reemplazo = await nuevoUsuario(estudio);
    expect(reemplazo.status).toBe(201);
    estudio.usuarios.push({ id: reemplazo.body.id, email: reemplazo.body.email, estado: "Activo" });
    await abrirSesiones();
    const reactivar = await como(estudio).patch(`/usuarios/${suspendido.id}`, { estado: "Activo" });
    expect(reactivar.status).toBe(409);
    expect(reactivar.body.code).toBe("LIMITE_PLAN");

    // ---------------------------------------------------------------- pagos (con el libro paralelo)
    const mes = () => hoyAr().slice(0, 7);
    const aprobar = async (e: Empresa, referencia: string, tipo: PagoLibro["tipo"], ars: number) => {
      const p = await como(e).post(`/suscripcion/pagos/${referencia}/simular`, { resultado: "Aprobado" });
      expect(p.status, JSON.stringify(p.body)).toBe(200);
      expect(p.body.estado).toBe("Aprobado");
      e.pagos.push({ referencia, tipo, ars, mes: mes() });
      return p.body;
    };

    /** Paga un período: tiene que empezar justo al día siguiente del vencimiento (o hoy, si ya venció) */
    const pagarPeriodo = async (e: Empresa, periodo: "mensual" | "anual") => {
      const antes = await suscripcion(e);
      const cobro = await como(e).post("/suscripcion/pagar", { periodo });
      expect(cobro.status, JSON.stringify(cobro.body)).toBe(200);
      const plan = (antes.planProximo ?? antes.plan) as PlanId;
      const ad = antes.adicionalesProximos ?? antes.usuariosAdicionales;
      expect(cobro.body.importeUsd).toBe(precioUsd(plan, ad, periodo));
      expect(cobro.body.importeArs).toBe(r2(precioUsd(plan, ad, periodo) * dolarDelDia()));
      const pago = await aprobar(e, cobro.body.referencia, "periodo", cobro.body.importeArs);
      const vence = antes.vence as string;
      const desdeEsperado = vence >= hoyAr() ? sumarDias(vence, 1) : hoyAr();
      if (pago.desde !== desdeEsperado) problemas.push(`${e.nombre}: el pago del ${hoyAr()} arranca el ${pago.desde} y debía arrancar el ${desdeEsperado}`);
      e.pagoHasta = pago.hasta;
      const despues = await suscripcion(e);
      expect(despues).toMatchObject({ estado: "Activa", pagoHasta: pago.hasta, plan, usuariosAdicionales: ad, planProximo: null });
      return pago;
    };

    /** Cambio de plan o usuarios con el período pago: se paga la diferencia y el vencimiento no se mueve */
    const cambiarPagando = async (e: Empresa, plan: PlanId, ad: number, usdEsperado: number) => {
      const antes = await suscripcion(e);
      const r = await como(e).put("/suscripcion", { plan, usuariosAdicionales: ad });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.aplicado).toBe("pagar");
      expect(r.body.importeUsd).toBeCloseTo(usdEsperado, 2);
      // Hasta que se acredite, nada cambia
      expect(await suscripcion(e)).toMatchObject({ plan: antes.plan, usuariosAdicionales: antes.usuariosAdicionales });
      const pago = await aprobar(e, r.body.referencia, "cambio", r.body.importeArs);
      expect(pago.hasta).toBe(antes.pagoHasta);
      expect(await suscripcion(e)).toMatchObject({ plan, usuariosAdicionales: ad, pagoHasta: antes.pagoHasta, estado: "Activa" });
    };

    // ---------------------------------------------------------------- operación diaria
    const facturar = async (e: Empresa) => {
      const cc = z.r() < 0.6;
      const items: Record<string, unknown>[] = Array.from({ length: z.entero(1, 3) }, () => ({ descripcion: `Servicio ${z.entero(1, 50)}`, cantidad: z.entero(1, 4), precioUnitario: z.entero(1000, 90000), alicuotaIva: z.uno([21, 10.5]) }));
      const conProducto = z.r() < 0.3;
      if (conProducto) items.push({ productoId: e.producto.id, cantidad: z.entero(1, 3) });
      // El cajero no factura: vende cualquier otro
      const vendedor = z.uno(e.usuarios.filter((u) => u.estado === "Activo" && u.id !== e.cajero));
      const r = await pedido(tokenDe(e, vendedor.id), "POST", "/comprobantes", {
        clienteId: z.uno(e.clientes),
        condicionVenta: cc ? "Cuenta corriente" : "Contado",
        ...(cc ? {} : { cobro: { medio: "Efectivo" } }),
        items,
      });
      return { r, cc, conProducto };
    };
    const registrarVenta = async (e: Empresa, r: Resp, cc: boolean, conProducto = false) => {
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body.estado).toBe("Autorizado");
      e.ventasPorMes.set(mes(), r2((e.ventasPorMes.get(mes()) ?? 0) + r.body.total));
      e.comprobantes++;
      if (cc) e.pendientes.push({ id: r.body.id, clienteId: r.body.clienteId, saldo: r.body.total });
      // El producto de catálogo sale siempre al precio vigente (también después del aumento)
      if (conProducto) {
        const det = (await como(e).get(`/comprobantes/${r.body.id}`)).body as { items: { productoId: string | null; precioUnitario: number }[] };
        const renglon = det.items.find((i) => i.productoId === e.producto.id);
        if (!renglon || Math.abs(renglon.precioUnitario - e.producto.precio) > 0.001) problemas.push(`${e.nombre}: facturó el producto a ${renglon?.precioUnitario} y el precio vigente es ${e.producto.precio}`);
      }
    };
    const cobrar = async (e: Empresa) => {
      const f = e.pendientes.filter((p) => p.saldo > 0);
      if (!f.length) return;
      const p = z.uno(f);
      const importe = z.r() < 0.6 ? p.saldo : r2(p.saldo / 2);
      // En el Estudio cobra el cajero (rol a medida)
      const r = await pedido(e.cajero ? tokenDe(e, e.cajero) : tokenDe(e), "POST", "/recibos", { clienteId: p.clienteId, medios: [{ medio: "Transferencia", importe }], imputaciones: [{ comprobanteId: p.id, importe }] });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      p.saldo = r2(p.saldo - importe);
    };

    // ---------------------------------------------------------------- controles de cada mes
    const controlarMes = async (m: string) => {
      const desde = `${m}-01`;
      const hasta = sumarDias(`${sumarDias(desde, 32).slice(0, 7)}-01`, -1);
      for (const e of todas) {
        const v = await como(e).get(`/reportes/ventas?desde=${desde}&hasta=${hasta}`);
        expect(v.status).toBe(200);
        const esperado = e.ventasPorMes.get(m) ?? 0;
        if (Math.abs(v.body.resumen.total - esperado) > 0.011) problemas.push(`${e.nombre} ${m}: reportes dice ${v.body.resumen.total}, el libro ${esperado}`);
        const cob = await como(e).get("/cobranzas/resumen");
        const porCobrar = r2(e.pendientes.reduce((a, p) => a + p.saldo, 0));
        if (Math.abs(cob.body.totales.porCobrar - porCobrar) > 0.011) problemas.push(`${e.nombre} ${m}: por cobrar ${cob.body.totales.porCobrar}, el libro ${porCobrar}`);
      }
      // Sueldos: lo pagado en el mes = el libro; un sueldo por empleado; los adelantos, descontados
      for (const e of todas) {
        const pagos = (await como(e).get(`/empleados/pagos?periodo=${m}`)).body as { empleadoId: string; tipo: string; total: number; estado: string; conceptos: { concepto: string; importe: number }[] }[];
        const emitidos = pagos.filter((p) => p.estado === "Emitido");
        const total = r2(emitidos.reduce((a, p) => a + p.total, 0));
        const libro = r2(e.sueldosPorMes.get(m) ?? 0);
        if (Math.abs(total - libro) > 0.011) problemas.push(`${e.nombre} ${m}: sueldos pagados ${total}, el libro ${libro}`);
        for (const emp of e.empleados) {
          if (e.sueldosPendientes.some((x) => x.empleadoId === emp.id && x.periodo === m)) continue;
          const sueldos = emitidos.filter((p) => p.empleadoId === emp.id && p.tipo === "Sueldo");
          if (sueldos.length !== 1) problemas.push(`${e.nombre} ${m}: ${sueldos.length} sueldos para un empleado`);
          const adel = e.adelantos.get(`${emp.id}|${m}`) ?? 0;
          const desc = sueldos[0]?.conceptos.find((c) => c.concepto === "Adelantos del mes")?.importe ?? 0;
          if (Math.abs(-desc - adel) > 0.011) problemas.push(`${e.nombre} ${m}: adelantos ${adel}, descontados ${-desc}`);
        }
      }
      // El cajero del Estudio cobra pero no factura
      if (estudio.cajero) {
        const intento = await pedido(tokenDe(estudio, estudio.cajero), "POST", "/comprobantes", { clienteId: estudio.clientes[0], condicionVenta: "Contado", cobro: { medio: "Efectivo" }, items: [{ descripcion: "X", cantidad: 1, precioUnitario: 1, alicuotaIva: 21 }] });
        if (intento.status !== 403 && intento.status !== 402) problemas.push(`el cajero pudo facturar (${intento.status})`);
      }
      // Ninguna ve nada de otra
      for (const e of todas) {
        for (const otra of todas.filter((x) => x !== e)) {
          expect((await como(e).get(`/clientes/${otra.clientes[0]}`)).status).toBe(404);
          const suyos = (await como(e).get("/clientes")).body as { id: string }[];
          expect(suyos.some((c) => otra.clientes.includes(c.id))).toBe(false);
          if (otra.pendientes[0]) expect((await como(e).get(`/comprobantes/${otra.pendientes[0].id}`)).status).toBe(404);
        }
      }
      // El panel cuenta lo mismo que se cobró
      const res = (await pedido(panel(), "GET", "/plataforma/resumen")).body;
      const cobrado = r2(todas.flatMap((e) => e.pagos).reduce((a, p) => a + p.ars, 0));
      if (Math.abs(res.cobradoTotal - cobrado) > 0.011) problemas.push(`panel ${m}: cobrado total ${res.cobradoTotal}, el libro ${cobrado}`);
      const delMes = r2(todas.flatMap((e) => e.pagos).filter((p) => p.mes === m).reduce((a, p) => a + p.ars, 0));
      const barra = res.ingresosPorMes.find((x: { clave: string }) => x.clave === m);
      if (!barra || Math.abs(barra.ars - delMes) > 0.011) problemas.push(`panel ${m}: ingresos del mes ${barra?.ars}, el libro ${delMes}`);
      const sumaBarras = r2(res.ingresosPorMes.reduce((a: number, x: { ars: number }) => a + x.ars, 0));
      if (Math.abs(sumaBarras - res.cobradoTotal) > 0.011) problemas.push(`panel ${m}: las barras suman ${sumaBarras} y el total es ${res.cobradoTotal}`);
    };

    const controlarPanelHoy = async () => {
      const res = (await pedido(panel(), "GET", "/plataforma/resumen")).body;
      const lista = (await pedido(panel(), "GET", "/plataforma/empresas")).body as any[];
      let mrr = 0;
      const porEstado: Record<string, number> = { Prueba: 0, Activa: 0, Gracia: 0, SoloLectura: 0 };
      let suspendidas = 0;
      for (const e of todas) {
        const fila = lista.find((x) => x.id === e.id);
        if (fila.suspendida) {
          // Suspendida: la empresa no puede consultar nada; en el panel no suma al MRR ni a los estados
          suspendidas++;
          if (fila.mensualUsd !== 0) problemas.push(`panel ${hoyAr()} ${e.nombre}: suspendida pero suma ${fila.mensualUsd} al MRR`);
          continue;
        }
        const s = await suscripcion(e);
        porEstado[s.estado]++;
        const suspendida = false;
        const mensual = s.estado === "Activa" && !suspendida ? precioUsd(s.plan, s.usuariosAdicionales, s.periodo) / (s.periodo === "anual" ? 12 : 1) : 0;
        mrr += mensual;
        const pagado = r2(e.pagos.reduce((a, p) => a + p.ars, 0));
        const cuadra =
          fila.estado === s.estado &&
          fila.plan === s.plan &&
          Math.abs(fila.mensualUsd - r2(mensual)) < 0.011 &&
          Math.abs(fila.pagadoTotal - pagado) < 0.011 &&
          fila.pagos === e.pagos.length &&
          fila.usuariosActivos === s.usos.usuarios &&
          fila.limiteUsuarios === s.limites.usuarios &&
          fila.comprobantes === e.comprobantes &&
          Math.abs(fila.facturadoMes - (e.ventasPorMes.get(mes()) ?? 0)) < 0.011;
        if (!cuadra) problemas.push(`panel ${hoyAr()} ${e.nombre}: ${JSON.stringify({ fila, s: { estado: s.estado, plan: s.plan, usos: s.usos }, pagado, pagos: e.pagos.length, comprobantes: e.comprobantes })}`);
      }
      expect(res.empresas).toBe(3);
      if (res.suspendidas !== suspendidas) problemas.push(`panel ${hoyAr()}: ${res.suspendidas} suspendidas, esperado ${suspendidas}`);
      const pagando = Object.values(res.porPlan as Record<string, number>).reduce((a, b) => a + b, 0);
      if (pagando !== porEstado.Activa) problemas.push(`panel ${hoyAr()}: ${pagando} pagando por plan y ${porEstado.Activa} activas`);
      if (Math.abs(res.mrrUsd - r2(mrr)) > 0.011) problemas.push(`panel ${hoyAr()}: MRR ${res.mrrUsd}, esperado ${r2(mrr)}`);
      if (JSON.stringify(res.porEstado) !== JSON.stringify(porEstado)) problemas.push(`panel ${hoyAr()}: estados ${JSON.stringify(res.porEstado)}, esperado ${JSON.stringify(porEstado)}`);
    };

    // ---------------------------------------------------------------- los seis meses
    const eventos: string[] = [];
    let kioscoSeOlvida = false;
    let kioscoPagoTarde = false;
    let pagoPorTransferencia = false;
    let estudioBajaProgramada = false;

    for (let d = 0; d <= DIAS; d++) {
      irAlDia(d);
      const hoy = hoyAr();
      const diaSemana = new Date(`${hoy}T12:00:00Z`).getUTCDay();

      // Primer día del mes: controles del mes que terminó
      if (d > 0 && hoy.endsWith("-01")) await controlarMes(sumarDias(hoy, -1).slice(0, 7));
      if (d % 15 === 7) await controlarPanelHoy();

      // --- Suscripciones
      // Antes de terminar la prueba, cada una paga (los días de prueba no se pierden)
      if (d === 11) await pagarPeriodo(kiosco, "mensual");
      if (d === 12) await pagarPeriodo(estudio, "mensual");
      if (d === 13) {
        const p = await pagarPeriodo(distri, "anual");
        expect(p.desde).toBe(sumarDias(hoyAr(), 2)); // la prueba termina pasado mañana y ahí arranca el año
        eventos.push(`${hoy} Distribuidora paga el año: ${p.desde} al ${p.hasta}`);
      }

      // Kiosco compra un usuario más a mitad de período
      if (d === 40) {
        const s = await suscripcion(kiosco);
        const dias = Math.round((Date.parse(s.pagoHasta) - Date.parse(hoy)) / DIA) + 1;
        await cambiarPagando(kiosco, "basico", 1, r2((12 * dias) / 30));
        await llenarUsuarios(kiosco, 3);
        eventos.push(`${hoy} Kiosco compra 1 usuario por ${dias} días`);
      }
      // Distribuidora compra 2 usuarios más: pagando anual, cada mes sale 10/12
      if (d === 45) {
        const s = await suscripcion(distri);
        const dias = Math.round((Date.parse(s.pagoHasta) - Date.parse(hoy)) / DIA) + 1;
        await cambiarPagando(distri, "empresa", 2, r2(((24 * 10) / 12) * (dias / 30)));
        await llenarUsuarios(distri, 12);
        eventos.push(`${hoy} Distribuidora compra 2 usuarios por ${dias} días`);
      }
      // Estudio crece y sube a Empresa
      if (d === 60) {
        const s = await suscripcion(estudio);
        const dias = Math.round((Date.parse(s.pagoHasta) - Date.parse(hoy)) / DIA) + 1;
        await cambiarPagando(estudio, "empresa", 0, r2((65 * dias) / 30));
        await llenarUsuarios(estudio, 10);
        eventos.push(`${hoy} Estudio sube a Empresa por ${dias} días`);
      }
      // El administrador le regala 3 días al Estudio por un corte
      if (d === 70) {
        const antes = await suscripcion(estudio);
        const r = await pedido(panel(), "POST", `/plataforma/empresas/${estudio.id}/extender`, { dias: 3, nota: "Compensación por corte del servicio" });
        expect(r.status).toBe(200);
        expect((await suscripcion(estudio)).pagoHasta).toBe(sumarDias(antes.pagoHasta, 3));
        eventos.push(`${hoy} Panel: +3 días al Estudio`);
      }
      // Estudio quiere volver a Profesional: primero tiene que quedar en 5 usuarios
      if (d === 100) {
        const r = await como(estudio).put("/suscripcion", { plan: "profesional", usuariosAdicionales: 0 });
        expect(r.status).toBe(400);
        expect(r.body.error).toContain("Tenés 10 usuarios activos");
        for (const u of estudio.usuarios.filter((x) => x.estado === "Activo" && x.id !== estudio.adminId && x.id !== estudio.cajero).slice(0, 5)) {
          expect((await como(estudio).patch(`/usuarios/${u.id}`, { estado: "Suspendido" })).status).toBe(200);
          u.estado = "Suspendido";
        }
        const ok = await como(estudio).put("/suscripcion", { plan: "profesional", usuariosAdicionales: 0 });
        expect(ok.body).toMatchObject({ aplicado: "proximo", plan: "empresa", planProximo: "profesional" });
        // Hasta la renovación sigue con Empresa (lo pagó)
        expect((await suscripcion(estudio)).limites.usuarios).toBe(10);
        estudioBajaProgramada = true;
        eventos.push(`${hoy} Estudio programa la bajada a Profesional desde ${ok.body.desde}`);
      }
      // El panel suspende al Estudio un día y lo reactiva
      if (d === 130) {
        expect((await pedido(panel(), "POST", `/plataforma/empresas/${estudio.id}/suspender`, { motivo: "Verificación de identidad" })).status).toBe(200);
        const r = await como(estudio).get("/clientes");
        expect(r.status).toBe(403);
        expect(r.body.code).toBe("EMPRESA_SUSPENDIDA");
        const l = await app.inject({ method: "POST", url: "/api/auth/login", payload: { email: estudio.adminEmail, password: "clave-segura-123" } });
        expect(l.statusCode).not.toBe(200);
        await controlarPanelHoy(); // suspendida: no suma al MRR
      }
      if (d === 131) {
        expect((await pedido(panel(), "POST", `/plataforma/empresas/${estudio.id}/reactivar`, {})).status).toBe(200);
        expect((await como(estudio).get("/clientes")).status).toBe(200);
      }

      // Renovaciones mensuales: pagan cuando faltan 2 días
      for (const e of [kiosco, estudio]) {
        const s = await suscripcion(e);
        if (s.estado !== "Activa" || s.diasRestantes !== 2) continue;
        if (e === kiosco && d > 95 && !kioscoSeOlvida) {
          kioscoSeOlvida = true; // esta vez no paga
          eventos.push(`${hoy} Kiosco se olvida de renovar (vence el ${s.vence})`);
          continue;
        }
        if (e === kiosco && d > 150 && !pagoPorTransferencia) {
          // Esta vez paga por transferencia y lo registra el administrador
          pagoPorTransferencia = true;
          const ars = r2(precioUsd(s.plan, s.usuariosAdicionales, "mensual") * dolarDelDia());
          const r = await pedido(panel(), "POST", `/plataforma/empresas/${kiosco.id}/pago-manual`, { periodo: "mensual", importeArs: ars, nota: "Transferencia Banco Nación" });
          expect(r.status).toBe(201);
          expect(r.body.desde).toBe(sumarDias(s.vence, 1));
          kiosco.pagos.push({ referencia: r.body.referencia, tipo: "manual", ars, mes: mes() });
          eventos.push(`${hoy} Panel registra la transferencia del Kiosco: ${r.body.desde} al ${r.body.hasta}`);
          continue;
        }
        const antes = s.planProximo;
        const p = await pagarPeriodo(e, "mensual");
        if (e === estudio && antes === "profesional") {
          expect(await suscripcion(estudio)).toMatchObject({ plan: "profesional", limites: { usuarios: 5 } });
          const extra = await nuevoUsuario(estudio);
          expect(extra.body.code).toBe("LIMITE_PLAN");
          eventos.push(`${hoy} Estudio renueva y ya es Profesional (${p.desde} al ${p.hasta})`);
        }
      }

      // Kiosco atrasado: gracia (puede trabajar), después solo lectura (ve todo, no carga), y paga
      if (kioscoSeOlvida && !kioscoPagoTarde) {
        const s = await suscripcion(kiosco);
        if (s.estado === "SoloLectura") {
          const r = await facturar(kiosco);
          expect(r.r.status).toBe(402);
          expect(r.r.body.code).toBe("SUSCRIPCION_VENCIDA");
          expect((await como(kiosco).get("/comprobantes")).status).toBe(200);
          expect((await como(kiosco).get(`/reportes/ventas?desde=${hoy.slice(0, 7)}-01&hasta=${hoy}`)).status).toBe(200);
          if (sumarDias(s.graciaHasta, 3) === hoy) {
            const p = await pagarPeriodo(kiosco, "mensual");
            expect(p.desde).toBe(hoy); // lo vencido no se cobra: arranca hoy
            kioscoPagoTarde = true;
            eventos.push(`${hoy} Kiosco paga atrasado: ${p.desde} al ${p.hasta}`);
          }
        }
      }

      // --- Sueldos (también los domingos: se paga el último día del mes)
      const sumarPagado = (e: Empresa, periodo: string, importe: number) => e.sueldosPorMes.set(periodo, r2((e.sueldosPorMes.get(periodo) ?? 0) + importe));
      const pagarSueldo = async (e: Empresa, empleadoId: string, periodo: string) => {
        const emp = e.empleados.find((x) => x.id === empleadoId)!;
        const extra = z.entero(0, 3) * 10000;
        const conceptos = [{ concepto: "Sueldo básico", importe: emp.sueldo }, ...(extra ? [{ concepto: "Horas extra", importe: extra }] : [])];
        const r = await como(e).post(`/empleados/${empleadoId}/pagos`, { tipo: "Sueldo", periodo, conceptos, medio: "Transferencia" });
        if (r.status === 402 || r.status === 403) return false; // vencida o suspendida: queda pendiente
        expect(r.status, JSON.stringify(r.body)).toBe(201);
        const esperado = r2(emp.sueldo + extra - (e.adelantos.get(`${empleadoId}|${periodo}`) ?? 0));
        if (Math.abs(r.body.total - esperado) > 0.011) problemas.push(`${e.nombre} ${periodo}: sueldo ${r.body.total}, esperado ${esperado}`);
        sumarPagado(e, periodo, r.body.total);
        return true;
      };
      for (const e of todas) {
        for (const p of [...e.sueldosPendientes]) {
          if (await pagarSueldo(e, p.empleadoId, p.periodo)) {
            e.sueldosPendientes.splice(e.sueldosPendientes.indexOf(p), 1);
            eventos.push(`${hoy} ${e.nombre} paga un sueldo atrasado de ${p.periodo}`);
          }
        }
        if (hoy.endsWith("-10")) {
          for (const emp of e.empleados) {
            if (z.r() < 0.5) continue;
            const importe = Math.round(emp.sueldo * z.uno([0.1, 0.2, 0.3]));
            const r = await como(e).post(`/empleados/${emp.id}/pagos`, { tipo: "Adelanto", periodo: mes(), conceptos: [{ concepto: "Adelanto", importe }], medio: "Efectivo" });
            if (r.status === 402 || r.status === 403) continue;
            expect(r.status, JSON.stringify(r.body)).toBe(201);
            e.adelantos.set(`${emp.id}|${mes()}`, (e.adelantos.get(`${emp.id}|${mes()}`) ?? 0) + importe);
            sumarPagado(e, mes(), importe);
          }
        }
        if (sumarDias(hoy, 1).endsWith("-01")) {
          if (hoy.slice(5, 7) === "06") {
            for (const emp of e.empleados) {
              const r = await como(e).post(`/empleados/${emp.id}/pagos`, { tipo: "Aguinaldo", periodo: mes(), conceptos: [{ concepto: "Aguinaldo (SAC)", importe: emp.sueldo / 2 }], medio: "Transferencia" });
              if (r.status === 201) sumarPagado(e, mes(), r.body.total);
            }
          }
          for (const emp of e.empleados) {
            if (!(await pagarSueldo(e, emp.id, mes()))) e.sueldosPendientes.push({ empleadoId: emp.id, periodo: mes() });
          }
        }
      }
      // La distribuidora aumenta 10 % su catálogo
      if (d === 90) {
        const r = await como(distri).post("/productos/actualizar-precios", { porcentaje: 10 });
        expect(r.body).toMatchObject({ cambian: 1, aplicado: true });
        distri.producto.precio = r2(distri.producto.precio * 1.1);
        expect((await como(distri).get(`/productos/${distri.producto.id}`)).body.precio).toBe(distri.producto.precio);
        eventos.push(`${hoy} Distribuidora aumenta 10 % los precios`);
      }

      // --- Trabajo del día (lunes a sábado)
      if (diaSemana === 0) continue;
      for (const e of todas) {
        const s = await suscripcion(e);
        if (s.estado === "SoloLectura") continue;
        if (e === estudio && d === 130) continue; // suspendida
        const n = z.entero(0, e === distri ? 4 : 2);
        for (let i = 0; i < n; i++) {
          const { r, cc, conProducto } = await facturar(e);
          await registrarVenta(e, r, cc, conProducto);
        }
        if (z.r() < 0.5) await cobrar(e);
      }
    }

    // ---------------------------------------------------------------- cierre
    await controlarPanelHoy();
    expect(kioscoSeOlvida && kioscoPagoTarde && pagoPorTransferencia && estudioBajaProgramada).toBe(true);

    // Numeración de cada empresa sin huecos ni repetidos
    for (const e of todas) {
      const comps = (await como(e).get("/comprobantes")).body as { tipoCbte: number; puntoVenta: number; numero: number }[];
      expect(comps.length).toBe(e.comprobantes);
      const series = new Map<string, number[]>();
      for (const c of comps) series.set(`${c.tipoCbte}-${c.puntoVenta}`, [...(series.get(`${c.tipoCbte}-${c.puntoVenta}`) ?? []), c.numero]);
      for (const [serie, nums] of series) {
        nums.sort((a, b) => a - b);
        if (!nums.every((n, i) => n === i + 1)) problemas.push(`${e.nombre}: la serie ${serie} tiene huecos o repetidos`);
      }
    }

    // Los períodos de cada empresa, uno detrás del otro (salvo el atraso del Kiosco)
    for (const e of todas) {
      const pagos = ((await suscripcion(e)).pagos as { tipo: string; estado: string; desde: string; hasta: string }[]).filter((p) => p.estado === "Aprobado" && p.tipo !== "cambio").reverse();
      for (let i = 1; i < pagos.length; i++) {
        const contiguo = pagos[i]!.desde === sumarDias(pagos[i - 1]!.hasta, 1) || pagos[i]!.desde === sumarDias(pagos[i - 1]!.hasta, 4); // +3 días de compensación
        const atraso = e === kiosco && pagos[i]!.desde > sumarDias(pagos[i - 1]!.hasta, 1);
        if (!contiguo && !atraso) problemas.push(`${e.nombre}: el período ${pagos[i]!.desde} no sigue al ${pagos[i - 1]!.hasta}`);
      }
    }

    // La auditoría del panel tiene cada acción, con quién la hizo
    const auditoria = (await pedido(panel(), "GET", "/plataforma/auditoria")).body as { accion: string; adminEmail: string; empresaId: string }[];
    for (const [accion, empresa] of [
      ["extender", estudio],
      ["suspender", estudio],
      ["reactivar", estudio],
      ["pago-manual", kiosco],
    ] as const) {
      expect(auditoria.some((a) => a.accion === accion && a.empresaId === empresa.id && a.adminEmail === ADMIN.email), accion).toBe(true);
    }
    // El detalle de cada empresa en el panel: pagos y actividad de los meses
    for (const e of todas) {
      const det = (await pedido(panel(), "GET", `/plataforma/empresas/${e.id}`)).body;
      expect(det.pagadoTotal).toBeCloseTo(r2(e.pagos.reduce((a, p) => a + p.ars, 0)), 2);
      for (const m of det.uso.actividad as { clave: string; facturado: number }[]) {
        const esperado = e.ventasPorMes.get(m.clave) ?? 0;
        if (Math.abs(m.facturado - esperado) > 0.011) problemas.push(`${e.nombre} ${m.clave}: el panel dice que facturó ${m.facturado}, el libro ${esperado}`);
      }
    }

    console.log(
      [
        "",
        "=== 6 meses, 3 empresas ===",
        ...eventos,
        ...todas.map((e) => `${e.nombre}: ${e.comprobantes} comprobantes, ${e.pagos.length} pagos por $ ${r2(e.pagos.reduce((a, p) => a + p.ars, 0)).toLocaleString("es-AR")}, sueldos pagados $ ${r2([...e.sueldosPorMes.values()].reduce((a, b) => a + b, 0)).toLocaleString("es-AR")}`),
        problemas.length ? `PROBLEMAS:\n${problemas.join("\n")}` : "Sin inconsistencias",
      ].join("\n"),
    );
    expect(problemas).toEqual([]);
  }, 600_000);
});
