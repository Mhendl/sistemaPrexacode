import { sql } from "drizzle-orm";
import { bigserial, boolean, index, integer, jsonb, numeric, pgTable, primaryKey, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/** Sube con cada edición: permite detectar que otro usuario guardó antes (control optimista) */
const version = () => integer("version").notNull().default(1);

/**
 * Multiempresa: cada tabla de datos lleva empresa_id y toda consulta filtra por él.
 * Los valores de dominio (rol, condición IVA, estado) se validan con zod en la API.
 */

export const empresas = pgTable("empresas", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  razonSocial: text("razon_social").notNull(),
  nombreFantasia: text("nombre_fantasia"),
  cuit: text("cuit").notNull().unique(),
  condicionIva: text("condicion_iva").notNull(),
  domicilio: text("domicilio"),
  localidad: text("localidad"),
  email: text("email"),
  telefono: text("telefono"),
  plan: text("plan").notNull().default("profesional"),
  ingresosBrutos: text("ingresos_brutos"),
  inicioActividades: text("inicio_actividades"), // aaaa-mm-dd
  codigoPostal: text("codigo_postal"),
  /** Fecha del último logo subido (sirve para refrescar la imagen en el navegador) */
  logoActualizado: timestamp("logo_actualizado", { withTimezone: true }),
  /** Suspendida por el administrador de la plataforma (uso indebido, fraude…): nadie de la empresa puede entrar */
  suspendidaEn: timestamp("suspendida_en", { withTimezone: true }),
  motivoSuspension: text("motivo_suspension"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Roles de cada empresa: los pre armados (administrador, ventas, operaciones) y los que cree el administrador */
export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    descripcion: text("descripcion"),
    /** Acceso total (solo el rol Administrador): no se puede recortar ni borrar */
    esAdmin: boolean("es_admin").notNull().default(false),
    /** admin | ventas | operaciones para los que vienen armados; null para los creados por la empresa */
    prearmado: text("prearmado"),
    permisos: jsonb("permisos").$type<string[]>().notNull().default([]),
    version: version(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("roles_empresa_nombre_uq").on(t.empresaId, t.nombre)],
);

export const usuarios = pgTable(
  "usuarios",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    /** Copia del tipo de rol (admin | ventas | operaciones | personalizado), para consultas rápidas */
    rol: text("rol").notNull(),
    rolId: uuid("rol_id").references(() => roles.id, { onDelete: "restrict" }),
    estado: text("estado").notNull().default("Activo"),
    ultimoAcceso: timestamp("ultimo_acceso", { withTimezone: true }),
    /** Sesión vigente: cada login la reemplaza, así el usuario queda abierto en un solo dispositivo */
    sesionId: uuid("sesion_id"),
    /** Veces que un dispositivo siguió usando una sesión ya reemplazada (señal de usuario compartido) */
    sesionesPisadas: integer("sesiones_pisadas").notNull().default(0),
    ultimaSesionPisada: uuid("ultima_sesion_pisada"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("usuarios_email_uq").on(t.email), index("usuarios_empresa_idx").on(t.empresaId)],
);

export const clientes = pgTable(
  "clientes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    razonSocial: text("razon_social").notNull(),
    cuit: text("cuit").notNull(),
    condicionIva: text("condicion_iva").notNull(),
    contacto: text("contacto"),
    email: text("email"),
    telefono: text("telefono"),
    domicilio: text("domicilio"),
    localidad: text("localidad"),
    rubro: text("rubro"),
    notas: text("notas"),
    estado: text("estado").notNull().default("Activo"),
    version: version(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("clientes_empresa_cuit_uq").on(t.empresaId, t.cuit), index("clientes_empresa_idx").on(t.empresaId)],
);

/** Logo de cada empresa (aparte, para no traer la imagen en cada consulta de empresa) */
export const empresaLogos = pgTable("empresa_logos", {
  empresaId: uuid("empresa_id")
    .primaryKey()
    .references(() => empresas.id, { onDelete: "cascade" }),
  mime: text("mime").notNull(),
  datos: text("datos").notNull(), // base64
});

/** Cantidades con hasta 3 decimales (kg, m, l); montos con 2 */
const cantidad = (name: string) => numeric(name, { precision: 14, scale: 3, mode: "number" });
const monto = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" });

export const productos = pgTable(
  "productos",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    codigo: text("codigo").notNull(),
    descripcion: text("descripcion").notNull(),
    categoria: text("categoria"),
    unidad: text("unidad").notNull().default("u."),
    precio: monto("precio").notNull(), // sin IVA
    alicuotaIva: numeric("alicuota_iva", { precision: 4, scale: 1, mode: "number" }).notNull(),
    /** false para servicios: no llevan stock */
    controlaStock: boolean("controla_stock").notNull().default(true),
    stock: cantidad("stock").notNull().default(0),
    stockMinimo: cantidad("stock_minimo").notNull().default(0),
    activo: boolean("activo").notNull().default(true),
    version: version(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("productos_empresa_codigo_uq").on(t.empresaId, t.codigo), index("productos_empresa_idx").on(t.empresaId)],
);

/**
 * Historial de stock. El stock del producto se actualiza en la misma transacción que el movimiento,
 * así siempre coincide con la suma de movimientos.
 */
export const movimientosStock = pgTable(
  "movimientos_stock",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    productoId: uuid("producto_id")
      .notNull()
      .references(() => productos.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(), // ingreso | egreso | ajuste
    /** Con signo: positivo suma, negativo resta */
    cantidad: cantidad("cantidad").notNull(),
    stockResultante: cantidad("stock_resultante").notNull(),
    motivo: text("motivo").notNull(),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /**
     * Orden real en que se aplicaron los movimientos. La hora (createdAt) es la del inicio de la transacción:
     * con operaciones simultáneas, una que empezó antes puede aplicarse después. La secuencia se toma al grabar,
     * con el producto ya bloqueado, así que respeta el orden en que cambió el stock.
     */
    secuencia: bigserial("secuencia", { mode: "number" }).notNull(),
  },
  (t) => [index("movimientos_empresa_idx").on(t.empresaId, t.createdAt), index("movimientos_producto_idx").on(t.productoId, t.createdAt), index("movimientos_producto_secuencia_idx").on(t.productoId, t.secuencia)],
);

/** Avisos para cada usuario (campanita) */
export const notificaciones = pgTable(
  "notificaciones",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(),
    titulo: text("titulo").notNull(),
    detalle: text("detalle").notNull(),
    /** Pantalla a la que lleva al hacer clic */
    link: text("link"),
    leida: boolean("leida").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notificaciones_usuario_idx").on(t.usuarioId, t.createdAt)],
);

/** Qué avisos quiere recibir cada usuario (si no hay fila, vale el valor por defecto: activado) */
export const preferenciasNotificacion = pgTable(
  "preferencias_notificacion",
  {
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(),
    enSistema: boolean("en_sistema").notNull().default(true),
    porEmail: boolean("por_email").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.usuarioId, t.tipo] })],
);

