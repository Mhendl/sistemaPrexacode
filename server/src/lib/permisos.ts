/**
 * Permisos que se pueden dar a un rol, agrupados por sección (así se muestran en la pantalla de roles).
 * El rol Administrador tiene todo, incluido lo que no se puede delegar: usuarios, roles, plan y pagos.
 */
export const SECCIONES_PERMISOS = [
  {
    seccion: "Pacientes",
    producto: "dental",
    permisos: [
      { id: "pacientes.ver", nombre: "Ver pacientes y sus datos de contacto" },
      { id: "pacientes.editar", nombre: "Dar de alta y editar pacientes" },
    ],
  },
  {
    seccion: "Historia clínica",
    producto: "dental",
    permisos: [
      { id: "historia.ver", nombre: "Ver historia clínica, antecedentes, odontograma e imágenes" },
      { id: "historia.editar", nombre: "Cargar evoluciones, odontograma e imágenes" },
    ],
  },
  {
    seccion: "Laboratorios",
    producto: "dental",
    permisos: [
      { id: "laboratorios.ver", nombre: "Ver laboratorios, trabajos y saldos" },
      { id: "laboratorios.editar", nombre: "Encargar y recibir trabajos, y pagar a laboratorios" },
    ],
  },
  { seccion: "Clientes", permisos: [{ id: "clientes.ver", nombre: "Ver clientes y su ficha" }, { id: "clientes.editar", nombre: "Crear, editar y borrar clientes" }] },
  { seccion: "Oportunidades", producto: "gestion", permisos: [{ id: "oportunidades.ver", nombre: "Ver el embudo de ventas" }, { id: "oportunidades.editar", nombre: "Crear y mover oportunidades" }] },
  { seccion: "Agenda", permisos: [{ id: "agenda.ver", nombre: "Ver la agenda" }, { id: "agenda.editar", nombre: "Agendar, mover y cancelar" }] },
  { seccion: "Presupuestos", permisos: [{ id: "presupuestos.ver", nombre: "Ver presupuestos" }, { id: "presupuestos.editar", nombre: "Crear, editar y facturar presupuestos" }] },
  { seccion: "Facturación", permisos: [{ id: "facturacion.ver", nombre: "Ver facturas y notas de crédito" }, { id: "facturacion.emitir", nombre: "Emitir facturas y notas de crédito" }] },
  {
    seccion: "Cobranzas",
    permisos: [
      { id: "cobranzas.ver", nombre: "Ver deudas y cobros" },
      { id: "cobranzas.cobrar", nombre: "Registrar cobros" },
      { id: "cobranzas.anular", nombre: "Anular recibos" },
    ],
  },
  {
    seccion: "Remitos",
    producto: "gestion",
    permisos: [
      { id: "remitos.ver", nombre: "Ver remitos" },
      { id: "remitos.emitir", nombre: "Emitir remitos" },
      { id: "remitos.anular", nombre: "Anular remitos" },
    ],
  },
  {
    seccion: "Productos y stock",
    producto: "gestion",
    permisos: [
      { id: "productos.ver", nombre: "Ver productos, precios y stock" },
      { id: "productos.editar", nombre: "Crear y editar productos y precios" },
      { id: "stock.movimientos", nombre: "Registrar ingresos, egresos y ajustes de stock" },
    ],
  },
  { seccion: "Reportes", permisos: [{ id: "reportes.ver", nombre: "Ver reportes y Libro IVA" }] },
  { seccion: "Importar y exportar", permisos: [{ id: "importar.clientes", nombre: "Importar clientes" }, { id: "importar.productos", nombre: "Importar productos y stock" }] },
  { seccion: "Empleados y sueldos", permisos: [{ id: "empleados.ver", nombre: "Ver empleados y sueldos" }, { id: "empleados.editar", nombre: "Cargar empleados y registrar pagos" }] },
  { seccion: "Configuración", permisos: [{ id: "configuracion", nombre: "Datos de la empresa, ARCA, email, WhatsApp y agenda" }] },
] as const;

