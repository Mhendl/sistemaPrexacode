/**
 * Carga dos empresas de demostración con ~5 meses de historia, para mostrar Prexacode.
 *
 *   demo1@prexacode.com.ar / Demo12345 — Ferretería El Tornillo S.R.L. (Responsable Inscripto: facturas A y B)
 *     comercio con mostrador, cuenta corriente a constructoras, stock con reposiciones, cajera con rol a medida
 *   demo2@prexacode.com.ar / Demo12345 — ServiTec Climatización (Monotributista: facturas C)
 *     servicio técnico con agenda de visitas por técnico, presupuestos de instalación y técnicos por hora
 *
 * Se genera usando la aplicación de verdad (las mismas reglas que en producción), adelantando el reloj día por día.
 * Uso (con el servidor de desarrollo apagado):  npx tsx scripts/demos.ts
 * Si una demo ya existe, no la toca.
 */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { config } from "../src/config.js";
import { openDatabase } from "../src/db/client.js";
import { usuarios } from "../src/db/schema.js";

// ---------------------------------------------------------------- reloj: se puede adelantar
const RealDate = Date;
let corrimiento = 0;
class RelojDemo extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(RealDate.now() + corrimiento);
    else super(...(args as [string]));
  }
  static now() {
    return RealDate.now() + corrimiento;
  }
}
globalThis.Date = RelojDemo as DateConstructor;
const DIA = 86_400_000;
const hoyAr = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const sumarDias = (f: string, n: number) => new RealDate(RealDate.parse(`${f}T12:00:00Z`) + n * DIA).toISOString().slice(0, 10);

// ---------------------------------------------------------------- azar con semilla
let semilla = 20260928;
const r = () => {
  semilla = (semilla + 0x6d2b79f5) >>> 0;
  let t = semilla;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const entero = (a: number, b: number) => a + Math.floor(r() * (b - a + 1));
const uno = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]!;
const r2 = (n: number) => Math.round(n * 100) / 100;

let secuenciaCuit = 40000000 + Math.floor(Math.random() * 1e6);
function cuit(prefijo: "20" | "27" | "30" | "33" = "30") {
  for (;;) {
    const base = `${prefijo}${String(secuenciaCuit++).padStart(8, "0")}`;
    const suma = [...base].reduce((a, d, i) => a + Number(d) * [5, 4, 3, 2, 7, 6, 5, 4, 3, 2][i]!, 0);
    const dv = 11 - (suma % 11);
    if (dv === 10) continue;
    return `${base}${dv === 11 ? 0 : dv}`;
  }
}

const DIAS_DE_HISTORIA = 150;
const PASSWORD = "Demo12345";

const { db, close } = await openDatabase(config.databaseUrl);
const app = await buildApp({ db, jwtSecret: config.jwtSecret, cotizacion: async () => 1500, limitarIntentos: false, modoPruebas: true });