/** Constancia de aceptación de términos y política de privacidad (prueba ante un reclamo) */
export const aceptacionesTerminos = pgTable("aceptaciones_terminos", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  empresaId: uuid("empresa_id")
    .notNull()
    .references(() => empresas.id, { onDelete: "cascade" }),
  usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
  /** Versión del texto aceptado (fecha de publicación) */
  version: text("version").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  aceptadoEn: timestamp("aceptado_en", { withTimezone: true }).notNull().defaultNow(),
});

/** Último número usado por empresa y tipo de documento (se bloquea la fila al numerar) */
export const numeradores = pgTable(
  "numeradores",
  {
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(), // "remito", más adelante "factura_a", etc.
    ultimo: integer("ultimo").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.empresaId, t.tipo] })],
);

export const remitos = pgTable(
  "remitos",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    puntoVenta: integer("punto_venta").notNull().default(1),
    numero: integer("numero").notNull(),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "restrict" }),
    fecha: text("fecha").notNull(), // aaaa-mm-dd
    domicilioEntrega: text("domicilio_entrega"),
    observaciones: text("observaciones"),
    estado: text("estado").notNull().default("Emitido"), // Emitido | Anulado
    motivoAnulacion: text("motivo_anulacion"),
    anuladoEn: timestamp("anulado_en", { withTimezone: true }),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("remitos_empresa_numero_uq").on(t.empresaId, t.puntoVenta, t.numero), index("remitos_cliente_idx").on(t.clienteId)],
);

