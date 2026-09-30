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
  /** gestion (Prexacode) o dental (CoreDental): define la marca, el menú y la dirección web */
  producto: text("producto").notNull().default("gestion"),
  ingresosBrutos: text("ingresos_brutos"),
  inicioActividades: text("inicio_actividades"), // aaaa-mm-dd
  codigoPostal: text("codigo_postal"),
  /** Fecha del último logo subido (sirve para refrescar la imagen en el navegador) */
  logoActualizado: timestamp("logo_actualizado", { withTimezone: true }),
  /** Suspendida por el administrador de la plataforma (uso indebido, fraude…): nadie de la empresa puede entrar */
  suspendidaEn: timestamp("suspendida_en", { withTimezone: true }),
  motivoSuspension: text("motivo_suspension"),
  /** Código para recomendar el sistema: quien se registra con él suma un mes gratis a esta empresa cuando paga */
  codigoReferido: text("codigo_referido").unique(),
  referidaPor: uuid("referida_por"),
  /** Cuándo se le dio el mes gratis a quien la recomendó (una sola vez) */
  referidoRecompensadoEn: timestamp("referido_recompensado_en", { withTimezone: true }),
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
    /** El "Consumidor final" sin identificar de las ventas de mostrador: uno por empresa, sin CUIT, no se edita */
    sinIdentificar: boolean("sin_identificar").notNull().default(false),
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
    receptor: jsonb("receptor").$type<{ razonSocial: string; cuit: string; condicionIva: string; domicilio: string | null; /** Paciente o consumidor final identificado con DNI */ dni?: string | null }>().notNull(),
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
  /** CoreDental: recordatorio por email al paciente, tantas horas antes del turno */
  recordatorioEmail: boolean("recordatorio_email").notNull().default(false),
  recordatorioHoras: integer("recordatorio_horas").notNull().default(24),
  /** CoreDental: avisarle al paciente por email cuando se le da un turno */
  avisoAlAgendar: boolean("aviso_al_agendar").notNull().default(false),
  /** CoreDental: los pacientes reservan su turno desde un link público (/reservar/<codigo>) */
  reservaOnline: boolean("reserva_online").notNull().default(false),
  reservaCodigo: text("reserva_codigo").unique(),
  /** Con cuántas horas de anticipación como mínimo, y hasta cuántos días adelante */
  reservaAnticipacionHoras: integer("reserva_anticipacion_horas").notNull().default(2),
  reservaDiasMax: integer("reserva_dias_max").notNull().default(30),
  /** Un mensaje para el paciente al reservar (ej.: "Traé tu credencial") */
  reservaMensaje: text("reserva_mensaje"),
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
    /** Días y horarios en que atiende (dia: 0 domingo … 6 sábado; puede tener dos franjas el mismo día). Vacío: sin restricción */
    horarios: jsonb("horarios").$type<{ dia: number; desde: string; hasta: string }[]>().notNull().default([]),
    /** Duración habitual de un turno, en minutos (para ofrecer los horarios libres) */
    duracionTurno: integer("duracion_turno").notNull().default(30),
    /** Si aparece para reservar turnos online (hace falta que tenga horarios cargados) */
    reservaOnline: boolean("reserva_online").notNull().default(true),
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
    /** CoreDental: el paciente del turno */
    pacienteId: uuid("paciente_id").references(() => pacientes.id, { onDelete: "set null" }),
    fecha: text("fecha").notNull(),
    /** "HH:MM" */
    inicio: text("inicio").notNull(),
    fin: text("fin").notNull(),
    /** Pendiente | Confirmado | Realizado | Cancelado */
    estado: text("estado").notNull().default("Pendiente"),
    lugar: text("lugar"),
    notas: text("notas"),
    /** Link para que el paciente confirme o cancele desde el email o WhatsApp */
    confirmacionToken: text("confirmacion_token").unique(),
    recordatorioEnviadoEn: timestamp("recordatorio_enviado_en", { withTimezone: true }),
    avisadoWhatsappEn: timestamp("avisado_whatsapp_en", { withTimezone: true }),
    /** Cuándo respondió el paciente desde el link (confirmó o canceló) */
    respuestaPacienteEn: timestamp("respuesta_paciente_en", { withTimezone: true }),
    /** Lo reservó el paciente desde el link de turnos online */
    reservadoOnline: boolean("reservado_online").notNull().default(false),
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

