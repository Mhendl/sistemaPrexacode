import {
  BarChart3,
  Boxes,
  CalendarDays,
  FileText,
  Handshake,
  LayoutDashboard,
  Receipt,
  Settings,
  Users,
  Wallet,
  ArrowLeftRight,
  FileSpreadsheet,
  Truck,
  LifeBuoy,
  IdCard,
  BookOpen,
  Contact,
  Stethoscope,
  FlaskConical,
  Landmark,
  ReceiptText,
} from "lucide-react";
import { productoActivo, type ProductoId } from "@/config/brand";
import type { Acceso, NavItem, NavSection, Role } from "@/types";

/** Menú de Prexacode (gestión para empresas) */
export const navSections: NavSection[] = [
  {
    title: "General",
    items: [
      { path: "/", label: "Inicio", icon: LayoutDashboard, permisos: [], description: "Resumen del negocio" },
    ],
  },
  {
    title: "CRM",
    items: [
      { path: "/clientes", label: "Clientes", icon: Users, permisos: ["clientes.ver"], description: "Cartera de clientes" },
      { path: "/oportunidades", label: "Oportunidades", icon: Handshake, permisos: ["oportunidades.ver"], description: "Embudo de ventas" },
      { path: "/agenda", label: "Agenda", icon: CalendarDays, permisos: ["agenda.ver"], description: "Turnos, visitas y tareas" },
    ],
  },
  {
    title: "Ventas",
    items: [
      { path: "/remitos", label: "Remitos", icon: Truck, permisos: ["remitos.ver"], description: "Entregas de mercadería" },
      { path: "/facturacion", label: "Facturación", icon: Receipt, permisos: ["facturacion.ver"], description: "Comprobantes electrónicos ARCA" },
      { path: "/presupuestos", label: "Presupuestos", icon: FileText, permisos: ["presupuestos.ver"], description: "Cotizaciones a clientes" },
      { path: "/cobranzas", label: "Cobranzas", icon: Wallet, permisos: ["cobranzas.ver"], description: "Cuentas corrientes y pagos" },
    ],
  },
  {
    title: "Inventario",
    items: [
      { path: "/productos", label: "Productos y stock", icon: Boxes, permisos: ["productos.ver"], description: "Catálogo, precios y existencias" },
      { path: "/movimientos", label: "Movimientos", icon: ArrowLeftRight, permisos: ["stock.movimientos"], description: "Ingresos, egresos y ajustes de stock" },
    ],
  },
  {
    title: "Personal",
    items: [
      { path: "/empleados", label: "Empleados y sueldos", icon: IdCard, permisos: ["empleados.ver"], description: "Legajos, sueldos, adelantos y vacaciones" },
    ],
  },
  {
    title: "Análisis",
    items: [
      { path: "/reportes", label: "Reportes", icon: BarChart3, permisos: ["reportes.ver"], description: "Ventas y Libro IVA" },
    ],
  },
  {
    title: "Sistema",
    items: [
      { path: "/importar-exportar", label: "Importar y exportar", icon: FileSpreadsheet, permisos: ["clientes.ver", "productos.ver"], description: "Planillas de Excel y CSV" },
      { path: "/configuracion", label: "Configuración", icon: Settings, permisos: ["configuracion"], description: "Empresa, usuarios e integraciones" },
      { path: "/ayuda", label: "Centro de ayuda", icon: BookOpen, permisos: [], description: "Qué hace cada cosa y cómo se hace" },
      { path: "/soporte", label: "Soporte", icon: LifeBuoy, permisos: [], description: "Pedidos de ayuda al equipo de Prexacode" },
    ],
  },
];

const sistema = navSections.find((s) => s.title === "Sistema")!;
const item = (path: string) => navSections.flatMap((s) => s.items).find((i) => i.path === path)!;

/**
 * Menú de CoreDental (consultorios odontológicos). Reusa los módulos comunes (agenda, presupuestos, facturación,
 * cobranzas, sueldos); los propios de odontología se van construyendo por etapas.
 */