/** Ítems del remito: se guarda una copia del código y la descripción (si después cambia el producto, el remito no cambia) */
export const remitoItems = pgTable("remito_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  remitoId: uuid("remito_id")
    .notNull()
    .references(() => remitos.id, { onDelete: "cascade" }),
  productoId: uuid("producto_id")
    .notNull()
    .references(() => productos.id, { onDelete: "restrict" }),
  codigo: text("codigo").notNull(),
  descripcion: text("descripcion").notNull(),
  unidad: text("unidad").notNull(),
  cantidad: numeric("cantidad", { precision: 14, scale: 3, mode: "number" }).notNull(),
  orden: integer("orden").notNull(),
});

/** Puntos de venta de la empresa (tienen que estar dados de alta en ARCA con el mismo número) */
export const puntosVenta = pgTable(
  "puntos_venta",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    numero: integer("numero").notNull(),
    nombre: text("nombre").notNull(),
    activo: boolean("activo").notNull().default(true),
  },
  (t) => [uniqueIndex("puntos_venta_empresa_numero_uq").on(t.empresaId, t.numero)],
);

/** Conexión con ARCA de cada empresa. Sin certificado, factura en modo simulado (sin validez fiscal) */
export const configArca = pgTable("config_arca", {
  empresaId: uuid("empresa_id")
    .primaryKey()
    .references(() => empresas.id, { onDelete: "cascade" }),
  modo: text("modo").notNull().default("simulado"), // simulado | homologacion | produccion
  certificado: text("certificado"), // PEM
  /** Clave privada cifrada con la clave del servidor (nunca se guarda en claro) */
  clavePrivadaCifrada: text("clave_privada_cifrada"),
  certificadoVence: timestamp("certificado_vence", { withTimezone: true }),
  /** Ticket de acceso de WSAA (dura 12 h): se reutiliza para no pedir uno por cada factura */
  token: text("token"),
  sign: text("sign"),
  tokenVence: timestamp("token_vence", { withTimezone: true }),
  /** Pedido de certificado (CSR) generado y todavía sin certificado cargado */
  csr: text("csr"),
  /** Clave privada del CSR pendiente (cifrada); pasa a clavePrivadaCifrada al cargar el certificado */
  clavePendienteCifrada: text("clave_pendiente_cifrada"),
  ultimaConexion: timestamp("ultima_conexion", { withTimezone: true }),
  ultimoError: text("ultimo_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const comprobantes = pgTable(
  "comprobantes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    tipoCbte: integer("tipo_cbte").notNull(), // código ARCA: 1 FA, 6 FB, 11 FC, 3/8/13 NC
    puntoVenta: integer("punto_venta").notNull(),
    /** Se asigna al autorizarse (lo define ARCA) */
    numero: integer("numero"),
    fecha: text("fecha").notNull(),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "restrict" }),
    /** Copia de los datos del receptor al momento de emitir */
    receptor: jsonb("receptor").$type<{ razonSocial: string; cuit: string; condicionIva: string; domicilio: string | null }>().notNull(),
    concepto: integer("concepto").notNull(),
    fechaServicioDesde: text("fecha_servicio_desde"),
    fechaServicioHasta: text("fecha_servicio_hasta"),
    vencimiento: text("vencimiento").notNull(),
    condicionVenta: text("condicion_venta").notNull(),
    neto: numeric("neto", { precision: 14, scale: 2, mode: "number" }).notNull(),
    exento: numeric("exento", { precision: 14, scale: 2, mode: "number" }).notNull(),
    totalIva: numeric("total_iva", { precision: 14, scale: 2, mode: "number" }).notNull(),
    iva: jsonb("iva").$type<{ alicuota: number; baseImponible: number; importe: number }[]>().notNull(),
    total: numeric("total", { precision: 14, scale: 2, mode: "number" }).notNull(),
    estado: text("estado").notNull(), // Autorizado | Rechazado
    cae: text("cae"),
    caeVencimiento: text("cae_vencimiento"),
    errores: jsonb("errores").$type<{ codigo: number; mensaje: string }[]>().notNull().default([]),
    modo: text("modo").notNull(), // simulado | homologacion | produccion
    observaciones: text("observaciones"),
    /** Nota de crédito: comprobante que ajusta */
    asociadoId: uuid("asociado_id"),
    descontoStock: boolean("desconto_stock").notNull().default(false),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("comprobantes_numero_uq").on(t.empresaId, t.tipoCbte, t.puntoVenta, t.numero),
    index("comprobantes_empresa_fecha_idx").on(t.empresaId, t.fecha),
    index("comprobantes_cliente_idx").on(t.clienteId),
  ],
);