/* ================================================================ CoreDental (odontología) */

/** Obras sociales y prepagas con las que trabaja el consultorio */
export const obrasSociales = pgTable(
  "obras_sociales",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    activa: boolean("activa").notNull().default(true),
    version: version(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("obras_sociales_empresa_nombre_uq").on(t.empresaId, t.nombre)],
);

export const pacientes = pgTable(
  "pacientes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    apellido: text("apellido").notNull(),
    /** Solo dígitos. Puede faltar si se dio de alta rápido desde un turno */
    dni: text("dni"),
    fechaNacimiento: text("fecha_nacimiento"), // aaaa-mm-dd
    /** F | M | X */
    sexo: text("sexo"),
    telefono: text("telefono"),
    email: text("email"),
    domicilio: text("domicilio"),
    localidad: text("localidad"),
    obraSocialId: uuid("obra_social_id").references(() => obrasSociales.id, { onDelete: "restrict" }),
    plan: text("plan"),
    numeroAfiliado: text("numero_afiliado"),
    // Antecedentes (datos de salud: los ve quien tiene permiso de historia clínica)
    alergias: text("alergias"),
    medicacion: text("medicacion"),
    antecedentes: text("antecedentes"),
    intervenciones: text("intervenciones"),
    notas: text("notas"),
    /** Alta rápida desde un turno: faltan datos por completar */
    datosPendientes: boolean("datos_pendientes").notNull().default(false),
    /** Acepta recibir campañas (control, cumpleaños, novedades). Se da de baja con el link del email */
    recibeCampanas: boolean("recibe_campanas").notNull().default(true),
    /** Para el link de baja de las campañas (se crea la primera vez) */
    tokenCampanas: text("token_campanas").unique(),
    estado: text("estado").notNull().default("Activo"),
    version: version(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("pacientes_empresa_dni_uq").on(t.empresaId, t.dni).where(sql`${t.dni} is not null`),
    index("pacientes_empresa_apellido_idx").on(t.empresaId, t.apellido),
  ],
);

/**
 * Historia clínica: una evolución por consulta. No se modifica ni se borra (Ley 26.529, art. 18: inalterabilidad);
 * si hubo un error, se agrega otra evolución que lo aclare.
 */
export const evoluciones = pgTable(
  "evoluciones",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    pacienteId: uuid("paciente_id")
      .notNull()
      .references(() => pacientes.id, { onDelete: "restrict" }),
    fecha: text("fecha").notNull(),
    texto: text("texto").notNull(),
    /** Quién la escribió (queda el nombre aunque después se borre el usuario) */
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    autor: text("autor").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("evoluciones_paciente_idx").on(t.pacienteId, t.createdAt)],
);

/** Radiografías, fotos y estudios del paciente (el contenido va aparte, para no traerlo en las listas) */
export const pacienteArchivos = pgTable(
  "paciente_archivos",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    pacienteId: uuid("paciente_id")
      .notNull()
      .references(() => pacientes.id, { onDelete: "restrict" }),
    /** Radiografía | Foto | Estudio | Documento */
    tipo: text("tipo").notNull(),
    descripcion: text("descripcion"),
    nombreArchivo: text("nombre_archivo").notNull(),
    mime: text("mime").notNull(),
    tamano: integer("tamano").notNull(),
    fecha: text("fecha").notNull(),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    autor: text("autor").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("paciente_archivos_paciente_idx").on(t.pacienteId)],
);

export const pacienteArchivoDatos = pgTable("paciente_archivo_datos", {
  archivoId: uuid("archivo_id")
    .primaryKey()
    .references(() => pacienteArchivos.id, { onDelete: "cascade" }),
  datos: text("datos").notNull(), // base64
});