export type Permiso = (typeof SECCIONES_PERMISOS)[number]["permisos"][number]["id"];
export const PERMISOS: Permiso[] = SECCIONES_PERMISOS.flatMap((s) => s.permisos.map((p) => p.id));

/** Para editar hace falta poder ver: al guardar un rol se agregan solos */
export const REQUIERE: Partial<Record<Permiso, Permiso[]>> = {
  "pacientes.editar": ["pacientes.ver"],
  "laboratorios.editar": ["laboratorios.ver"],
  "historia.ver": ["pacientes.ver"],
  "historia.editar": ["historia.ver", "pacientes.ver"],
  "clientes.editar": ["clientes.ver"],
  "oportunidades.editar": ["oportunidades.ver"],
  "agenda.editar": ["agenda.ver"],
  "presupuestos.editar": ["presupuestos.ver", "productos.ver"],
  "facturacion.emitir": ["facturacion.ver", "productos.ver"],
  "cobranzas.cobrar": ["cobranzas.ver"],
  "cobranzas.anular": ["cobranzas.ver"],
  "remitos.emitir": ["remitos.ver", "productos.ver"],
  "remitos.anular": ["remitos.ver"],
  "productos.editar": ["productos.ver"],
  "stock.movimientos": ["productos.ver"],
  "importar.clientes": ["clientes.editar", "clientes.ver"],
  "importar.productos": ["productos.editar", "productos.ver"],
  "empleados.editar": ["empleados.ver"],
};

export function completarPermisos(lista: string[]): Permiso[] {
  const s = new Set(lista.filter((p): p is Permiso => (PERMISOS as string[]).includes(p)));
  for (const p of [...s]) for (const r of REQUIERE[p] ?? []) s.add(r);
  return PERMISOS.filter((p) => s.has(p));
}

/** Las secciones de permisos que tiene cada producto (las que no dicen producto son de los dos) */
export const seccionesDe = (producto: string) => SECCIONES_PERMISOS.filter((s) => !("producto" in s) || s.producto === producto);

/** Roles que trae cada empresa nueva (los de siempre). El de administrador no se puede recortar ni borrar */
export const ROLES_PREARMADOS = {
  admin: { nombre: "Administrador", descripcion: "Acceso completo, incluidos usuarios, roles, plan y pagos", esAdmin: true, permisos: PERMISOS },
  ventas: {
    nombre: "Ventas",
    descripcion: "Clientes, oportunidades, agenda, presupuestos, facturación, cobranzas y reportes",
    esAdmin: false,
    permisos: completarPermisos(["clientes.editar", "oportunidades.editar", "agenda.editar", "presupuestos.editar", "facturacion.emitir", "cobranzas.cobrar", "remitos.emitir", "reportes.ver", "importar.clientes"]),
  },
  operaciones: {
    nombre: "Operaciones",
    descripcion: "Agenda, productos, stock, movimientos y remitos",
    esAdmin: false,
    permisos: completarPermisos(["agenda.editar", "productos.editar", "stock.movimientos", "remitos.emitir", "remitos.anular", "importar.productos"]),
  },
} as const;
export type Prearmado = keyof typeof ROLES_PREARMADOS;

/** Roles que trae un consultorio (CoreDental): la recepción no ve la historia clínica (datos de salud) */
export const ROLES_PREARMADOS_DENTAL = {
  admin: ROLES_PREARMADOS.admin,
  profesional: {
    nombre: "Profesional",
    descripcion: "Pacientes, historia clínica, odontograma, turnos y presupuestos",
    esAdmin: false,
    permisos: completarPermisos(["pacientes.editar", "historia.editar", "agenda.editar", "presupuestos.editar", "facturacion.ver", "cobranzas.ver", "reportes.ver", "laboratorios.editar"]),
  },
  recepcion: {
    nombre: "Recepción",
    descripcion: "Pacientes, turnos, presupuestos, cobros y facturación. No ve la historia clínica",
    esAdmin: false,
    permisos: completarPermisos(["pacientes.editar", "agenda.editar", "presupuestos.ver", "facturacion.emitir", "cobranzas.cobrar", "laboratorios.editar"]),
  },
} as const;