export const comprobanteItems = pgTable("comprobante_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  comprobanteId: uuid("comprobante_id")
    .notNull()
    .references(() => comprobantes.id, { onDelete: "cascade" }),
  productoId: uuid("producto_id").references(() => productos.id, { onDelete: "restrict" }),
  codigo: text("codigo"),
  descripcion: text("descripcion").notNull(),
  unidad: text("unidad").notNull(),
  cantidad: numeric("cantidad", { precision: 14, scale: 3, mode: "number" }).notNull(),
  precioUnitario: numeric("precio_unitario", { precision: 14, scale: 2, mode: "number" }).notNull(),
  bonificacion: numeric("bonificacion", { precision: 5, scale: 2, mode: "number" }).notNull().default(0),
  alicuotaIva: numeric("alicuota_iva", { precision: 4, scale: 1, mode: "number" }).notNull(),
  subtotal: numeric("subtotal", { precision: 14, scale: 2, mode: "number" }).notNull(),
  orden: integer("orden").notNull(),
});

/** Recibo de cobro: lo que pagó un cliente, con qué medios, y a qué facturas se aplica */
export const recibos = pgTable(
  "recibos",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    numero: integer("numero").notNull(),
    fecha: text("fecha").notNull(),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "restrict" }),
    total: numeric("total", { precision: 14, scale: 2, mode: "number" }).notNull(),
    observaciones: text("observaciones"),
    estado: text("estado").notNull().default("Emitido"), // Emitido | Anulado
    motivoAnulacion: text("motivo_anulacion"),
    anuladoEn: timestamp("anulado_en", { withTimezone: true }),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("recibos_empresa_numero_uq").on(t.empresaId, t.numero), index("recibos_cliente_idx").on(t.clienteId)],
);

export const reciboMedios = pgTable("recibo_medios", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  reciboId: uuid("recibo_id")
    .notNull()
    .references(() => recibos.id, { onDelete: "cascade" }),
  medio: text("medio").notNull(),
  importe: numeric("importe", { precision: 14, scale: 2, mode: "number" }).notNull(),
  /** N° de cheque, de operación, banco… */
  referencia: text("referencia"),
});

/** Cuánto de cada recibo se aplica a cada factura (lo que sobra queda a cuenta) */
export const imputaciones = pgTable(
  "imputaciones",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    reciboId: uuid("recibo_id")
      .notNull()
      .references(() => recibos.id, { onDelete: "cascade" }),
    comprobanteId: uuid("comprobante_id")
      .notNull()
      .references(() => comprobantes.id, { onDelete: "restrict" }),
    importe: numeric("importe", { precision: 14, scale: 2, mode: "number" }).notNull(),
  },
  (t) => [index("imputaciones_comprobante_idx").on(t.comprobanteId)],
);

export const presupuestos = pgTable(
  "presupuestos",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    numero: integer("numero").notNull(),
    fecha: text("fecha").notNull(),
    validoHasta: text("valido_hasta").notNull(),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "restrict" }),
    /** Pendiente | Aceptado | Rechazado | Facturado ("Vencido" se calcula por fecha) */
    estado: text("estado").notNull().default("Pendiente"),
    letra: text("letra").notNull(), // cómo se muestran los importes (A discrimina IVA)
    neto: numeric("neto", { precision: 14, scale: 2, mode: "number" }).notNull(),
    exento: numeric("exento", { precision: 14, scale: 2, mode: "number" }).notNull(),
    totalIva: numeric("total_iva", { precision: 14, scale: 2, mode: "number" }).notNull(),
    iva: jsonb("iva").$type<{ alicuota: number; baseImponible: number; importe: number }[]>().notNull(),
    total: numeric("total", { precision: 14, scale: 2, mode: "number" }).notNull(),
    condiciones: text("condiciones"),
    observaciones: text("observaciones"),
    comprobanteId: uuid("comprobante_id").references(() => comprobantes.id, { onDelete: "set null" }),
    version: version(),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("presupuestos_empresa_numero_uq").on(t.empresaId, t.numero), index("presupuestos_cliente_idx").on(t.clienteId)],
);

