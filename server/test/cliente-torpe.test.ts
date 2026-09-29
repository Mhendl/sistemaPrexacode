/**
 * EL CLIENTE TORPE
 *
 * Alguien que no se lleva bien con la tecnología: deja campos vacíos, escribe letras donde van números,
 * pone cantidades negativas, fechas imposibles, pega textos enormes o emojis, toca dos veces "Guardar",
 * o entra a un link viejo. El sistema nunca puede romperse (error 500): siempre tiene que responder
 * con un mensaje claro, y no puede aceptar cosas que después dejen los números mal.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth, crearApp, cuitValido, emailUnico, registrarEmpresa, type TestApp } from "./helpers.js";

type Resp = { status: number; body: any };

const VARIANTES: [string, unknown][] = [
  ["vacío", ""],
  ["espacios", "   "],
  ["null", null],
  ["letras", "abc"],
  ["negativo", -1],
  ["cero", 0],
  ["gigante", 1e15],
  ["infinito como texto", "1e400"],
  ["decimal con coma", "12,5"],
  ["booleano", true],
  ["lista", []],
  ["objeto", {}],
  ["texto enorme", "x".repeat(20_000)],
  ["emojis", "🤡💥 ñandú"],
  ["html", "<script>alert(1)</script>"],
  ["sql", "'; drop table clientes; --"],
  ["fecha imposible", "2026-02-31"],
  ["fecha al revés", "31/12/2026"],
  ["uuid inexistente", "00000000-0000-4000-8000-000000000000"],
  ["carácter nulo", "hola\u0000chau"],
];

/** Campos donde un número negativo o cero aceptado dejaría los números mal */
const NO_NEGATIVOS = /^(cantidad|precio|precioUnitario|importe|monto|stockInicial|stockMinimo|usuariosAdicionales|dias|importeArs)$/;

