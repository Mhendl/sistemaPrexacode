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
} from "lucide-react";
import type { Acceso, NavItem, NavSection, Role } from "@/types";

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
      { path: "/soporte", label: "Ayuda y soporte", icon: LifeBuoy, permisos: [], description: "Pedidos de ayuda al equipo de Prexacode" },
    ],
  },
];

export const allNavItems: NavItem[] = navSections.flatMap((s) => s.items);

/** ¿Tiene alguno de estos permisos? (el administrador, todos; lista vacía: cualquiera) */
export const puede = (a: Acceso, ...alguno: string[]) => a.esAdmin || alguno.length === 0 || alguno.some((p) => a.permisos.includes(p));

export function sectionsFor(a: Acceso): NavSection[] {
  return navSections
    .map((s) => ({ ...s, items: s.items.filter((i) => puede(a, ...i.permisos)) }))
    .filter((s) => s.items.length > 0);
}

export function navItemForPath(pathname: string): NavItem | undefined {
  return allNavItems.find((i) => (i.path === "/" ? pathname === "/" : pathname.startsWith(i.path)));
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