export const presupuestoItems = pgTable("presupuesto_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  presupuestoId: uuid("presupuesto_id")
    .notNull()
    .references(() => presupuestos.id, { onDelete: "cascade" }),
  productoId: uuid("producto_id").references(() => productos.id, { onDelete: "set null" }),
  codigo: text("codigo"),
  descripcion: text("descripcion").notNull(),
  unidad: text("unidad").notNull(),
  cantidad: numeric("cantidad", { precision: 14, scale: 3, mode: "number" }).notNull(),
  precioUnitario: numeric("precio_unitario", { precision: 14, scale: 2, mode: "number" }).notNull(),
  bonificacion: numeric("bonificacion", { precision: 5, scale: 2, mode: "number" }).notNull().default(0),
  alicuotaIva: numeric("alicuota_iva", { precision: 4, scale: 1, mode: "number" }).notNull(),
  subtotal: numeric("subtotal", { precision: 14, scale: 2, mode: "number" }).notNull(),
  orden: integer("orden").notNull(),
});

/**
 * Agenda genérica: cada empresa decide cómo se llama el evento (Turno, Visita, Orden…),
 * a qué se asigna (Profesional, Técnico, Sala, Vehículo…) y sus tipos.
 */
export const configAgenda = pgTable("config_agenda", {
  empresaId: uuid("empresa_id")
    .primaryKey()
    .references(() => empresas.id, { onDelete: "cascade" }),
  nombreEvento: text("nombre_evento").notNull().default("Visita"),
  nombreRecurso: text("nombre_recurso").notNull().default("Responsable"),
  /** Franja visible del calendario, en minutos desde las 00:00 */
  horaInicio: integer("hora_inicio").notNull().default(480),
  horaFin: integer("hora_fin").notNull().default(1140),
  tiposEvento: jsonb("tipos_evento").$type<string[]>().notNull().default([]),
  version: version(),
});

export const agendaRecursos = pgTable(
  "agenda_recursos",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    color: text("color").notNull(),
    /** Opcional: el usuario del sistema que corresponde a este recurso (recibe los avisos) */
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    activo: boolean("activo").notNull().default(true),
    version: version(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agenda_recursos_empresa_idx").on(t.empresaId)],
);

export const eventos = pgTable(
  "eventos",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    titulo: text("titulo").notNull(),
    tipo: text("tipo"),
    recursoId: uuid("recurso_id")
      .notNull()
      .references(() => agendaRecursos.id, { onDelete: "restrict" }),
    clienteId: uuid("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
    fecha: text("fecha").notNull(),
    /** "HH:MM" */
    inicio: text("inicio").notNull(),
    fin: text("fin").notNull(),
    /** Pendiente | Confirmado | Realizado | Cancelado */
    estado: text("estado").notNull().default("Pendiente"),
    lugar: text("lugar"),
    notas: text("notas"),
    version: version(),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("eventos_empresa_fecha_idx").on(t.empresaId, t.fecha), index("eventos_recurso_fecha_idx").on(t.recursoId, t.fecha), index("eventos_cliente_idx").on(t.clienteId)],
);

/** Embudo de ventas: negocios en curso con un cliente o un prospecto */
export const oportunidades = pgTable(
  "oportunidades",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    titulo: text("titulo").notNull(),
    /** Cliente existente, o bien un prospecto que todavía no se cargó como cliente */
    clienteId: uuid("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
    prospecto: text("prospecto"),
    contacto: text("contacto"),
    /** Nuevo | Contactado | Propuesta | Negociación | Ganada | Perdida */
    etapa: text("etapa").notNull().default("Nuevo"),
    monto: numeric("monto", { precision: 14, scale: 2, mode: "number" }).notNull().default(0),
    responsableId: uuid("responsable_id").references(() => usuarios.id, { onDelete: "set null" }),
    cierreEstimado: text("cierre_estimado"),
    /** Se completa al ganarla o perderla */
    fechaCierre: text("fecha_cierre"),
    motivoPerdida: text("motivo_perdida"),
    presupuestoId: uuid("presupuesto_id").references(() => presupuestos.id, { onDelete: "set null" }),
    notas: text("notas"),
    version: version(),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("oportunidades_empresa_etapa_idx").on(t.empresaId, t.etapa), index("oportunidades_cliente_idx").on(t.clienteId), index("oportunidades_presupuesto_idx").on(t.presupuestoId)],
);

/** Cómo envía emails cada empresa: por el servidor de la plataforma o por su propio SMTP */
export const configEmail = pgTable("config_email", {
  empresaId: uuid("empresa_id")
    .primaryKey()
    .references(() => empresas.id, { onDelete: "cascade" }),
  modo: text("modo").notNull().default("plataforma"), // plataforma | smtp
  host: text("host"),
  puerto: integer("puerto"),
  seguridad: text("seguridad"), // STARTTLS | SSL/TLS | Ninguna
  usuario: text("usuario"),
  /** Cifrada (AES-256-GCM): nunca se devuelve por la API */
  passwordCifrada: text("password_cifrada"),
  remitenteNombre: text("remitente_nombre"),
  responderA: text("responder_a"),
  verificado: boolean("verificado").notNull().default(false),
  ultimoError: text("ultimo_error"),
  enviarFacturaAlEmitir: boolean("enviar_factura_al_emitir").notNull().default(false),
  /** Recordar a los clientes las facturas por vencer (3 días antes) y vencidas */
  recordarFacturas: boolean("recordar_facturas").notNull().default(false),
  version: version(),
});

export const emailsEnviados = pgTable(
  "emails_enviados",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    para: text("para").notNull(),
    asunto: text("asunto").notNull(),
    /** Enviado | Error | Simulado (sin servidor configurado, en desarrollo) */
    estado: text("estado").notNull(),
    error: text("error"),
    /** Qué documento se mandó: comprobante | presupuesto | prueba */
    tipo: text("tipo").notNull(),
    refId: uuid("ref_id"),
    automatico: boolean("automatico").notNull().default(false),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("emails_empresa_fecha_idx").on(t.empresaId, t.createdAt), index("emails_ref_idx").on(t.refId)],
);