/** Nomenclador del consultorio: prácticas con su código y cómo se dibujan en el odontograma */
export const prestaciones = pgTable(
  "prestaciones",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    codigo: text("codigo").notNull(),
    nombre: text("nombre").notNull(),
    /** cara (se marca en una o más caras) | pieza (toda la pieza) | general (no va al odontograma) */
    alcance: text("alcance").notNull(),
    /** Cómo se dibuja: relleno (pinta las caras) | cruz | circulo | ausente | texto */
    simbolo: text("simbolo").notNull().default("relleno"),
    /** Para simbolo = texto: hasta 3 letras (TC, IMP…) */
    etiqueta: text("etiqueta"),
    activa: boolean("activa").notNull().default(true),
    version: version(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("prestaciones_empresa_codigo_uq").on(t.empresaId, t.codigo)],
);

/**
 * Odontograma: cada marca es una prestación en una pieza (y caras), con su estado.
 * existente = ya lo tenía al llegar · a_realizar = plan de tratamiento · realizado = hecho en el consultorio.
 * No se borra: una marca cargada por error se anula (queda en el historial).
 */
export const odontograma = pgTable(
  "odontograma",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    pacienteId: uuid("paciente_id")
      .notNull()
      .references(() => pacientes.id, { onDelete: "restrict" }),
    prestacionId: uuid("prestacion_id")
      .notNull()
      .references(() => prestaciones.id, { onDelete: "restrict" }),
    /** Nomenclatura FDI: 11–48 permanentes, 51–85 temporarias */
    pieza: integer("pieza").notNull(),
    /** V (vestibular), L (lingual/palatino), M (mesial), D (distal), O (oclusal/incisal) */
    caras: jsonb("caras").$type<string[]>().notNull().default([]),
    estado: text("estado").notNull(),
    fecha: text("fecha").notNull(),
    notas: text("notas"),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    autor: text("autor").notNull(),
    realizadoEn: text("realizado_en"),
    realizadoPor: text("realizado_por"),
    anuladoEn: timestamp("anulado_en", { withTimezone: true }),
    anuladoPor: text("anulado_por"),
    motivoAnulacion: text("motivo_anulacion"),
    version: version(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("odontograma_paciente_idx").on(t.pacienteId)],
);

/* ---------------------------------------------------------------- CoreDental: precios, presupuestos, cobros y caja */

/**
 * Lista de precios: cuánto paga el paciente y cuánto la obra social por cada prestación.
 * Sin obra social (null) es el precio particular.
 */
export const prestacionPrecios = pgTable(
  "prestacion_precios",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    prestacionId: uuid("prestacion_id")
      .notNull()
      .references(() => prestaciones.id, { onDelete: "cascade" }),
    obraSocialId: uuid("obra_social_id").references(() => obrasSociales.id, { onDelete: "cascade" }),
    /** Lo que paga el paciente (particular: el precio; con obra social: el coseguro) */
    precioPaciente: monto("precio_paciente").notNull().default(0),
    /** Lo que se le factura a la obra social */
    precioObraSocial: monto("precio_obra_social").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("prestacion_precios_particular_uq").on(t.prestacionId).where(sql`${t.obraSocialId} is null`),
    uniqueIndex("prestacion_precios_obra_uq").on(t.prestacionId, t.obraSocialId).where(sql`${t.obraSocialId} is not null`),
  ],
);

/** Presupuesto odontológico: prestaciones por pieza con el precio acordado con el paciente */
export const presupuestosDentales = pgTable(
  "presupuestos_dentales",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    pacienteId: uuid("paciente_id")
      .notNull()
      .references(() => pacientes.id, { onDelete: "restrict" }),
    numero: integer("numero").notNull(),
    fecha: text("fecha").notNull(),
    validoHasta: text("valido_hasta").notNull(),
    /** Obra social con la que se calcularon los precios (queda aunque el paciente cambie de cobertura) */
    obraSocialId: uuid("obra_social_id").references(() => obrasSociales.id, { onDelete: "set null" }),
    obraSocial: text("obra_social"),
    profesional: text("profesional").notNull(),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    /** Pendiente | Aceptado | Rechazado */
    estado: text("estado").notNull().default("Pendiente"),
    observaciones: text("observaciones"),
    total: monto("total").notNull(),
    version: version(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("presupuestos_dentales_numero_uq").on(t.empresaId, t.numero), index("presupuestos_dentales_paciente_idx").on(t.pacienteId)],
);