const seccionesDental: NavSection[] = [
  { title: "General", items: [item("/")] },
  {
    title: "Pacientes",
    items: [
      {
        path: "/pacientes",
        label: "Pacientes",
        icon: Contact,
        permisos: [],
        description: "Ficha, historia clínica y odontograma de cada paciente",
        features: [
          "Ficha del paciente con DNI, obra social, plan y número de afiliado",
          "Antecedentes, alergias y medicación habitual",
          "Historia clínica con notas de evolución por consulta, radiografías e imágenes",
          "Odontograma interactivo por pieza y cara, con lo realizado y lo que falta",
          "Periodontograma",
          "Consentimientos informados firmados en pantalla",
        ],
      },
      { ...item("/agenda"), label: "Turnos", description: "Agenda de turnos por profesional" },
    ],
  },
  {
    title: "Clínica",
    items: [
      {
        path: "/prestaciones",
        label: "Prestaciones y obras sociales",
        icon: Stethoscope,
        permisos: [],
        description: "Nomenclador de prácticas y precios por obra social",
        features: ["Prácticas con código, por cara, por pieza o por consulta", "Obras sociales y planes", "Precio para la obra social y para el paciente en cada práctica", "Los presupuestos y los cobros toman el precio solo"],
      },
      {
        path: "/laboratorios",
        label: "Laboratorios",
        icon: FlaskConical,
        permisos: [],
        description: "Trabajos enviados y cuenta corriente con cada laboratorio",
        features: ["Trabajos por paciente y profesional", "Pagos al laboratorio, parciales o totales", "Saldo con cada laboratorio"],
      },
    ],
  },
  {
    title: "Cobros",
    items: [
      item("/presupuestos"),
      item("/facturacion"),
      item("/cobranzas"),
      {
        path: "/caja",
        label: "Caja diaria",
        icon: Landmark,
        permisos: [],
        description: "Apertura, ingresos, egresos y cierre de caja",
        features: ["Apertura con efectivo y banco", "Ingresos por medio de pago", "Gastos del día", "Cierre con diferencia de caja"],
      },
      {
        path: "/gastos",
        label: "Gastos",
        icon: ReceiptText,
        permisos: [],
        description: "Gastos y proveedores del consultorio",
        features: ["Gastos por categoría: proveedores, laboratorio, alquiler, servicios", "Informe financiero: cobrado, gastado y resultado"],
      },
    ],
  },
  { title: "Equipo", items: [{ ...item("/empleados"), label: "Equipo y sueldos", description: "Profesionales, secretaría, sueldos y porcentajes" }] },
  { title: "Análisis", items: [item("/reportes")] },
  sistema,
];

const SECCIONES: Record<ProductoId, NavSection[]> = { gestion: navSections, dental: seccionesDental };

export const seccionesDe = (p: ProductoId = productoActivo()) => SECCIONES[p];
export const itemsDe = (p: ProductoId = productoActivo()) => SECCIONES[p].flatMap((s) => s.items);

/** Todos los módulos de todos los productos (sin repetir): para armar las rutas */
export const allNavItems: NavItem[] = [...new Map([...itemsDe("gestion"), ...itemsDe("dental")].map((i) => [i.path, i])).values()];

/** ¿Tiene alguno de estos permisos? (el administrador, todos; lista vacía: cualquiera) */
export const puede = (a: Acceso, ...alguno: string[]) => a.esAdmin || alguno.length === 0 || alguno.some((p) => a.permisos.includes(p));

export function sectionsFor(a: Acceso, p: ProductoId = productoActivo()): NavSection[] {
  return seccionesDe(p)
    .map((s) => ({ ...s, items: s.items.filter((i) => puede(a, ...i.permisos)) }))
    .filter((s) => s.items.length > 0);
}

export function navItemForPath(pathname: string): NavItem | undefined {
  return itemsDe().find((i) => (i.path === "/" ? pathname === "/" : pathname.startsWith(i.path)));
}

/** Pantallas de carga: además de ver el módulo, piden el permiso de cargar */
const PANTALLAS_DE_CARGA: { patron: RegExp; permisos: string[] }[] = [
  { patron: /^\/facturacion\/nueva/, permisos: ["facturacion.emitir"] },
  { patron: /^\/presupuestos\/(nuevo|[^/]+\/editar)/, permisos: ["presupuestos.editar"] },
  { patron: /^\/cobranzas\/nuevo/, permisos: ["cobranzas.cobrar"] },
  { patron: /^\/remitos\/nuevo/, permisos: ["remitos.emitir"] },
];

export function canAccess(a: Acceso, path: string): boolean {
  const carga = PANTALLAS_DE_CARGA.find((c) => c.patron.test(path));
  if (carga && !puede(a, ...carga.permisos)) return false;
  const item = navItemForPath(path);
  return !item || puede(a, ...item.permisos);
}

export const rolLabel: Record<Role, string> = {
  admin: "Administrador",
  ventas: "Ventas",
  operaciones: "Operaciones",
  personalizado: "Personalizado",
};

export const descripcionRoles: Record<Role, string> = {
  admin: "Acceso completo, incluida la configuración, los usuarios y el plan",
  ventas: "Clientes, oportunidades, agenda, facturación, presupuestos, cobranzas y reportes",
  operaciones: "Agenda, productos, stock y movimientos",
  personalizado: "Permisos elegidos por el administrador",
};