type Resp = { status: number; body: any };
async function pedido(token: string, method: string, url: string, payload?: unknown): Promise<Resp> {
  const res = await app.inject({ method: method as "GET", url: `/api${url}`, headers: { authorization: `Bearer ${token}` }, ...(payload !== undefined ? { payload: payload as object } : {}) });
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}
async function ok(token: string, method: string, url: string, payload?: unknown) {
  const res = await pedido(token, method, url, payload);
  if (res.status >= 300) throw new Error(`${method} ${url}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}
/** Sesión del día de un usuario (como si hubiera entrado) */
async function sesion(userId: string, empresaId: string) {
  const [u] = await db.select().from(usuarios).where(eq(usuarios.id, userId));
  let sid = u!.sesionId;
  if (!sid) {
    sid = randomUUID();
    await db.update(usuarios).set({ sesionId: sid }).where(eq(usuarios.id, userId));
  }
  return app.jwt.sign({ sub: userId, empresaId, rol: u!.rol as "admin", sid });
}

async function existe(email: string) {
  const [u] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email));
  return !!u;
}

async function registrar(razonSocial: string, condicionIva: string, nombre: string, email: string) {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/registro",
    payload: { empresa: { razonSocial, cuit: cuit("30"), condicionIva }, usuario: { nombre, email, password: PASSWORD }, aceptaTerminos: true },
  });
  if (res.statusCode !== 201) throw new Error(`registro: ${res.body}`);
  const b = res.json();
  return { empresaId: b.empresa.id as string, adminId: b.usuario.id as string };
}

async function usuario(admin: string, nombre: string, email: string, rol: { rol?: string; rolId?: string }) {
  return (await ok(admin, "POST", "/usuarios", { nombre, email, password: PASSWORD, ...rol })).id as string;
}

// ================================================================ DEMO 1: ferretería
async function demo1() {
  const email = "demo1@prexacode.com.ar";
  if (await existe(email)) return console.log("demo1 ya existe: no se toca");
  corrimiento = -DIAS_DE_HISTORIA * DIA;
  const { empresaId, adminId } = await registrar("Ferretería El Tornillo S.R.L.", "Responsable Inscripto", "Roberto Tornillo", email);
  let admin = await sesion(adminId, empresaId);
  await ok(admin, "PUT", "/empresa", {
    razonSocial: "Ferretería El Tornillo S.R.L.",
    nombreFantasia: "El Tornillo",
    condicionIva: "Responsable Inscripto",
    ingresosBrutos: "902-114455-1",
    inicioActividades: "2009-08-01",
    domicilio: "Av. San Martín 2450",
    localidad: "San Martín, Buenos Aires",
    telefono: "11 4752-1180",
    email: "ventas@eltornillo.com.ar",
  });
  const cajero = (await ok(admin, "POST", "/roles", { nombre: "Cajero", descripcion: "Cobra en el mostrador", permisos: ["cobranzas.cobrar"] })).id;
  const vendedor = await usuario(admin, "Diego Fernández", "demo1.ventas@prexacode.com.ar", { rol: "ventas" });
  const caja = await usuario(admin, "Carla Suárez", "demo1.caja@prexacode.com.ar", { rolId: cajero });
  const deposito = await usuario(admin, "Oscar Medina", "demo1.deposito@prexacode.com.ar", { rol: "operaciones" });

  const productos: { id: string; precio: number; minimo: number }[] = [];
  const catalogo: [string, string, string, number, number, number, number][] = [
    ["HER-TAL", "Taladro percutor 13 mm 750 W", "Herramientas", 89900, 21, 12, 3],
    ["HER-AMO", "Amoladora angular 115 mm", "Herramientas", 64500, 21, 10, 3],
    ["HER-DES", "Juego de destornilladores x 8", "Herramientas", 18900, 21, 25, 5],
    ["HER-MAR", "Martillo carpintero 27 mm", "Herramientas", 12400, 21, 20, 5],
    ["HER-CIN", "Cinta métrica 5 m", "Herramientas", 6900, 21, 40, 10],
    ["TOR-TAR", "Tarugos Fischer 8 mm x 100", "Tornillería", 4900, 21, 80, 20],
    ["TOR-AUT", "Tornillos autoperforantes x 100", "Tornillería", 7800, 21, 70, 20],
    ["TOR-BUL", "Bulones 1/4 x 2 x 50", "Tornillería", 9600, 21, 40, 10],
    ["PIN-LAT", "Látex interior 20 L", "Pinturería", 98500, 21, 18, 5],
    ["PIN-ESM", "Esmalte sintético 4 L", "Pinturería", 45900, 21, 15, 5],
    ["PIN-RODI", "Rodillo antigota 22 cm", "Pinturería", 8900, 21, 30, 8],
    ["PIN-PIN", "Pincel N° 20", "Pinturería", 3900, 21, 45, 10],
    ["ELE-CAB", "Cable unipolar 2,5 mm x 100 m", "Electricidad", 69900, 21, 14, 4],
    ["ELE-LLA", "Llave térmica bipolar 20 A", "Electricidad", 22400, 21, 20, 5],
    ["ELE-LAM", "Lámpara LED 12 W", "Electricidad", 2900, 21, 120, 30],
    ["ELE-TOM", "Toma corriente doble", "Electricidad", 4600, 21, 60, 15],
    ["SER-COR", "Corte de chapa a medida", "Servicios", 3500, 21, 0, 0],
    ["SER-ENV", "Envío a obra", "Servicios", 12000, 21, 0, 0],
  ];
  for (const [codigo, descripcion, categoria, precio, alicuotaIva, stockInicial, stockMinimo] of catalogo) {
    const p = await ok(admin, "POST", "/productos", { codigo, descripcion, categoria, precio, alicuotaIva, controlaStock: categoria !== "Servicios", stockInicial, stockMinimo });
    productos.push({ id: p.id, precio, minimo: stockMinimo });
  }

  const clientes: { id: string; cc: boolean }[] = [];
  const cartera: [string, string, string, boolean][] = [
    ["Constructora Del Plata S.A.", "30", "Responsable Inscripto", true],
    ["Obras y Techos S.R.L.", "30", "Responsable Inscripto", true],
    ["Consorcio Av. Mitre 1450", "30", "Exento", true],
    ["Juan Pérez (plomero)", "20", "Monotributista", true],
    ["Electricidad Gómez", "20", "Monotributista", true],
    ["Pinturas Rivas", "27", "Monotributista", true],
    ["Colegio San José", "30", "Exento", true],
    ["María López", "27", "Consumidor Final", false],
    ["Carlos Benítez", "20", "Consumidor Final", false],
    ["Ana Torres", "27", "Consumidor Final", false],
    ["Luis Romero", "20", "Consumidor Final", false],
    ["Sofía Acosta", "27", "Consumidor Final", false],
    ["Martín Ruiz", "20", "Consumidor Final", false],
    ["Laura Castro", "27", "Consumidor Final", false],
  ];
  for (const [razonSocial, prefijo, condicionIva, cc] of cartera) {
    const c = await ok(admin, "POST", "/clientes", { razonSocial, cuit: cuit(prefijo as "20"), condicionIva, localidad: uno(["San Martín", "Villa Ballester", "Caseros", "Munro"]), telefono: `11 ${entero(4000, 6999)}-${entero(1000, 9999)}` });
    clientes.push({ id: c.id, cc });
  }
  await ok(admin, "POST", `/clientes/${clientes[0]!.id}/notas`, { texto: "Paga a 30 días por transferencia. Pedir orden de compra antes de entregar.", fijada: true });
  await ok(admin, "POST", `/clientes/${clientes[3]!.id}/notas`, { texto: "Cliente de años. Le guardamos los tarugos de 8 mm." });

  const empleados = [
    (await ok(admin, "POST", "/empleados", { nombre: "Carla", apellido: "Suárez", puesto: "Cajera", fechaIngreso: "2021-03-01", sueldo: 780000, cuil: cuit("27") })).id as string,
    (await ok(admin, "POST", "/empleados", { nombre: "Oscar", apellido: "Medina", puesto: "Depósito", fechaIngreso: "2016-07-15", sueldo: 850000 })).id as string,
    (await ok(admin, "POST", "/empleados", { nombre: "Diego", apellido: "Fernández", puesto: "Vendedor", fechaIngreso: "2023-02-01", sueldo: 820000 })).id as string,
  ];
  const sueldos = [780000, 850000, 820000];

  const pendientes: { id: string; clienteId: string; saldo: number }[] = [];
  for (let d = 0; d < DIAS_DE_HISTORIA; d++) {
    corrimiento = -(DIAS_DE_HISTORIA - d) * DIA;
    const hoy = hoyAr();
    const diaSemana = new RealDate(`${hoy}T12:00:00Z`).getUTCDay();
    admin = await sesion(adminId, empresaId);
    if (d === 10) {
      const pago = await ok(admin, "POST", "/suscripcion/pagar", { periodo: "anual" });
      await ok(admin, "POST", `/suscripcion/pagos/${pago.referencia}/simular`, { resultado: "Aprobado" });
    }
    // Sueldos: adelantos el 10, sueldo el último día del mes
    const mes = hoy.slice(0, 7);
    if (hoy.endsWith("-10") && r() < 0.6) {
      await ok(admin, "POST", `/empleados/${uno(empleados)}/pagos`, { tipo: "Adelanto", periodo: mes, conceptos: [{ concepto: "Adelanto de sueldo", importe: 150000 }], medio: "Efectivo" });
    }
    if (sumarDias(hoy, 1).endsWith("-01")) {
      for (let i = 0; i < empleados.length; i++) {
        const extra = entero(0, 3) * 12000;
        await ok(admin, "POST", `/empleados/${empleados[i]}/pagos`, {
          tipo: "Sueldo",
          periodo: mes,
          conceptos: [{ concepto: "Sueldo básico", importe: sueldos[i]! }, { concepto: "Presentismo", importe: Math.round(sueldos[i]! * 0.08) }, ...(extra ? [{ concepto: "Horas extra", importe: extra }] : [])],
          medio: "Transferencia",
        });
      }
    }
    if (diaSemana === 0) continue;
    const vend = await sesion(vendedor, empresaId);
    const cajeraT = await sesion(caja, empresaId);
    const depo = await sesion(deposito, empresaId);

    // Ventas del día
    for (let i = 0; i < entero(2, 6); i++) {
      const cliente = r() < 0.55 ? uno(clientes.filter((c) => !c.cc)) : uno(clientes.filter((c) => c.cc));
      const items = Array.from({ length: entero(1, 4) }, () => ({ productoId: uno(productos).id, cantidad: entero(1, 5) }));
      const unicos = [...new Map(items.map((x) => [x.productoId, x])).values()];
      const cc = cliente.cc && r() < 0.8;
      const res = await pedido(uno([vend, admin]), "POST", "/comprobantes", { clienteId: cliente.id, condicionVenta: cc ? "Cuenta corriente" : "Contado", ...(cc ? {} : { cobro: { medio: uno(["Efectivo", "Tarjeta de débito", "Mercado Pago", "Transferencia"]) } }), items: unicos });
      if (res.status === 201 && cc) pendientes.push({ id: res.body.id, clienteId: cliente.id, saldo: res.body.total });
    }
    // La cajera cobra cuentas corrientes
    for (const p of pendientes.filter((x) => x.saldo > 0 && r() < 0.18)) {
      const importe = r() < 0.7 ? p.saldo : r2(p.saldo / 2);
      const res = await pedido(cajeraT, "POST", "/recibos", { clienteId: p.clienteId, medios: [{ medio: uno(["Transferencia", "Cheque", "Efectivo"]), importe }], imputaciones: [{ comprobanteId: p.id, importe }] });
      if (res.status === 201) p.saldo = r2(p.saldo - importe);
    }
    // Depósito repone lo que baja del mínimo (menos en las últimas semanas, así queda algo para reponer)
    if (d < DIAS_DE_HISTORIA - 14) {
      const lista = (await ok(depo, "GET", "/productos")) as { id: string; stock: number; stockMinimo: number; controlaStock: boolean }[];
      for (const p of lista.filter((x) => x.controlaStock && x.stock <= x.stockMinimo)) {
        await ok(depo, "POST", `/productos/${p.id}/movimientos`, { tipo: "ingreso", cantidad: p.stockMinimo * 3 + 10, motivo: "Compra a proveedor" });
      }
    }
    // Entregas a obra con remito
    if (r() < 0.25) {
      const obra = uno(clientes.filter((c) => c.cc));
      await pedido(depo, "POST", "/remitos", { clienteId: obra.id, items: [{ productoId: uno(productos.slice(0, 16)).id, cantidad: entero(1, 3) }] });
    }
    // Presupuestos
    if (r() < 0.3) {
      const cliente = uno(clientes.filter((c) => c.cc));
      const pres = await ok(vend, "POST", "/presupuestos", { clienteId: cliente.id, condiciones: "Precios válidos por 15 días", items: [{ productoId: uno(productos).id, cantidad: entero(2, 10) }, { productoId: uno(productos).id, cantidad: entero(1, 4) }].filter((x, i, a) => a.findIndex((y) => y.productoId === x.productoId) === i) });
      if (d < DIAS_DE_HISTORIA - 10 && r() < 0.5) {
        await ok(vend, "POST", `/presupuestos/${pres.id}/estado`, { estado: "Aceptado" });
        const detalle = await ok(vend, "GET", `/presupuestos/${pres.id}`);
        await pedido(vend, "POST", "/comprobantes", { clienteId: cliente.id, presupuestoId: pres.id, condicionVenta: "Cuenta corriente", items: detalle.items.map((i: { productoId: string; cantidad: number }) => ({ productoId: i.productoId, cantidad: i.cantidad })) });
      }
    }
  }
  corrimiento = 0;
  const hoy = hoyAr();
  admin = await sesion(adminId, empresaId);
  const vend = await sesion(vendedor, empresaId);
  // Embudo de ventas y agenda de la semana
  for (const [titulo, cliente, monto, etapa] of [
    ["Materiales para edificio Mitre", 2, 4800000, "Negociación"],
    ["Pintura completa del colegio", 6, 2350000, "Propuesta"],
    ["Instalación eléctrica obra nueva", 1, 1650000, "Contactado"],
    ["Reposición mensual plomería", 3, 420000, "Nuevo"],
  ] as const) {
    const o = await ok(vend, "POST", "/oportunidades", { titulo, clienteId: clientes[cliente]!.id, monto, cierreEstimado: sumarDias(hoy, entero(10, 40)) });
    if (etapa !== "Nuevo") await ok(vend, "POST", `/oportunidades/${o.id}/etapa`, { etapa });
  }
  const config = await ok(admin, "GET", "/agenda/config");
  for (let i = 0; i < 6; i++) {
    await pedido(admin, "POST", "/agenda/eventos", {
      titulo: uno(["Entrega en obra", "Retiro de pedido", "Visita a cliente"]),
      recursoId: uno(config.recursos as { id: string }[]).id,
      clienteId: uno(clientes.filter((c) => c.cc)).id,
      fecha: sumarDias(hoy, entero(0, 6)),
      inicio: `${String(entero(8, 16)).padStart(2, "0")}:00`,
      fin: `${String(entero(17, 18)).padStart(2, "0")}:00`,
      permitirSuperposicion: true,
    });
  }
  console.log("demo1 lista: Ferretería El Tornillo (demo1@prexacode.com.ar / Demo12345)");
}

// ================================================================ DEMO 2: servicio técnico
async function demo2() {
  const email = "demo2@prexacode.com.ar";
  if (await existe(email)) return console.log("demo2 ya existe: no se toca");
  semilla = 777;
  corrimiento = -DIAS_DE_HISTORIA * DIA;
  const { empresaId, adminId } = await registrar("ServiTec Climatización", "Monotributista", "Natalia Frío", email);
  let admin = await sesion(adminId, empresaId);
  await ok(admin, "PUT", "/empresa", { razonSocial: "ServiTec Climatización", nombreFantasia: "ServiTec", condicionIva: "Monotributista", inicioActividades: "2018-03-01", domicilio: "Calle 12 N° 845", localidad: "La Plata", telefono: "221 455-7788", email: "turnos@servitec.com.ar" });
  // Agenda a la medida del rubro
  const conf0 = await ok(admin, "GET", "/agenda/config");
  await ok(admin, "PUT", "/agenda/config", { nombreEvento: "Visita técnica", nombreRecurso: "Técnico", horaInicio: "08:00", horaFin: "19:00", tiposEvento: ["Instalación", "Service", "Reparación", "Presupuesto en domicilio"], version: conf0.version });
  const tecnico = (await ok(admin, "POST", "/roles", { nombre: "Técnico", descripcion: "Ve su agenda, los clientes y carga remitos de materiales", permisos: ["agenda.editar", "clientes.ver", "remitos.emitir"] })).id;
  const t1 = await usuario(admin, "Pablo Giménez", "demo2.tecnico1@prexacode.com.ar", { rolId: tecnico });
  const t2 = await usuario(admin, "Lucas Herrera", "demo2.tecnico2@prexacode.com.ar", { rolId: tecnico });
  const adm = await usuario(admin, "Valeria Sosa", "demo2.admin@prexacode.com.ar", { rol: "ventas" });

  const servicios: { id: string; precio: number }[] = [];
  for (const [codigo, descripcion, precio, stock] of [
    ["INS-3000", "Instalación split hasta 3000 frigorías", 180000, 0],
    ["INS-6000", "Instalación split hasta 6000 frigorías", 260000, 0],
    ["SRV-ANUAL", "Service preventivo anual", 65000, 0],
    ["SRV-GAS", "Carga de gas R410A", 85000, 0],
    ["SRV-HORA", "Mano de obra (hora)", 38000, 0],
    ["SRV-VISITA", "Visita de diagnóstico", 25000, 0],
    ["REP-CAP", "Capacitor 35 µF", 14500, 30],
    ["REP-CANO", "Kit caños de cobre 3 m", 62000, 12],
    ["REP-SOP", "Soporte para unidad exterior", 28000, 15],
  ] as const) {
    const p = await ok(admin, "POST", "/productos", { codigo, descripcion, categoria: stock ? "Repuestos" : "Servicios", precio, alicuotaIva: 21, controlaStock: stock > 0, stockInicial: stock, stockMinimo: stock ? 5 : 0 });
    servicios.push({ id: p.id, precio });
  }
  const clientes: string[] = [];
  for (const [nombre, prefijo, iva] of [
    ["Consorcio Torre Diagonal 74", "30", "Exento"],
    ["Hotel del Bosque S.A.", "30", "Responsable Inscripto"],
    ["Farmacia Central", "30", "Responsable Inscripto"],
    ["Estudio Jurídico Paz", "20", "Monotributista"],
    ["Gabriela Núñez", "27", "Consumidor Final"],
    ["Ricardo Vega", "20", "Consumidor Final"],
    ["Patricia Molina", "27", "Consumidor Final"],
    ["Héctor Rojas", "20", "Consumidor Final"],
    ["Silvina Paredes", "27", "Consumidor Final"],
    ["Fernando Aguirre", "20", "Consumidor Final"],
    ["Mónica Cabrera", "27", "Consumidor Final"],
    ["Jorge Ledesma", "20", "Consumidor Final"],
  ] as const) {
    clientes.push((await ok(admin, "POST", "/clientes", { razonSocial: nombre, cuit: cuit(prefijo), condicionIva: iva, localidad: uno(["La Plata", "City Bell", "Gonnet", "Berisso"]), domicilio: `Calle ${entero(1, 72)} N° ${entero(100, 2500)}` })).id);
  }
  await ok(admin, "POST", `/clientes/${clientes[1]}/notas`, { texto: "Tiene 24 equipos. Service de todo el hotel en abril y octubre.", fijada: true });
  const empleados = [
    (await ok(admin, "POST", "/empleados", { nombre: "Pablo", apellido: "Giménez", puesto: "Técnico", fechaIngreso: "2019-05-02", modalidad: "Por hora", sueldo: 6500 })).id as string,
    (await ok(admin, "POST", "/empleados", { nombre: "Lucas", apellido: "Herrera", puesto: "Técnico", fechaIngreso: "2024-01-15", modalidad: "Por hora", sueldo: 5800 })).id as string,
  ];

  for (let d = 0; d < DIAS_DE_HISTORIA; d++) {
    corrimiento = -(DIAS_DE_HISTORIA - d) * DIA;
    const hoy = hoyAr();
    const diaSemana = new RealDate(`${hoy}T12:00:00Z`).getUTCDay();
    admin = await sesion(adminId, empresaId);
    if (d === 12) {
      const pago = await ok(admin, "POST", "/suscripcion/pagar", { periodo: "anual" });
      await ok(admin, "POST", `/suscripcion/pagos/${pago.referencia}/simular`, { resultado: "Aprobado" });
    }
    if (sumarDias(hoy, 1).endsWith("-01")) {
      for (const [i, e] of empleados.entries()) {
        const horas = entero(140, 185);
        await ok(admin, "POST", `/empleados/${e}/pagos`, { tipo: "Sueldo", periodo: hoy.slice(0, 7), conceptos: [{ concepto: `${horas} horas trabajadas`, importe: horas * [6500, 5800][i]! }, { concepto: "Viáticos", importe: 45000 }], medio: "Transferencia" });
      }
    }
    if (diaSemana === 0) continue;
    const administ = await sesion(adm, empresaId);
    const conf = await ok(admin, "GET", "/agenda/config");
    const recursos = (conf.recursos as { id: string; usuarioId: string | null }[]).filter((x) => x.usuarioId === t1 || x.usuarioId === t2);
    // Visitas del día: se agendan, se hacen y se facturan
    for (const recurso of recursos) {
      for (let v = 0; v < entero(1, 3); v++) {
        const tipo = uno(["Instalación", "Service", "Reparación", "Presupuesto en domicilio"]);
        const cliente = uno(clientes);
        const hora = 9 + v * 3;
        const ev = await pedido(administ, "POST", "/agenda/eventos", { titulo: `${tipo} ${uno(["split", "aire central", "equipo de ventana"])}`, tipo, recursoId: recurso.id, clienteId: cliente, fecha: hoy, inicio: `${String(hora).padStart(2, "0")}:00`, fin: `${String(hora + 2).padStart(2, "0")}:00` });
        if (ev.status !== 201) continue;
        await pedido(administ, "POST", `/agenda/eventos/${ev.body.id}/estado`, { estado: "Realizado" });
        if (tipo === "Presupuesto en domicilio") {
          const pres = await ok(administ, "POST", "/presupuestos", { clienteId: cliente, condiciones: "50 % al aceptar, saldo al terminar la instalación", items: [{ productoId: uno(servicios.slice(0, 2)).id, cantidad: entero(1, 3) }, { productoId: servicios[7]!.id, cantidad: entero(1, 3) }] });
          if (d < DIAS_DE_HISTORIA - 12 && r() < 0.55) {
            await ok(administ, "POST", `/presupuestos/${pres.id}/estado`, { estado: "Aceptado" });
            const detalle = await ok(administ, "GET", `/presupuestos/${pres.id}`);
            await pedido(administ, "POST", "/comprobantes", { clienteId: cliente, presupuestoId: pres.id, condicionVenta: "Contado", cobro: { medio: "Transferencia" }, items: detalle.items.map((i: { productoId: string; cantidad: number }) => ({ productoId: i.productoId, cantidad: i.cantidad })) });
          } else if (r() < 0.3) await pedido(administ, "POST", `/presupuestos/${pres.id}/estado`, { estado: "Rechazado" });
          continue;
        }
        const items = tipo === "Instalación" ? [{ productoId: uno(servicios.slice(0, 2)).id, cantidad: 1 }, { productoId: servicios[8]!.id, cantidad: 1 }] : tipo === "Service" ? [{ productoId: servicios[2]!.id, cantidad: entero(1, 2) }] : [{ productoId: servicios[4]!.id, cantidad: entero(1, 3) }, ...(r() < 0.4 ? [{ productoId: servicios[6]!.id, cantidad: 1 }] : []), ...(r() < 0.3 ? [{ productoId: servicios[3]!.id, cantidad: 1 }] : [])];
        await pedido(administ, "POST", "/comprobantes", { clienteId: cliente, condicionVenta: cliente === clientes[1] || cliente === clientes[0] ? "Cuenta corriente" : "Contado", ...(cliente === clientes[1] || cliente === clientes[0] ? {} : { cobro: { medio: uno(["Transferencia", "Efectivo", "Mercado Pago"]) } }), items });
      }
    }
    // Repuestos: reposición semanal
    if (diaSemana === 1) {
      for (const p of ((await ok(admin, "GET", "/productos")) as { id: string; stock: number; stockMinimo: number; controlaStock: boolean }[]).filter((x) => x.controlaStock && x.stock <= x.stockMinimo + 2)) {
        await ok(admin, "POST", `/productos/${p.id}/movimientos`, { tipo: "ingreso", cantidad: 20, motivo: "Compra a Frío Sur Distribuidora" });
      }
    }
    // El hotel paga su cuenta a fin de mes
    if (sumarDias(hoy, 1).endsWith("-01")) {
      for (const cliente of [clientes[0]!, clientes[1]!]) {
        const pend = (await ok(admin, "GET", `/cobranzas/pendientes?clienteId=${cliente}`)) as { id: string; saldo: number }[];
        const total = r2(pend.reduce((a, p) => a + p.saldo, 0));
        if (total > 0) await ok(admin, "POST", "/recibos", { clienteId: cliente, medios: [{ medio: "Transferencia", importe: total }], imputaciones: pend.map((p) => ({ comprobanteId: p.id, importe: p.saldo })) });
      }
    }
  }
  corrimiento = 0;
  const hoy = hoyAr();
  admin = await sesion(adminId, empresaId);
  const administ = await sesion(adm, empresaId);
  // Agenda de las próximas dos semanas
  const conf = await ok(admin, "GET", "/agenda/config");
  const recursos = (conf.recursos as { id: string; usuarioId: string | null }[]).filter((x) => x.usuarioId === t1 || x.usuarioId === t2);
  for (let dia = 0; dia < 12; dia++) {
    const fecha = sumarDias(hoy, dia);
    if (new RealDate(`${fecha}T12:00:00Z`).getUTCDay() === 0) continue;
    for (const recurso of recursos) {
      for (let v = 0; v < entero(1, 3); v++) {
        const tipo = uno(["Instalación", "Service", "Reparación", "Presupuesto en domicilio"]);
        const hora = 9 + v * 3;
        await pedido(administ, "POST", "/agenda/eventos", { titulo: `${tipo} ${uno(["split", "aire central"])}`, tipo, recursoId: recurso.id, clienteId: uno(clientes), fecha, inicio: `${String(hora).padStart(2, "0")}:00`, fin: `${String(hora + 2).padStart(2, "0")}:00`, estado: dia < 3 ? "Confirmado" : "Pendiente" });
      }
    }
  }
  for (const [titulo, cliente, monto, etapa] of [
    ["Recambio de 24 equipos del hotel", 1, 6200000, "Negociación"],
    ["Climatización del consorcio (palier y SUM)", 0, 2800000, "Propuesta"],
    ["Contrato de service anual farmacia", 2, 780000, "Contactado"],
  ] as const) {
    const o = await ok(administ, "POST", "/oportunidades", { titulo, clienteId: clientes[cliente], monto, cierreEstimado: sumarDias(hoy, entero(15, 45)) });
    await ok(administ, "POST", `/oportunidades/${o.id}/etapa`, { etapa });
  }
  console.log("demo2 lista: ServiTec Climatización (demo2@prexacode.com.ar / Demo12345)");
}

try {
  await demo1();
  await demo2();
} finally {
  corrimiento = 0;
  await app.close();
  await close();
}