export const presupuestoDentalItems = pgTable(
  "presupuesto_dental_items",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    presupuestoId: uuid("presupuesto_id")
      .notNull()
      .references(() => presupuestosDentales.id, { onDelete: "cascade" }),
    prestacionId: uuid("prestacion_id")
      .notNull()
      .references(() => prestaciones.id, { onDelete: "restrict" }),
    pieza: integer("pieza"),
    caras: jsonb("caras").$type<string[]>().notNull().default([]),
    /** La marca "a realizar" del odontograma de la que salió (si salió de ahí) */
    odontogramaId: uuid("odontograma_id").references(() => odontograma.id, { onDelete: "set null" }),
    /** Lo que paga el paciente por este renglón (ya con el descuento) */
    importePaciente: monto("importe_paciente").notNull(),
    /** Lo que paga la obra social (informativo en el presupuesto; se liquida al realizarlo) */
    importeObraSocial: monto("importe_obra_social").notNull().default(0),
    descuento: numeric("descuento", { precision: 5, scale: 2, mode: "number" }).notNull().default(0),
    /** Cuando se realiza queda la prestación cargada a la cuenta del paciente */
    cargoId: uuid("cargo_id"),
    orden: integer("orden").notNull(),
  },
  (t) => [index("presupuesto_dental_items_presupuesto_idx").on(t.presupuestoId)],
);

/**
 * Prestación realizada: lo que se le cobra al paciente (su cuenta) y lo que se liquida a su obra social.
 * Sale del odontograma, de un presupuesto o se carga a mano (una consulta, una limpieza).
 */
export const cargosPaciente = pgTable(
  "cargos_paciente",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    pacienteId: uuid("paciente_id")
      .notNull()
      .references(() => pacientes.id, { onDelete: "restrict" }),
    prestacionId: uuid("prestacion_id")
      .notNull()
      .references(() => prestaciones.id, { onDelete: "restrict" }),
    pieza: integer("pieza"),
    caras: jsonb("caras").$type<string[]>().notNull().default([]),
    fecha: text("fecha").notNull(),
    profesional: text("profesional").notNull(),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    /** La cobertura al momento de la atención (para liquidar a la obra social) */
    obraSocialId: uuid("obra_social_id").references(() => obrasSociales.id, { onDelete: "set null" }),
    obraSocial: text("obra_social"),
    plan: text("plan"),
    numeroAfiliado: text("numero_afiliado"),
    importePaciente: monto("importe_paciente").notNull(),
    importeObraSocial: monto("importe_obra_social").notNull().default(0),
    odontogramaId: uuid("odontograma_id").references(() => odontograma.id, { onDelete: "set null" }),
    presupuestoItemId: uuid("presupuesto_item_id").references(() => presupuestoDentalItems.id, { onDelete: "set null" }),
    anuladoEn: timestamp("anulado_en", { withTimezone: true }),
    anuladoPor: text("anulado_por"),
    motivoAnulacion: text("motivo_anulacion"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("cargos_paciente_paciente_idx").on(t.pacienteId),
    index("cargos_paciente_empresa_fecha_idx").on(t.empresaId, t.fecha),
    uniqueIndex("cargos_paciente_odontograma_uq").on(t.odontogramaId).where(sql`${t.odontogramaId} is not null and ${t.anuladoEn} is null`),
  ],
);