/** Link privado para que el cliente vea un documento sin tener usuario */
export const enlacesPublicos = pgTable(
  "enlaces_publicos",
  {
    token: text("token").primaryKey(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(), // comprobante | presupuesto
    refId: uuid("ref_id").notNull(),
    vistas: integer("vistas").notNull().default(0),
    ultimaVista: timestamp("ultima_vista", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("enlaces_ref_uq").on(t.empresaId, t.tipo, t.refId)],
);

/** Bitácora del cliente: notas libres con fecha y autor */
export const clienteNotas = pgTable(
  "cliente_notas",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    texto: text("texto").notNull(),
    /** Fijada: queda arriba de todo (ej. "pagar solo por transferencia") */
    fijada: boolean("fijada").notNull().default(false),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("cliente_notas_cliente_idx").on(t.clienteId, t.createdAt)],
);

/** Productos que usa habitualmente cada cliente (para acordarse y facturarlos rápido) */
export const clienteProductos = pgTable(
  "cliente_productos",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    productoId: uuid("producto_id")
      .notNull()
      .references(() => productos.id, { onDelete: "cascade" }),
    /** Cantidad habitual (opcional) y cada cuánto: "por semana", "por mes"… */
    cantidad: numeric("cantidad", { precision: 14, scale: 3, mode: "number" }),
    frecuencia: text("frecuencia"),
    nota: text("nota"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("cliente_productos_uq").on(t.clienteId, t.productoId)],
);

/** Suscripción de cada empresa: plan, prueba gratis y hasta cuándo está pago */
export const suscripciones = pgTable("suscripciones", {
  empresaId: uuid("empresa_id")
    .primaryKey()
    .references(() => empresas.id, { onDelete: "cascade" }),
  plan: text("plan").notNull().default("profesional"), // basico | profesional | empresa
  usuariosAdicionales: integer("usuarios_adicionales").notNull().default(0),
  periodo: text("periodo").notNull().default("mensual"), // mensual | anual
  /** Fin de la prueba gratis (aaaa-mm-dd) */
  pruebaHasta: text("prueba_hasta").notNull(),
  /** Pago hasta esta fecha inclusive (aaaa-mm-dd); null si nunca pagó */
  pagoHasta: text("pago_hasta"),
  /** Bajada de plan o de usuarios programada: se aplica en la próxima renovación (el período en curso ya está pago) */
  planProximo: text("plan_proximo"),
  adicionalesProximos: integer("adicionales_proximos"),
  /** Baja pedida (botón de baja): no se renueva; el acceso sigue hasta el vencimiento */
  bajaSolicitadaEn: timestamp("baja_solicitada_en", { withTimezone: true }),
  bajaCodigo: text("baja_codigo"),
  version: version(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pagosSuscripcion = pgTable(
  "pagos_suscripcion",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    /** Referencia propia que viaja al proveedor de pagos */
    referencia: text("referencia").notNull().unique(),
    plan: text("plan").notNull(),
    periodo: text("periodo").notNull(),
    usuariosAdicionales: integer("usuarios_adicionales").notNull(),
    /** periodo: paga un mes o un año | cambio: diferencia proporcional por subir de plan o sumar usuarios a mitad de período */
    tipo: text("tipo").notNull().default("periodo"),
    importeUsd: numeric("importe_usd", { precision: 10, scale: 2, mode: "number" }).notNull(),
    tipoCambio: numeric("tipo_cambio", { precision: 10, scale: 2, mode: "number" }).notNull(),
    importeArs: numeric("importe_ars", { precision: 14, scale: 2, mode: "number" }).notNull(),
    /** Pendiente | Aprobado | Rechazado */
    estado: text("estado").notNull().default("Pendiente"),
    proveedor: text("proveedor").notNull(), // mercadopago | simulado
    proveedorPagoId: text("proveedor_pago_id"),
    urlPago: text("url_pago"),
    /** Período que cubre (se completa al aprobarse) */
    desde: text("desde"),
    hasta: text("hasta"),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    aprobadoAt: timestamp("aprobado_at", { withTimezone: true }),
  },
  (t) => [index("pagos_suscripcion_empresa_idx").on(t.empresaId, t.createdAt)],
);

/** Pedidos por el "Botón de baja" y el "Botón de arrepentimiento" (obligatorios por ley), con código de constancia */
export const solicitudesLegales = pgTable(
  "solicitudes_legales",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tipo: text("tipo").notNull(), // baja | arrepentimiento
    codigo: text("codigo").notNull().unique(),
    empresaId: uuid("empresa_id").references(() => empresas.id, { onDelete: "set null" }),
    nombre: text("nombre").notNull(),
    email: text("email").notNull(),
    cuit: text("cuit"),
    motivo: text("motivo"),
    /** Pendiente | Resuelta */
    estado: text("estado").notNull().default("Pendiente"),
    nota: text("nota"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    resueltaEn: timestamp("resuelta_en", { withTimezone: true }),
  },
  (t) => [index("solicitudes_legales_estado_idx").on(t.estado, t.createdAt)],
);

/** Registro de lo que hace el administrador de la plataforma (para tener constancia de cada acción) */
export const auditoriaPlataforma = pgTable(
  "auditoria_plataforma",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    adminEmail: text("admin_email").notNull(),
    empresaId: uuid("empresa_id").references(() => empresas.id, { onDelete: "set null" }),
    accion: text("accion").notNull(),
    detalle: jsonb("detalle").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auditoria_plataforma_empresa_idx").on(t.empresaId, t.createdAt)],
);

/** Administradores de la plataforma (quien vende Prexacode): entran por /admin con su propio usuario, separados de las empresas */
export const adminsPlataforma = pgTable("admins_plataforma", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  nombre: text("nombre").notNull(),
  passwordHash: text("password_hash").notNull(),
  activo: boolean("activo").notNull().default(true),
  ultimoAcceso: timestamp("ultimo_acceso", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Pedidos de ayuda de las empresas a Prexacode ("no me anda tal cosa") */
export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    /** Número para hablar del ticket (#123), único en toda la plataforma */
    numero: serial("numero").notNull().unique(),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    asunto: text("asunto").notNull(),
    /** Problema | Consulta | Facturación y pagos | Sugerencia */
    categoria: text("categoria").notNull(),
    /** Abierto (espera respuesta de soporte) | Respondido (espera al cliente) | Cerrado */
    estado: text("estado").notNull().default("Abierto"),
    /** Pantalla en la que estaba cuando lo pidió */
    pantalla: text("pantalla"),
    sinLeerCliente: boolean("sin_leer_cliente").notNull().default(false),
    sinLeerSoporte: boolean("sin_leer_soporte").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tickets_empresa_idx").on(t.empresaId, t.createdAt), index("tickets_estado_idx").on(t.estado)],
);

export const ticketMensajes = pgTable(
  "ticket_mensajes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    /** cliente | soporte */
    autor: text("autor").notNull(),
    nombre: text("nombre").notNull(),
    texto: text("texto").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ticket_mensajes_ticket_idx").on(t.ticketId, t.createdAt)],
);

/** Empleados de la empresa (legajo simple): no es liquidación legal de sueldos */
export const empleados = pgTable(
  "empleados",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    apellido: text("apellido").notNull(),
    cuil: text("cuil"),
    puesto: text("puesto"),
    /** aaaa-mm-dd */
    fechaIngreso: text("fecha_ingreso").notNull(),
    fechaEgreso: text("fecha_egreso"),
    motivoEgreso: text("motivo_egreso"),
    /** Mensual | Quincenal | Semanal | Por hora */
    modalidad: text("modalidad").notNull().default("Mensual"),
    /** Sueldo básico del período (o valor de la hora) */
    sueldo: monto("sueldo").notNull(),
    telefono: text("telefono"),
    email: text("email"),
    domicilio: text("domicilio"),
    cbu: text("cbu"),
    obraSocial: text("obra_social"),
    notas: text("notas"),
    /** Activo | Baja */
    estado: text("estado").notNull().default("Activo"),
    version: version(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("empleados_empresa_idx").on(t.empresaId)],
);

/** Pagos al empleado: sueldo, adelanto, aguinaldo, vacaciones, bono. Cada uno con su comprobante interno numerado */
export const empleadoPagos = pgTable(
  "empleado_pagos",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    empleadoId: uuid("empleado_id")
      .notNull()
      .references(() => empleados.id, { onDelete: "cascade" }),
    numero: integer("numero").notNull(),
    /** Sueldo | Adelanto | Aguinaldo | Vacaciones | Bono | Otro */
    tipo: text("tipo").notNull(),
    /** Mes al que corresponde (aaaa-mm) */
    periodo: text("periodo").notNull(),
    fecha: text("fecha").notNull(),
    /** Renglones: positivos suman, negativos descuentan */
    conceptos: jsonb("conceptos").$type<{ concepto: string; importe: number }[]>().notNull(),
    total: monto("total").notNull(),
    medio: text("medio").notNull(),
    nota: text("nota"),
    /** Emitido | Anulado */
    estado: text("estado").notNull().default("Emitido"),
    motivoAnulacion: text("motivo_anulacion"),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("empleado_pagos_empleado_idx").on(t.empleadoId, t.periodo), uniqueIndex("empleado_pagos_numero_uq").on(t.empresaId, t.numero)],
);

/** Vacaciones, licencias y ausencias */
export const empleadoNovedades = pgTable(
  "empleado_novedades",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    empleadoId: uuid("empleado_id")
      .notNull()
      .references(() => empleados.id, { onDelete: "cascade" }),
    /** Vacaciones | Licencia | Enfermedad | Ausencia | Otro */
    tipo: text("tipo").notNull(),
    desde: text("desde").notNull(),
    hasta: text("hasta").notNull(),
    dias: integer("dias").notNull(),
    nota: text("nota"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("empleado_novedades_empleado_idx").on(t.empleadoId, t.desde)],
);

/** Links para elegir una contraseña nueva ("olvidé mi contraseña"): de un solo uso y con vencimiento */
export const recuperacionesClave = pgTable(
  "recuperaciones_clave",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    /** Solo la huella (SHA-256): el link en sí no se guarda */
    tokenHash: text("token_hash").notNull().unique(),
    expira: timestamp("expira", { withTimezone: true }).notNull(),
    usadoEn: timestamp("usado_en", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("recuperaciones_usuario_idx").on(t.usuarioId)],
);

/** Avisos automáticos ya mandados (para no repetirlos): "prueba-termina|2026-10-05", "factura-vencida|<id>" */
export const avisosEnviados = pgTable(
  "avisos_enviados",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    clave: text("clave").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("avisos_enviados_uq").on(t.empresaId, t.clave)],
);