describe("el cliente torpe no puede romper nada", () => {
  let app: TestApp;
  let cerrar: () => Promise<void>;
  const errores: string[] = [];
  const sospechosos: string[] = [];
  beforeAll(async () => {
    ({ app, cerrar } = await crearApp({ cotizacion: async () => 1000, adminInicial: { email: "duenio@prexacode.com.ar", password: "clave-del-panel-2026" } }));
    // Guardar el error real de cada 500 para poder arreglarlo
    app.addHook("onError", async (req, _reply, err) => {
      errores.push(`${req.method} ${req.url}: ${err.message.split("\n")[0]?.slice(0, 200)}`);
    });
  });
  afterAll(() => cerrar());

  it("formularios con cada campo mal cargado, todas las rutas con ids inválidos, y dobles clics", async () => {
    const { token } = await registrarEmpresa(app, "Comercio Torpe S.R.L.");
    const pedir = async (method: string, url: string, payload?: unknown, t = token): Promise<Resp> => {
      const r = await app.inject({ method: method as "GET", url, headers: auth(t), ...(payload !== undefined ? { payload: payload as object } : {}) });
      let body: unknown = null;
      try {
        body = r.body ? JSON.parse(r.body) : null;
      } catch {
        body = r.body;
      }
      return { status: r.statusCode, body };
    };
    const panel = (await app.inject({ method: "POST", url: "/api/admin/login", payload: { email: "duenio@prexacode.com.ar", password: "clave-del-panel-2026" } })).json().token;

    // ---------------------------------------------------------------- datos de base
    const cliente = (await pedir("POST", "/api/clientes", { razonSocial: "Cliente Base S.A.", cuit: cuitValido(), condicionIva: "Responsable Inscripto" })).body;
    const producto = (await pedir("POST", "/api/productos", { codigo: "BASE-1", descripcion: "Producto base", precio: 1000, alicuotaIva: 21, controlaStock: true, stockMinimo: 0, stockInicial: 5 })).body;
    const factura = (await pedir("POST", "/api/comprobantes", { clienteId: cliente.id, condicionVenta: "Cuenta corriente", items: [{ productoId: producto.id, cantidad: 1 }] })).body;
    const presupuesto = (await pedir("POST", "/api/presupuestos", { clienteId: cliente.id, items: [{ productoId: producto.id, cantidad: 1 }] })).body;
    const remito = (await pedir("POST", "/api/remitos", { clienteId: cliente.id, items: [{ productoId: producto.id, cantidad: 1 }] })).body;
    const recibo = (await pedir("POST", "/api/recibos", { clienteId: cliente.id, medios: [{ medio: "Efectivo", importe: 100 }], imputaciones: [{ comprobanteId: factura.id, importe: 100 }] })).body;
    const agenda = (await pedir("GET", "/api/agenda/config")).body;
    const recurso = agenda.recursos?.[0] ?? (await pedir("POST", "/api/agenda/recursos", { nombre: "Recurso", color: "#336699" })).body;
    const evento = (await pedir("POST", "/api/agenda/eventos", { titulo: "Visita", recursoId: recurso.id, clienteId: cliente.id, fecha: "2026-12-01", inicio: "10:00", fin: "11:00" })).body;
    const oportunidad = (await pedir("POST", "/api/oportunidades", { titulo: "Venta grande", clienteId: cliente.id, monto: 1000 })).body;
    const nota = (await pedir("POST", `/api/clientes/${cliente.id}/notas`, { texto: "Nota" })).body;
    const usa = (await pedir("POST", `/api/clientes/${cliente.id}/productos`, { productoId: producto.id, cantidad: 1 })).body;
    const ticket = (await pedir("POST", "/api/soporte", { asunto: "Ayuda", categoria: "Consulta", mensaje: "Hola" })).body;
    const empleado = (await pedir("POST", "/api/empleados", { nombre: "Ana", apellido: "Base", fechaIngreso: "2022-01-10", sueldo: 500000 })).body;
    for (const [n, x] of Object.entries({ cliente, producto, factura, presupuesto, remito, recibo, recurso, evento, oportunidad, nota, usa, ticket, empleado })) {
      expect(x?.id, `no se pudo crear ${n}: ${JSON.stringify(x)}`).toBeTruthy();
    }

    // ---------------------------------------------------------------- 1. formularios, campo por campo
    const formularios: { nombre: string; method: string; url: string; base: Record<string, unknown> }[] = [
      { nombre: "cliente nuevo", method: "POST", url: "/api/clientes", base: { razonSocial: "Cliente Nuevo", cuit: "20123456786", condicionIva: "Consumidor Final", email: "a@b.com", telefono: "11 5555-5555", diasCredito: 30 } },
      { nombre: "editar cliente", method: "PUT", url: `/api/clientes/${cliente.id}`, base: { razonSocial: "Cliente Base S.A.", cuit: cliente.cuit, condicionIva: "Responsable Inscripto", version: 1 } },
      { nombre: "producto nuevo", method: "POST", url: "/api/productos", base: { codigo: "P-NUEVO", descripcion: "Nuevo", precio: 500, alicuotaIva: 21, controlaStock: true, stockMinimo: 1, stockInicial: 3, categoria: "Varios" } },
      { nombre: "movimiento de stock", method: "POST", url: `/api/productos/${producto.id}/movimientos`, base: { tipo: "ingreso", cantidad: 2, motivo: "Compra" } },
      { nombre: "factura", method: "POST", url: "/api/comprobantes", base: { clienteId: cliente.id, condicionVenta: "Contado", cobro: { medio: "Efectivo" }, items: [{ descripcion: "Servicio", cantidad: 1, precioUnitario: 1000, alicuotaIva: 21 }] } },
      { nombre: "nota de crédito", method: "POST", url: "/api/comprobantes", base: { clase: "nota_credito", asociadoId: factura.id, clienteId: cliente.id, items: [{ productoId: producto.id, cantidad: 1 }] } },
      { nombre: "presupuesto", method: "POST", url: "/api/presupuestos", base: { clienteId: cliente.id, items: [{ descripcion: "Servicio", cantidad: 2, precioUnitario: 500, alicuotaIva: 21, bonificacion: 10 }] } },
      { nombre: "remito", method: "POST", url: "/api/remitos", base: { clienteId: cliente.id, fecha: "2026-09-25", items: [{ productoId: producto.id, cantidad: 1 }] } },
      { nombre: "recibo", method: "POST", url: "/api/recibos", base: { clienteId: cliente.id, medios: [{ medio: "Transferencia", importe: 50, referencia: "op 123" }], imputaciones: [{ comprobanteId: factura.id, importe: 50 }] } },
      { nombre: "evento de agenda", method: "POST", url: "/api/agenda/eventos", base: { titulo: "Turno", tipo: "Visita", recursoId: recurso.id, clienteId: cliente.id, fecha: "2026-12-02", inicio: "09:00", fin: "10:00", notas: "x" } },
      { nombre: "recurso de agenda", method: "POST", url: "/api/agenda/recursos", base: { nombre: "Sala", color: "#336699" } },
      { nombre: "config de agenda", method: "PUT", url: "/api/agenda/config", base: { nombreEvento: "Turno", nombreRecurso: "Box", horaInicio: "08:00", horaFin: "18:00", tiposEvento: ["Consulta"] } },
      { nombre: "oportunidad", method: "POST", url: "/api/oportunidades", base: { titulo: "Otra venta", prospecto: "Juan", monto: 5000, cierreEstimado: "2026-12-15", etapa: "Nuevo" } },
      { nombre: "nota del cliente", method: "POST", url: `/api/clientes/${cliente.id}/notas`, base: { texto: "Llamar el lunes", fijada: true } },
      { nombre: "producto que usa el cliente", method: "POST", url: `/api/clientes/${cliente.id}/productos`, base: { productoId: producto.id, cantidad: 2, frecuencia: "por mes", nota: "x" } },
      { nombre: "datos de la empresa", method: "PUT", url: "/api/empresa", base: { razonSocial: "Comercio Torpe S.R.L.", condicionIva: "Responsable Inscripto", inicioActividades: "2014-03-01", domicilio: "Calle 1", email: "a@b.com" } },
      { nombre: "usuario nuevo", method: "POST", url: "/api/usuarios", base: { nombre: "Pepe", email: "pepe.torpe@prueba.com", rol: "ventas", password: "clave-segura-123" } },
      { nombre: "cambio de plan", method: "PUT", url: "/api/suscripcion", base: { plan: "profesional", usuariosAdicionales: 0 } },
      { nombre: "pedido de soporte", method: "POST", url: "/api/soporte", base: { asunto: "No anda", categoria: "Problema", mensaje: "Detalle" } },
      { nombre: "preferencias de avisos", method: "PUT", url: "/api/notificaciones/preferencias", base: { lista: [{ tipo: "stock_bajo", enSistema: false }] } },
      { nombre: "punto de venta", method: "POST", url: "/api/comprobantes/puntos-venta", base: { numero: 7, nombre: "Sucursal" } },
      { nombre: "registro de empresa", method: "POST", url: "/api/auth/registro", base: { empresa: { razonSocial: "Nueva", cuit: cuitValido(), condicionIva: "Monotributista" }, usuario: { nombre: "X", email: emailUnico("r"), password: "clave-segura-123" }, aceptaTerminos: true } },
      { nombre: "login", method: "POST", url: "/api/auth/login", base: { email: "nadie@x.com", password: "123" } },
      { nombre: "empleado nuevo", method: "POST", url: "/api/empleados", base: { nombre: "Pedro", apellido: "Torpe", cuil: "20123456786", puesto: "Cadete", fechaIngreso: "2023-05-02", modalidad: "Mensual", sueldo: 400000, cbu: "0110599520000001234567", email: "p@t.com" } },
      { nombre: "pago de sueldo", method: "POST", url: `/api/empleados/${empleado.id}/pagos`, base: { tipo: "Bono", periodo: "2026-05", fecha: "2026-05-30", conceptos: [{ concepto: "Bono", importe: 1000 }], medio: "Efectivo", nota: "x" } },
      { nombre: "vacaciones", method: "POST", url: `/api/empleados/${empleado.id}/novedades`, base: { tipo: "Vacaciones", desde: "2026-02-02", hasta: "2026-02-03", nota: "x" } },
      { nombre: "baja de empleado", method: "POST", url: `/api/empleados/${empleado.id}/baja`, base: { fecha: "2026-09-01", motivo: "Renuncia" } },
      { nombre: "rol nuevo", method: "POST", url: "/api/roles", base: { nombre: "Rol torpe", descripcion: "x", permisos: ["clientes.ver"] } },
      { nombre: "botón de baja", method: "POST", url: "/api/legal/solicitud", base: { tipo: "baja", nombre: "Carla", email: "c@x.com", cuit: "20123456786", motivo: "x" } },
    ];

    const probar = async (nombre: string, method: string, url: string, body: unknown, que: string) => {
      // las preferencias van como lista (el formulario base las guarda dentro de "lista")
      const real = url.endsWith("/preferencias") && body && typeof body === "object" && "lista" in (body as object) ? (body as { lista: unknown }).lista : body;
      const r = await pedir(method, url, real, url.startsWith("/api/auth") || url.startsWith("/api/legal") ? "" : token);
      if (r.status >= 500) sospechosos.push(`💥 500 en ${nombre} (${que})`);
      else if (typeof r.body === "object" && r.status >= 400 && !r.body?.error) sospechosos.push(`sin mensaje en ${nombre} (${que}): ${r.status}`);
      return r;
    };

    let pruebas = 0;
    for (const f of formularios) {
      // Cuerpo entero mal
      for (const [que, cuerpo] of [["sin datos", undefined], ["vacío", {}], ["lista", []], ["texto", "hola"], ["null", null]] as const) {
        await probar(f.nombre, f.method, f.url, cuerpo, `cuerpo ${que}`);
        pruebas++;
      }
      // Cada campo (y los de los renglones) con cada variante
      const campos: { ruta: string[] }[] = [];
      for (const [k, v] of Object.entries(f.base)) {
        campos.push({ ruta: [k] });
        if (Array.isArray(v) && v[0] && typeof v[0] === "object") for (const kk of Object.keys(v[0])) campos.push({ ruta: [k, "0", kk] });
        else if (v && typeof v === "object" && !Array.isArray(v)) for (const kk of Object.keys(v)) campos.push({ ruta: [k, kk] });
      }
      for (const { ruta } of campos) {
        for (const [que, valor] of [["falta", undefined], ...VARIANTES] as [string, unknown][]) {
          const cuerpo = structuredClone(f.base) as Record<string, unknown>;
          let obj: Record<string, unknown> = cuerpo;
          for (const k of ruta.slice(0, -1)) obj = obj[k] as Record<string, unknown>;
          const ultimo = ruta.at(-1)!;
          if (valor === undefined) delete obj[ultimo];
          else obj[ultimo] = valor;
          const r = await probar(f.nombre, f.method, f.url, cuerpo, `${ruta.join(".")} = ${que}`);
          pruebas++;
          // Aceptar cantidades o importes negativos sería un bug de negocio
          if (r.status < 300 && NO_NEGATIVOS.test(ultimo) && que === "negativo") sospechosos.push(`aceptó ${ruta.join(".")} negativo en ${f.nombre}`);
          if (r.status < 300 && que === "texto enorme" && !["texto", "mensaje", "nota", "notas"].includes(ultimo)) sospechosos.push(`aceptó un texto de 20.000 letras en ${f.nombre}.${ruta.join(".")}`);
          if (r.status < 300 && que === "fecha imposible" && /fecha|cierre|inicio|hasta|desde/i.test(ultimo)) sospechosos.push(`aceptó la fecha 31/02 en ${f.nombre}.${ruta.join(".")}`);
        }
      }
    }

    // ---------------------------------------------------------------- 2. todas las rutas, con ids que no sirven
    const ids = ["no-es-un-id", "00000000-0000-4000-8000-000000000000", "0", "%00", "..%2F..%2Fetc"];
    const rutas: [string, string][] = [
      ["GET", "/api/clientes/:id"], ["PUT", "/api/clientes/:id"], ["DELETE", "/api/clientes/:id"], ["GET", "/api/clientes/:id/notas"], ["PUT", `/api/clientes/${cliente.id}/notas/:id`], ["DELETE", `/api/clientes/${cliente.id}/notas/:id`],
      ["GET", "/api/clientes/:id/productos"], ["PUT", `/api/clientes/${cliente.id}/productos/:id`], ["DELETE", `/api/clientes/${cliente.id}/productos/:id`],
      ["GET", "/api/productos/:id"], ["PUT", "/api/productos/:id"], ["DELETE", "/api/productos/:id"], ["GET", "/api/productos/:id/movimientos"], ["POST", "/api/productos/:id/movimientos"],
      ["GET", "/api/comprobantes/:id"], ["PATCH", "/api/comprobantes/puntos-venta/:id"], ["GET", "/api/cobranzas/cuenta-corriente/:id"],
      ["GET", "/api/presupuestos/:id"], ["PUT", "/api/presupuestos/:id"], ["DELETE", "/api/presupuestos/:id"], ["POST", "/api/presupuestos/:id/estado"], ["POST", "/api/presupuestos/:id/duplicar"],
      ["GET", "/api/remitos/:id"], ["POST", "/api/remitos/:id/anular"], ["GET", "/api/recibos/:id"], ["POST", "/api/recibos/:id/anular"],
      ["GET", "/api/oportunidades/:id"], ["PUT", "/api/oportunidades/:id"], ["DELETE", "/api/oportunidades/:id"], ["POST", "/api/oportunidades/:id/etapa"],
      ["GET", "/api/agenda/eventos/:id"], ["PUT", "/api/agenda/eventos/:id"], ["DELETE", "/api/agenda/eventos/:id"], ["POST", "/api/agenda/eventos/:id/estado"], ["PUT", "/api/agenda/recursos/:id"], ["DELETE", "/api/agenda/recursos/:id"],
      ["PATCH", "/api/usuarios/:id"], ["POST", "/api/notificaciones/:id/leer"], ["GET", "/api/suscripcion/pagos/:id"], ["POST", "/api/suscripcion/pagos/:id/verificar"], ["POST", "/api/suscripcion/pagos/:id/simular"],
      ["GET", "/api/soporte/:id"], ["POST", "/api/soporte/:id/mensajes"], ["POST", "/api/soporte/:id/cerrar"],
      ["GET", "/api/documentos/factura/:id/compartir"], ["POST", "/api/documentos/factura/:id/enviar"], ["DELETE", "/api/documentos/factura/:id/enlace"], ["GET", "/api/documentos/:id/:id/compartir"],
      ["GET", "/api/publico/:id"], ["GET", "/api/empresas/:id/logo"],
    ];
    for (const [method, ruta] of rutas) {
      for (const id of ids) {
        for (const cuerpo of method === "GET" || method === "DELETE" ? [undefined] : [undefined, {}, { estado: "Aceptado", motivo: "x", texto: "x", etapa: "Ganada", resultado: "Aprobado" }]) {
          await probar(`${method} ${ruta}`, method, ruta.replaceAll(":id", id), cuerpo, `id ${id}`);
          pruebas++;
        }
      }
    }
    // Filtros y fechas raras en listados y reportes
    for (const url of [
      "/api/reportes/ventas?desde=2026-02-31&hasta=hoy",
      "/api/reportes/ventas?desde=2030-01-01&hasta=2020-01-01",
      "/api/reportes/libro-iva?desde=abc",
      "/api/reportes/ventas?desde=1900-01-01&hasta=2999-12-31",
      "/api/agenda/eventos?desde=ayer&hasta=mañana",
      "/api/clientes?q=%27%3B%20drop%20table",
      "/api/clientes?estado=Raro",
      "/api/comprobantes?clienteId=abc",
      "/api/cobranzas/pendientes?clienteId=abc&soloVencidas=quizas",
      "/api/movimientos?productoId=abc&tipo=raro",
      "/api/oportunidades?etapa=Soñada",
    ]) {
      await probar("listado", "GET", url, undefined, url);
      pruebas++;
    }
    // Panel con ids que no sirven
    for (const r of ["/api/plataforma/empresas/:id", "/api/plataforma/tickets/:id"]) {
      for (const id of ids) {
        await pedir("GET", r.replace(":id", id), undefined, panel).then((x) => x.status >= 500 && sospechosos.push(`💥 500 en panel ${r} con ${id}`));
      }
    }

    // ---------------------------------------------------------------- 3. dobles clics
    // Dos cobros del saldo completo de la misma factura, al mismo tiempo: solo uno puede imputar
    const f2 = (await pedir("POST", "/api/comprobantes", { clienteId: cliente.id, condicionVenta: "Cuenta corriente", items: [{ descripcion: "Servicio", cantidad: 1, precioUnitario: 1000, alicuotaIva: 21 }] })).body;
    const dos = await Promise.all([1, 2].map(() => pedir("POST", "/api/recibos", { clienteId: cliente.id, medios: [{ medio: "Efectivo", importe: f2.total }], imputaciones: [{ comprobanteId: f2.id, importe: f2.total }] })));
    if (dos.filter((r) => r.status === 201).length !== 1) sospechosos.push(`doble cobro: ${dos.map((r) => r.status).join(", ")}`);
    const saldo = (await pedir("GET", `/api/comprobantes/${f2.id}`)).body.saldo;
    if (saldo !== 0) sospechosos.push(`después del doble clic el saldo quedó ${saldo}`);
    // Dos remitos por el último stock, al mismo tiempo
    const ultimo = (await pedir("POST", "/api/productos", { codigo: "ULT-1", descripcion: "Último", precio: 10, alicuotaIva: 21, controlaStock: true, stockMinimo: 0, stockInicial: 1 })).body;
    const rem = await Promise.all([1, 2].map(() => pedir("POST", "/api/remitos", { clienteId: cliente.id, items: [{ productoId: ultimo.id, cantidad: 1 }] })));
    if (rem.filter((r) => r.status === 201).length !== 1) sospechosos.push(`doble remito por el último: ${rem.map((r) => r.status).join(", ")}`);
    if ((await pedir("GET", `/api/productos/${ultimo.id}`)).body.stock < 0) sospechosos.push("stock negativo por doble clic");
    // Anular dos veces el mismo recibo, al mismo tiempo
    const an = await Promise.all([1, 2].map(() => pedir("POST", `/api/recibos/${recibo.id}/anular`, { motivo: "Me equivoqué" })));
    if (an.filter((r) => r.status === 200).length !== 1) sospechosos.push(`doble anulación de recibo: ${an.map((r) => r.status).join(", ")}`);
    // Aprobar dos veces el mismo pago de la suscripción
    const pago = (await pedir("POST", "/api/suscripcion/pagar", { periodo: "mensual" })).body;
    await Promise.all([1, 2].map(() => pedir("POST", `/api/suscripcion/pagos/${pago.referencia}/simular`, { resultado: "Aprobado" })));
    const pagos = (await pedir("GET", "/api/suscripcion")).body.pagos.filter((p: { estado: string }) => p.estado === "Aprobado");
    if (pagos.length !== 1) sospechosos.push(`el pago se aprobó ${pagos.length} veces`);

    console.log(`\n=== Cliente torpe: ${pruebas} pruebas ===\n${[...new Set(sospechosos)].join("\n") || "Sin problemas"}\n${errores.length ? `Errores internos:\n${[...new Set(errores)].join("\n")}` : ""}`);
    expect([...new Set(sospechosos)]).toEqual([]);
  }, 600_000);
});
