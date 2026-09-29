/**
 * SIMULACIÓN DE OPERACIÓN REAL
 *
 * Una empresa trabaja "un mes": cientos de operaciones al azar (con semilla fija: siempre las mismas),
 * de varios usuarios, algunas AL MISMO TIEMPO. Cada respuesta se anota en un libro paralelo, y al final
 * se comprueba que el sistema diga lo mismo en todos lados:
 *  - numeración de comprobantes, remitos y recibos sin huecos ni repetidos
 *  - stock = stock inicial + movimientos, nunca negativo, igual al libro paralelo
 *  - cada comprobante cierra (neto + exento + IVA = total; IVA por alícuota = IVA total)
 *  - cuenta corriente de cada cliente = facturas − notas de crédito − recibos
 *  - cobranzas, reportes, Libro IVA e Inicio coinciden entre sí y con el libro paralelo
 *
 * Con `npm run test:postgres` corre contra PostgreSQL real, donde la concurrencia es de verdad.
 */
import { describe, expect, it } from "vitest";
import { auth, crearApp, cuitValido, emailUnico, registrarEmpresa, type TestApp } from "./helpers.js";

/** Generador pseudoaleatorio con semilla (mulberry32): la simulación es repetible */
function azar(semilla: number) {
  let a = semilla >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    r,
    entero: (min: number, max: number) => min + Math.floor(r() * (max - min + 1)),
    uno: <T>(xs: T[]) => xs[Math.floor(r() * xs.length)]!,
    peso: <T extends string>(opciones: Record<T, number>): T => {
      const total = Object.values<number>(opciones).reduce((a, b) => a + b, 0);
      let x = r() * total;
      for (const [k, v] of Object.entries<number>(opciones)) {
        if ((x -= v) <= 0) return k as T;
      }
      return Object.keys(opciones)[0] as T;
    },
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const cerca = (a: number, b: number, tolerancia = 0.011) => Math.abs(a - b) <= tolerancia;

type Resp = { status: number; body: any };

describe("simulación: una empresa trabajando un mes", () => {
  it("cientos de operaciones de varios usuarios, algunas simultáneas, y todo cierra", async () => {
    const { app, cerrar } = await crearApp();
    try {
      await simular(app);
    } finally {
      await cerrar();
    }
  }, 300_000);
});

async function simular(app: TestApp) {
  // SIM_SEMILLA=n cambia el "mes" simulado (por defecto siempre el mismo)
  const z = azar(Number(process.env.SIM_SEMILLA ?? 20260927));
  const pedido = async (token: string, method: "GET" | "POST" | "PUT" | "PATCH", url: string, payload?: object): Promise<Resp> => {
    const res = await app.inject({ method, url: `/api${url}`, headers: auth(token), ...(payload ? { payload } : {}) });
    return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
  };

  // ------------------------------------------------------------------ la empresa
  const { token: admin } = await registrarEmpresa(app, "Distribuidora Simulada S.R.L.", "Responsable Inscripto");
  await pedido(admin, "PUT", "/suscripcion", { plan: "empresa", usuariosAdicionales: 0 });
  const usuario = async (rol: string) => {
    const email = emailUnico(rol);
    expect((await pedido(admin, "POST", "/usuarios", { nombre: `Usuario ${rol}`, email, rol, password: "clave-segura-123" })).status).toBe(201);
    return (await app.inject({ method: "POST", url: "/api/auth/login", payload: { email, password: "clave-segura-123" } })).json().token as string;
  };
  const vendedores = [admin, await usuario("ventas"), await usuario("ventas")];
  const deposito = await usuario("operaciones");

  const condiciones = ["Responsable Inscripto", "Responsable Inscripto", "Monotributista", "Consumidor Final", "Consumidor Final", "Exento"];
  const clientes: { id: string; condicionIva: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const condicionIva = condiciones[i % condiciones.length]!;
    const c = await pedido(admin, "POST", "/clientes", { razonSocial: `Cliente Simulado ${i + 1}`, cuit: cuitValido(condicionIva === "Consumidor Final" ? "20" : "30"), condicionIva });
    expect(c.status).toBe(201);
    clientes.push({ id: c.body.id, condicionIva });
  }

  const productos: { id: string; precio: number; alicuotaIva: number; controlaStock: boolean }[] = [];
  const stock = new Map<string, number>(); // libro paralelo de stock
  const alicuotas = [21, 21, 10.5, 27, 0];
  for (let i = 0; i < 10; i++) {
    const controlaStock = i < 8;
    const inicial = controlaStock ? z.entero(15, 80) : 0;
    const p = await pedido(admin, "POST", "/productos", {
      codigo: `SIM-${i + 1}`,
      descripcion: `Producto simulado ${i + 1}`,
      precio: r2(z.entero(500, 150000) + z.entero(0, 99) / 100),
      alicuotaIva: alicuotas[i % alicuotas.length],
      controlaStock,
      stockInicial: inicial,
      stockMinimo: controlaStock ? 5 : 0,
    });
    expect(p.status).toBe(201);
    productos.push({ id: p.body.id, precio: p.body.precio, alicuotaIva: p.body.alicuotaIva, controlaStock });
    if (controlaStock) stock.set(p.body.id, inicial);
  }

  // ------------------------------------------------------------------ libro paralelo
  interface FacturaLibro {
    id: string;
    clienteId: string;
    total: number;
    items: { productoId: string; cantidad: number }[];
    notasCredito: number;
  }
  const facturas: FacturaLibro[] = [];
  const ventasFirmadas: number[] = []; // total de cada comprobante autorizado (NC en negativo)
  const recibosEmitidos: { id: string; clienteId: string; total: number }[] = [];
  const remitosEmitidos: { id: string; items: { productoId: string; cantidad: number }[] }[] = [];
  const presupuestos: { id: string; clienteId: string }[] = [];
  const contador: Record<string, number> = {};
  const contar = (k: string) => (contador[k] = (contador[k] ?? 0) + 1);

  const itemsAlAzar = (maxItems = 4) => {
    const n = z.entero(1, maxItems);
    const items: Record<string, unknown>[] = [];
    const usados = new Set<string>();
    for (let i = 0; i < n; i++) {
      if (z.r() < 0.15) {
        items.push({ descripcion: `Servicio ${z.entero(1, 99)}`, cantidad: z.entero(1, 3), precioUnitario: z.entero(1000, 50000), alicuotaIva: z.uno([21, 10.5]) });
      } else {
        const p = z.uno(productos);
        if (usados.has(p.id)) continue;
        usados.add(p.id);
        items.push({ productoId: p.id, cantidad: z.entero(1, 4), ...(z.r() < 0.2 ? { bonificacion: z.uno([5, 10, 15]) } : {}) });
      }
    }
    return items;
  };
  const descontar = (items: Record<string, unknown>[], signo: -1 | 1) => {
    for (const it of items) {
      const pid = it.productoId as string | undefined;
      if (pid && stock.has(pid)) stock.set(pid, Math.round((stock.get(pid)! + signo * (it.cantidad as number)) * 1000) / 1000);
    }
  };

  const emitirFactura = async (token: string, cliente: { id: string }, items: Record<string, unknown>[], extra: object = {}) => {
    const contado = z.r() < 0.35;
    const res = await pedido(token, "POST", "/comprobantes", {
      clienteId: cliente.id,
      condicionVenta: contado ? "Contado" : "Cuenta corriente",
      ...(contado ? { cobro: { medio: z.uno(["Efectivo", "Transferencia", "Mercado Pago"]) } } : {}),
      items,
      ...extra,
    });
    return { res, contado };
  };
  const registrarFactura = (res: Resp, clienteId: string, items: Record<string, unknown>[], contado: boolean) => {
    expect(res.body.estado).toBe("Autorizado");
    facturas.push({ id: res.body.id, clienteId, total: res.body.total, items: items.filter((i) => i.productoId).map((i) => ({ productoId: i.productoId as string, cantidad: i.cantidad as number })), notasCredito: 0 });
    ventasFirmadas.push(res.body.total);
    descontar(items, -1);
    if (contado) recibosEmitidos.push({ id: "auto", clienteId, total: res.body.total }); // recibo automático
  };

  // ------------------------------------------------------------------ operaciones
  const OPERACIONES = 260;
  for (let paso = 1; paso <= OPERACIONES; paso++) {
    const op = z.peso({ factura: 32, nc: 7, recibo: 16, reciboACuenta: 3, remito: 10, anularRemito: 2, ingreso: 9, ajuste: 3, presupuesto: 7, facturarPresupuesto: 4, anularRecibo: 2 });
    const vendedor = z.uno(vendedores);
    contar(op);

    if (op === "factura") {
      const cliente = z.uno(clientes);
      const items = itemsAlAzar();
      if (!items.length) continue;
      const { res, contado } = await emitirFactura(vendedor, cliente, items);
      if (res.status === 409) {
        contar("factura sin stock (rechazada)");
        expect(res.body.error).toContain("stock");
        continue;
      }
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      registrarFactura(res, cliente.id, items, contado);
    }

    if (op === "nc") {
      const candidatas = facturas.filter((f) => f.items.length && f.notasCredito < f.total - 1);
      if (!candidatas.length) continue;
      const f = z.uno(candidatas);
      const it = z.uno(f.items);
      const moverStock = z.r() < 0.6;
      const res = await pedido(admin, "POST", "/comprobantes", { clase: "nota_credito", asociadoId: f.id, clienteId: f.clienteId, moverStock, items: [{ productoId: it.productoId, cantidad: 1 }] });
      if (res.status === 400) {
        contar("nc rechazada (supera la factura)");
        continue;
      }
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      f.notasCredito = r2(f.notasCredito + res.body.total);
      expect(f.notasCredito).toBeLessThanOrEqual(f.total + 0.01);
      ventasFirmadas.push(-res.body.total);
      if (moverStock && stock.has(it.productoId)) stock.set(it.productoId, stock.get(it.productoId)! + 1);
    }

    if (op === "recibo") {
      const cliente = z.uno(clientes);
      const pend = (await pedido(vendedor, "GET", `/cobranzas/pendientes?clienteId=${cliente.id}`)).body as { id: string; saldo: number }[];
      if (!pend.length) continue;
      const f = z.uno(pend);
      const importe = z.r() < 0.5 ? f.saldo : r2(Math.max(0.01, f.saldo * z.uno([0.3, 0.5, 0.7])));
      const res = await pedido(vendedor, "POST", "/recibos", { clienteId: cliente.id, medios: [{ medio: z.uno(["Efectivo", "Transferencia", "Cheque"]), importe }], imputaciones: [{ comprobanteId: f.id, importe }] });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      recibosEmitidos.push({ id: res.body.id, clienteId: cliente.id, total: importe });
    }

    if (op === "reciboACuenta") {
      const cliente = z.uno(clientes);
      const importe = z.entero(1000, 30000);
      const res = await pedido(vendedor, "POST", "/recibos", { clienteId: cliente.id, medios: [{ medio: "Transferencia", importe }] });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      recibosEmitidos.push({ id: res.body.id, clienteId: cliente.id, total: importe });
    }

    if (op === "anularRecibo") {
      const anulables = recibosEmitidos.filter((r) => r.id !== "auto");
      if (!anulables.length) continue;
      const r = z.uno(anulables);
      const res = await pedido(admin, "POST", `/recibos/${r.id}/anular`, { motivo: "Cheque rechazado" });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      recibosEmitidos.splice(recibosEmitidos.indexOf(r), 1);
    }

    if (op === "remito") {
      const cliente = z.uno(clientes);
      const items = itemsAlAzar(3)
        .filter((i) => i.productoId && productos.find((p) => p.id === i.productoId)!.controlaStock)
        .map((i) => ({ productoId: i.productoId as string, cantidad: i.cantidad as number }));
      if (!items.length) continue;
      const res = await pedido(z.uno([deposito, vendedor]), "POST", "/remitos", { clienteId: cliente.id, items });
      if (res.status === 409) {
        contar("remito sin stock (rechazado)");
        continue;
      }
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      remitosEmitidos.push({ id: res.body.id, items });
      descontar(items, -1);
    }

    if (op === "anularRemito") {
      if (!remitosEmitidos.length) continue;
      const r = z.uno(remitosEmitidos);
      const res = await pedido(deposito, "POST", `/remitos/${r.id}/anular`, { motivo: "El cliente no recibió" });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      remitosEmitidos.splice(remitosEmitidos.indexOf(r), 1);
      descontar(r.items, 1);
    }

    if (op === "ingreso") {
      const p = z.uno(productos.filter((x) => x.controlaStock));
      const cantidad = z.entero(5, 40);
      const res = await pedido(deposito, "POST", `/productos/${p.id}/movimientos`, { tipo: "ingreso", cantidad, motivo: "Compra a proveedor" });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      stock.set(p.id, stock.get(p.id)! + cantidad);
    }

    if (op === "ajuste") {
      const p = z.uno(productos.filter((x) => x.controlaStock));
      const contado = z.entero(0, 60);
      const res = await pedido(deposito, "POST", `/productos/${p.id}/movimientos`, { tipo: "ajuste", stockContado: contado, motivo: "Recuento de depósito" });
      if (res.status === 400 && stock.get(p.id) === contado) continue; // sin diferencia
      expect([200, 201], JSON.stringify(res.body)).toContain(res.status);
      stock.set(p.id, contado);
    }

    if (op === "presupuesto") {
      const cliente = z.uno(clientes);
      const items = itemsAlAzar();
      if (!items.length) continue;
      const res = await pedido(vendedor, "POST", "/presupuestos", { clienteId: cliente.id, items });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      presupuestos.push({ id: res.body.id, clienteId: cliente.id });
    }

    if (op === "facturarPresupuesto") {
      if (!presupuestos.length) continue;
      const p = presupuestos.splice(z.entero(0, presupuestos.length - 1), 1)[0]!;
      const det = (await pedido(vendedor, "GET", `/presupuestos/${p.id}`)).body;
      const items = det.items.map((i: Record<string, unknown>) => (i.productoId ? { productoId: i.productoId, cantidad: i.cantidad, bonificacion: i.bonificacion } : { descripcion: i.descripcion, cantidad: i.cantidad, precioUnitario: i.precioUnitario, alicuotaIva: i.alicuotaIva }));
      const { res, contado } = await emitirFactura(vendedor, { id: p.clienteId }, items, { presupuestoId: p.id });
      if (res.status === 409) {
        contar("presupuesto sin stock para facturar");
        continue;
      }
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      // Lo facturado tiene que ser exactamente lo presupuestado
      expect(res.body.total).toBe(det.total);
      registrarFactura(res, p.clienteId, items, contado);
      expect((await pedido(vendedor, "GET", `/presupuestos/${p.id}`)).body.estado).toBe("Facturado");
    }

    // ------------------------------------------------ ráfagas simultáneas
    if (paso % 50 === 0) {
      // 1) Ocho vendedores facturan a la vez el mismo producto, con más pedido que stock
      const p = productos.find((x) => x.controlaStock && (stock.get(x.id) ?? 0) >= 6) ?? productos[0]!;
      const disponible = stock.get(p.id)!;
      const porPedido = Math.max(1, Math.ceil(disponible / 5));
      const resultados = await Promise.all(
        Array.from({ length: 8 }, (_, i) => pedido(vendedores[i % vendedores.length]!, "POST", "/comprobantes", { clienteId: clientes[i]!.id, condicionVenta: "Cuenta corriente", items: [{ productoId: p.id, cantidad: porPedido }] })),
      );
      const ok = resultados.filter((x) => x.status === 201);
      const sinStock = resultados.filter((x) => x.status === 409);
      expect(ok.length + sinStock.length, JSON.stringify(resultados.map((x) => [x.status, x.body?.error]))).toBe(8);
      expect(ok.length).toBe(Math.min(8, Math.floor(disponible / porPedido))); // se vende exactamente lo que había
      ok.forEach((x, i) => registrarFactura(x, clientes[resultados.indexOf(x)]!.id, [{ productoId: p.id, cantidad: porPedido }], false) ?? i);
      contar("ráfaga de facturas simultáneas");

      // 2) Cinco cobros simultáneos de la misma factura completa: se cobra una sola vez
      const conSaldo = (await pedido(admin, "GET", "/cobranzas/pendientes")).body as { id: string; saldo: number; clienteId: string }[];
      if (conSaldo.length) {
        const f = conSaldo[0]!;
        const cobros = await Promise.all(
          Array.from({ length: 5 }, () => pedido(z.uno(vendedores), "POST", "/recibos", { clienteId: f.clienteId, medios: [{ medio: "Transferencia", importe: f.saldo }], imputaciones: [{ comprobanteId: f.id, importe: f.saldo }] })),
        );
        const cobrados = cobros.filter((x) => x.status === 201);
        expect(cobrados, JSON.stringify(cobros.map((x) => [x.status, x.body?.error]))).toHaveLength(1);
        recibosEmitidos.push({ id: cobrados[0]!.body.id, clienteId: f.clienteId, total: f.saldo });
        contar("ráfaga de cobros simultáneos");
      }

      // 3) Remitos y facturas simultáneos del mismo producto
      const q = productos.find((x) => x.controlaStock && (stock.get(x.id) ?? 0) >= 4);
      if (q) {
        const antes = stock.get(q.id)!;
        const mezcla = await Promise.all(
          Array.from({ length: 6 }, (_, i) =>
            i % 2 === 0
              ? pedido(deposito, "POST", "/remitos", { clienteId: clientes[i]!.id, items: [{ productoId: q.id, cantidad: 2 }] }).then((x) => ({ x, tipo: "remito" as const, i }))
              : pedido(admin, "POST", "/comprobantes", { clienteId: clientes[i]!.id, condicionVenta: "Cuenta corriente", items: [{ productoId: q.id, cantidad: 2 }] }).then((x) => ({ x, tipo: "factura" as const, i })),
          ),
        );
        const exitos = mezcla.filter((m) => m.x.status === 201);
        expect(exitos.length).toBe(Math.min(6, Math.floor(antes / 2)));
        for (const m of exitos) {
          if (m.tipo === "remito") {
            remitosEmitidos.push({ id: m.x.body.id, items: [{ productoId: q.id, cantidad: 2 }] });
            stock.set(q.id, stock.get(q.id)! - 2);
          } else registrarFactura(m.x, clientes[m.i]!.id, [{ productoId: q.id, cantidad: 2 }], false);
        }
        contar("ráfaga de remitos y facturas simultáneos");
      }
    }
  }

  // ================================================================== verificaciones
  const comps = (await pedido(admin, "GET", "/comprobantes")).body as any[];
  const autorizados = comps.filter((c) => c.estado === "Autorizado");

  // 1) Numeración correlativa sin huecos ni repetidos, por tipo y punto de venta
  const porTipo = new Map<string, number[]>();
  for (const c of autorizados) porTipo.set(`${c.tipoCbte}-${c.puntoVenta}`, [...(porTipo.get(`${c.tipoCbte}-${c.puntoVenta}`) ?? []), c.numero]);
  for (const [clave, nums] of porTipo) {
    const orden = [...nums].sort((a, b) => a - b);
    expect(orden, `numeración ${clave}`).toEqual(orden.map((_, i) => i + 1));
  }
  expect(autorizados.every((c) => /^\d{14}$/.test(c.cae))).toBe(true);
  expect(autorizados.length).toBe(ventasFirmadas.length);

  // 2) Cada comprobante cierra
  for (const c of autorizados) {
    const d = (await pedido(admin, "GET", `/comprobantes/${c.id}`)).body;
    expect(cerca(d.neto + d.exento + d.totalIva, d.total), `cierre ${d.tipo} ${d.numero}`).toBe(true);
    expect(cerca(d.iva.reduce((a: number, i: { importe: number }) => a + i.importe, 0), d.totalIva), `IVA ${d.tipo} ${d.numero}`).toBe(true);
    expect(cerca(d.items.reduce((a: number, i: { subtotal: number }) => a + i.subtotal, 0), d.neto + d.exento, 0.05), `ítems ${d.tipo} ${d.numero}`).toBe(true);
    if (d.clase === "factura") {
      expect(d.saldo).toBeGreaterThanOrEqual(-0.01);
      expect(d.saldo).toBeLessThanOrEqual(d.total + 0.01);
    }
  }

  // 3) Stock: igual al libro paralelo, a la suma de movimientos, y nunca negativo en ningún momento
  for (const p of productos.filter((x) => x.controlaStock)) {
    const actual = (await pedido(admin, "GET", `/productos/${p.id}`)).body;
    expect(actual.stock, `stock de ${actual.codigo}`).toBe(stock.get(p.id));
    const movs = ((await pedido(admin, "GET", `/productos/${p.id}/movimientos`)).body as { cantidad: number; stockResultante: number; createdAt: string }[]).reverse();
    let acumulado = 0;
    for (const m of movs) {
      acumulado = Math.round((acumulado + m.cantidad) * 1000) / 1000;
      expect(m.stockResultante, `cadena de movimientos de ${actual.codigo}`).toBe(acumulado);
      expect(m.stockResultante).toBeGreaterThanOrEqual(0);
    }
    expect(acumulado).toBe(actual.stock);
  }

  // 4) Cuenta corriente de cada cliente = facturas − NC − recibos; y coincide con el resumen de cobranzas
  const resumen = (await pedido(admin, "GET", "/cobranzas/resumen")).body;
  for (const c of clientes) {
    const cc = (await pedido(admin, "GET", `/cobranzas/cuenta-corriente/${c.id}`)).body;
    const facturado = autorizados.filter((x) => x.clienteId === c.id && x.clase === "factura").reduce((a, x) => a + x.total, 0);
    const nc = autorizados.filter((x) => x.clienteId === c.id && x.clase === "nota_credito").reduce((a, x) => a + x.total, 0);
    const cobrado = recibosEmitidos.filter((r) => r.clienteId === c.id).reduce((a, r) => a + r.total, 0);
    expect(cerca(cc.saldo, r2(facturado - nc - cobrado), 0.05), `cuenta corriente cliente ${clientes.indexOf(c) + 1}: ${cc.saldo} vs ${r2(facturado - nc - cobrado)}`).toBe(true);
    const fila = resumen.clientes.find((f: { clienteId: string }) => f.clienteId === c.id);
    const saldoResumen = fila ? fila.saldo : 0;
    expect(cerca(saldoResumen, cc.saldo, 0.05), `resumen vs cuenta corriente cliente ${clientes.indexOf(c) + 1}: ${saldoResumen} vs ${cc.saldo}`).toBe(true);
  }
  const pendientes = (await pedido(admin, "GET", "/cobranzas/pendientes")).body as { saldo: number }[];
  expect(cerca(resumen.totales.porCobrar, r2(pendientes.reduce((a, p) => a + p.saldo, 0)), 0.05)).toBe(true);

  // 5) Reportes, Libro IVA e Inicio coinciden entre sí y con el libro paralelo
  const hoy = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const periodo = `desde=${hoy.slice(0, 8)}01&hasta=${hoy}`;
  const ventas = (await pedido(admin, "GET", `/reportes/ventas?${periodo}`)).body;
  const totalLibro = r2(ventasFirmadas.reduce((a, b) => a + b, 0));
  expect(cerca(ventas.resumen.total, totalLibro, 0.05), `reporte ${ventas.resumen.total} vs libro ${totalLibro}`).toBe(true);
  expect(cerca(ventas.porCliente.reduce((a: number, x: { total: number }) => a + x.total, 0), ventas.resumen.total, 0.05)).toBe(true);
  expect(cerca(ventas.porProducto.reduce((a: number, x: { neto: number }) => a + x.neto, 0), ventas.resumen.neto, 0.5)).toBe(true);
  expect(cerca(ventas.resumen.neto + ventas.resumen.iva, ventas.resumen.total, 0.05)).toBe(true);

  const libro = (await pedido(admin, "GET", `/reportes/libro-iva?${periodo}`)).body;
  expect(libro.renglones).toHaveLength(autorizados.length);
  expect(cerca(libro.totales.total, ventas.resumen.total, 0.05)).toBe(true);
  expect(cerca(libro.totales.totalIva, ventas.resumen.iva, 0.05)).toBe(true);
  for (const x of libro.renglones) expect(cerca(x.neto + x.exento + x.totalIva, x.total), `Libro IVA ${x.tipo} ${x.numero}`).toBe(true);

  const inicio = (await pedido(admin, "GET", "/inicio")).body;
  expect(cerca(inicio.ventas.mes, ventas.resumen.total, 0.05), `Inicio ${inicio.ventas.mes} vs reporte ${ventas.resumen.total}`).toBe(true);
  expect(cerca(inicio.cobranzas.porCobrar, resumen.totales.porCobrar, 0.05)).toBe(true);

  // 6) Remitos y recibos: numeración correlativa
  const rems = (await pedido(admin, "GET", "/remitos")).body as { numero: number }[];
  expect(rems.map((r) => r.numero).sort((a, b) => a - b)).toEqual(rems.map((_, i) => i + 1));
  const recs = (await pedido(admin, "GET", "/recibos")).body as { numero: number; total: number; estado: string }[];
  expect(recs.map((r) => r.numero).sort((a, b) => a - b)).toEqual(recs.map((_, i) => i + 1));
  expect(recs.filter((r) => r.estado === "Emitido")).toHaveLength(recibosEmitidos.length);

  // Que la simulación haya ejercitado de verdad cada operación
  for (const clave of ["factura", "nc", "recibo", "remito", "ingreso", "presupuesto", "facturarPresupuesto", "anularRecibo", "anularRemito", "ráfaga de facturas simultáneas", "ráfaga de cobros simultáneos"]) {
    expect(contador[clave] ?? 0, `se ejercitó "${clave}"`).toBeGreaterThan(0);
  }
  console.log(
    `Simulación: ${OPERACIONES} operaciones · ${autorizados.length} comprobantes · ${rems.length} remitos · ${recs.length} recibos · ventas $ ${totalLibro.toLocaleString("es-AR")}\n` +
      Object.entries(contador)
        .map(([k, v]) => `  ${k}: ${v}`)
        .join("\n"),
  );
}