/** Pago del paciente a su cuenta, con recibo interno numerado */
export const pagosPaciente = pgTable(
  "pagos_paciente",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    pacienteId: uuid("paciente_id")
      .notNull()
      .references(() => pacientes.id, { onDelete: "restrict" }),
    numero: integer("numero").notNull(),
    fecha: text("fecha").notNull(),
    importe: monto("importe").notNull(),
    medio: text("medio").notNull(),
    referencia: text("referencia"),
    notas: text("notas"),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    cobradoPor: text("cobrado_por").notNull(),
    /** Factura electrónica emitida por este pago (si se facturó) */
    comprobanteId: uuid("comprobante_id").references(() => comprobantes.id, { onDelete: "set null" }),
    anuladoEn: timestamp("anulado_en", { withTimezone: true }),
    anuladoPor: text("anulado_por"),
    motivoAnulacion: text("motivo_anulacion"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("pagos_paciente_numero_uq").on(t.empresaId, t.numero), index("pagos_paciente_paciente_idx").on(t.pacienteId), index("pagos_paciente_empresa_fecha_idx").on(t.empresaId, t.fecha)],
);

/** Gastos del consultorio (proveedores, laboratorio, alquiler, servicios…) */
export const gastos = pgTable(
  "gastos",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    fecha: text("fecha").notNull(),
    categoria: text("categoria").notNull(),
    descripcion: text("descripcion").notNull(),
    proveedor: text("proveedor"),
    importe: monto("importe").notNull(),
    medio: text("medio").notNull(),
    comprobante: text("comprobante"),
    /** Pago a un laboratorio (baja su saldo) */
    laboratorioId: uuid("laboratorio_id").references(() => laboratorios.id, { onDelete: "set null" }),
    /** Pago de honorarios a un profesional, por el mes (aaaa-mm) que se le liquida */
    honorariosUsuarioId: uuid("honorarios_usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    honorariosMes: text("honorarios_mes"),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    cargadoPor: text("cargado_por").notNull(),
    anuladoEn: timestamp("anulado_en", { withTimezone: true }),
    anuladoPor: text("anulado_por"),
    motivoAnulacion: text("motivo_anulacion"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("gastos_empresa_fecha_idx").on(t.empresaId, t.fecha)],
);

/** Otros ingresos de caja que no son pagos de pacientes (ej.: aporte del dueño, cambio) */
export const ingresosCaja = pgTable(
  "ingresos_caja",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    fecha: text("fecha").notNull(),
    concepto: text("concepto").notNull(),
    importe: monto("importe").notNull(),
    medio: text("medio").notNull(),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    cargadoPor: text("cargado_por").notNull(),
    anuladoEn: timestamp("anulado_en", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ingresos_caja_empresa_fecha_idx").on(t.empresaId, t.fecha)],
);

/** Caja diaria: apertura con el efectivo inicial y cierre con el arqueo (lo contado vs. lo esperado) */
export const cajas = pgTable(
  "cajas",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    fecha: text("fecha").notNull(),
    aperturaEfectivo: monto("apertura_efectivo").notNull(),
    abiertaPor: text("abierta_por").notNull(),
    abiertaEn: timestamp("abierta_en", { withTimezone: true }).notNull().defaultNow(),
    /** Al cerrar: el efectivo que tenía que haber y el que se contó */
    esperadoEfectivo: monto("esperado_efectivo"),
    contadoEfectivo: monto("contado_efectivo"),
    diferencia: monto("diferencia"),
    cerradaPor: text("cerrada_por"),
    cerradaEn: timestamp("cerrada_en", { withTimezone: true }),
    notas: text("notas"),
    version: version(),
  },
  (t) => [uniqueIndex("cajas_empresa_fecha_uq").on(t.empresaId, t.fecha)],
);

/* ---------------------------------------------------------------- CoreDental: laboratorios, consentimientos y periodontograma */

export const laboratorios = pgTable(
  "laboratorios",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    telefono: text("telefono"),
    email: text("email"),
    notas: text("notas"),
    activo: boolean("activo").notNull().default(true),
    version: version(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("laboratorios_empresa_nombre_uq").on(t.empresaId, t.nombre)],
);

/** Trabajo encargado a un laboratorio (una corona, una prótesis…): lo que se le debe y cuándo vuelve */
export const trabajosLaboratorio = pgTable(
  "trabajos_laboratorio",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    laboratorioId: uuid("laboratorio_id")
      .notNull()
      .references(() => laboratorios.id, { onDelete: "restrict" }),
    pacienteId: uuid("paciente_id").references(() => pacientes.id, { onDelete: "set null" }),
    descripcion: text("descripcion").notNull(),
    pieza: integer("pieza"),
    fechaEnvio: text("fecha_envio").notNull(),
    fechaPrevista: text("fecha_prevista"),
    fechaRecibido: text("fecha_recibido"),
    /** Enviado | Recibido | Cancelado */
    estado: text("estado").notNull().default("Enviado"),
    importe: monto("importe").notNull(),
    profesional: text("profesional").notNull(),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    notas: text("notas"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("trabajos_laboratorio_lab_idx").on(t.laboratorioId), index("trabajos_laboratorio_paciente_idx").on(t.pacienteId)],
);

/** Plantillas de consentimiento informado del consultorio (texto con {paciente}, {dni}, {profesional}…) */
export const plantillasConsentimiento = pgTable("plantillas_consentimiento", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  empresaId: uuid("empresa_id")
    .notNull()
    .references(() => empresas.id, { onDelete: "cascade" }),
  titulo: text("titulo").notNull(),
  texto: text("texto").notNull(),
  activa: boolean("activa").notNull().default(true),
  version: version(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Consentimiento informado firmado (Ley 26.529, arts. 5 a 10): el texto tal como se leyó, las firmas,
 * quién firmó, cuándo y desde dónde. No se modifica; el paciente lo puede revocar (queda registrado).
 */
export const consentimientos = pgTable(
  "consentimientos",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    pacienteId: uuid("paciente_id")
      .notNull()
      .references(() => pacientes.id, { onDelete: "restrict" }),
    plantillaId: uuid("plantilla_id").references(() => plantillasConsentimiento.id, { onDelete: "set null" }),
    titulo: text("titulo").notNull(),
    texto: text("texto").notNull(),
    profesional: text("profesional").notNull(),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    /** Quien firma: el paciente, o su madre, padre, tutor o representante */
    firmante: text("firmante").notNull(),
    firmanteDni: text("firmante_dni"),
    vinculo: text("vinculo").notNull(),
    /** Firmas dibujadas en pantalla (imagen PNG en base64) */
    firmaPaciente: text("firma_paciente").notNull(),
    firmaProfesional: text("firma_profesional"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    firmadoEn: timestamp("firmado_en", { withTimezone: true }).notNull().defaultNow(),
    revocadoEn: timestamp("revocado_en", { withTimezone: true }),
    revocadoPor: text("revocado_por"),
    motivoRevocacion: text("motivo_revocacion"),
  },
  (t) => [index("consentimientos_paciente_idx").on(t.pacienteId)],
);

/**
 * Periodontograma: un examen periodontal completo en una fecha. Por pieza, 6 sitios
 * (3 vestibulares: distal, medio, mesial · 3 linguales/palatinos): profundidad de sondaje, margen gingival,
 * sangrado y placa; más movilidad y furca. Como la historia clínica, no se modifica: se hace otro examen.
 */
export const periodontogramas = pgTable(
  "periodontogramas",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    pacienteId: uuid("paciente_id")
      .notNull()
      .references(() => pacientes.id, { onDelete: "restrict" }),
    fecha: text("fecha").notNull(),
    profesional: text("profesional").notNull(),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    notas: text("notas"),
    piezas: jsonb("piezas")
      .$type<Record<string, { ausente?: boolean; ps: (number | null)[]; mg: (number | null)[]; sangrado: boolean[]; placa: boolean[]; movilidad: number; furca: number }>>()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("periodontogramas_paciente_idx").on(t.pacienteId, t.fecha)],
);

/* ---------------------------------------------------------------- Agenda: bloqueos y honorarios */

/** Horario bloqueado (vacaciones, congreso, feriado): no se dan turnos. Sin recurso: bloquea a todos */
export const agendaBloqueos = pgTable(
  "agenda_bloqueos",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    recursoId: uuid("recurso_id").references(() => agendaRecursos.id, { onDelete: "cascade" }),
    desde: text("desde").notNull(),
    hasta: text("hasta").notNull(),
    /** Sin horas: el día completo */
    horaDesde: text("hora_desde"),
    horaHasta: text("hora_hasta"),
    motivo: text("motivo").notNull(),
    creadoPor: text("creado_por").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("agenda_bloqueos_empresa_idx").on(t.empresaId, t.desde)],
);

/** Honorarios por porcentaje de cada profesional (CoreDental): sobre lo que produjo en el mes */
export const honorariosConfig = pgTable(
  "honorarios_config",
  {
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    usuarioId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    porcentaje: numeric("porcentaje", { precision: 5, scale: 2, mode: "number" }).notNull(),
    /** Si se le descuenta el costo de los trabajos de laboratorio que encargó */
    descontarLaboratorio: boolean("descontar_laboratorio").notNull().default(true),
    version: version(),
  },
  (t) => [primaryKey({ columns: [t.empresaId, t.usuarioId] })],
);

/* ---------------------------------------------------------------- CoreDental: campañas a pacientes */

/** Un envío masivo a un grupo de pacientes (control, cumpleaños, deudores…), por email o WhatsApp */
export const campanas = pgTable(
  "campanas",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    nombre: text("nombre").notNull(),
    /** Email | WhatsApp */
    canal: text("canal").notNull(),
    /** todos | sin_visita | cumpleanos | deudores | obra_social */
    segmento: text("segmento").notNull(),
    /** Meses sin venir, mes del cumpleaños o la obra social */
    parametro: text("parametro"),
    asunto: text("asunto"),
    mensaje: text("mensaje").notNull(),
    destinatarios: integer("destinatarios").notNull(),
    creadoPor: text("creado_por").notNull(),
    usuarioId: uuid("usuario_id").references(() => usuarios.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("campanas_empresa_idx").on(t.empresaId, t.createdAt)],
);

export const campanaEnvios = pgTable(
  "campana_envios",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    campanaId: uuid("campana_id")
      .notNull()
      .references(() => campanas.id, { onDelete: "cascade" }),
    empresaId: uuid("empresa_id")
      .notNull()
      .references(() => empresas.id, { onDelete: "cascade" }),
    pacienteId: uuid("paciente_id")
      .notNull()
      .references(() => pacientes.id, { onDelete: "cascade" }),
    /** El email o el teléfono al que se mandó */
    destino: text("destino").notNull(),
    /** El mensaje ya personalizado */
    texto: text("texto").notNull(),
    /** Pendiente | Enviado | Simulado | Error */
    estado: text("estado").notNull().default("Pendiente"),
    error: text("error"),
    enviadoEn: timestamp("enviado_en", { withTimezone: true }),
  },
  (t) => [index("campana_envios_campana_idx").on(t.campanaId), index("campana_envios_empresa_idx").on(t.empresaId, t.enviadoEn)],
);

/* ---------------------------------------------------------------- Interesados (pedidos de demo desde las landings) */

/** Alguien que pidió una demo o que lo contacten, desde la landing de Prexacode o de CoreDental */
export const interesados = pgTable(
  "interesados",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    /** gestion | dental */
    producto: text("producto").notNull(),
    nombre: text("nombre").notNull(),
    email: text("email").notNull(),
    telefono: text("telefono"),
    /** Nombre de la empresa o del consultorio */
    empresa: text("empresa"),
    cargo: text("cargo"),
    /** Cuántos profesionales o empleados */
    tamano: text("tamano"),
    mensaje: text("mensaje"),
    /** De dónde vino (la página y la campaña, si viene con utm_…) */
    origen: text("origen"),
    /** Nuevo | Contactado | Cliente | Descartado */
    estado: text("estado").notNull().default("Nuevo"),
    nota: text("nota"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    actualizadoEn: timestamp("actualizado_en", { withTimezone: true }),
  },
  (t) => [index("interesados_estado_idx").on(t.estado, t.createdAt)],
);
