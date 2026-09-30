import { ReservaPage } from "@/modules/agenda/ReservaPage";
import { HonorariosPage } from "@/modules/consultorio/HonorariosPage";
import { LaboratorioPage, LaboratoriosPage } from "@/modules/clinica/LaboratoriosPage";
import { TurnoPublicoPage } from "@/modules/agenda/TurnoPublicoPage";
import { useRole } from "@/context/AuthProvider";
import { PrestacionesPage } from "@/modules/consultorio/PrestacionesPage";
import { PresupuestoDentalPage, PresupuestosDentalesPage } from "@/modules/consultorio/Presupuestos";
import { CajaPage, CobrosConsultorioPage, GastosPage, LiquidacionPage, ReciboPacientePage } from "@/modules/consultorio/Paginas";
import { PacientesPage } from "@/modules/pacientes/PacientesPage";
import { PacienteDetallePage } from "@/modules/pacientes/PacienteDetallePage";
import { AyudaPage } from "@/modules/ayuda/Ayuda";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/layout/AppLayout";
import { ModulePlaceholder } from "@/components/shared/ModulePlaceholder";
import { AuthProvider, useAuth } from "@/context/AuthProvider";
import { ThemeProvider } from "@/context/ThemeProvider";
import { allNavItems, canAccess } from "@/lib/navigation";
import { AgendaPage } from "@/modules/agenda/AgendaPage";
import { LoginPage } from "@/modules/auth/LoginPage";
import { LegalPage } from "@/modules/legal/LegalPage";
import { SolicitudLegalPage } from "@/modules/legal/SolicitudLegalPage";
import { DocumentoPublicoPage } from "@/modules/documentos/DocumentoPublicoPage";
import { RegistroPage } from "@/modules/auth/RegistroPage";
import { OlvideClavePage, RestablecerClavePage } from "@/modules/auth/RecuperarClavePages";
import { ClienteDetallePage } from "@/modules/clientes/ClienteDetallePage";
import { ClientesPage } from "@/modules/clientes/ClientesPage";
import { ImportarExportarPage } from "@/modules/datos/ImportarExportarPage";
import { PreferenciasNotificacionesPage } from "@/modules/cuenta/PreferenciasNotificacionesPage";
import { ConfiguracionPage } from "@/modules/configuracion/ConfiguracionPage";
import { PagoSimuladoPage } from "@/modules/configuracion/PagoSimuladoPage";
import { AdminApp } from "@/modules/admin/AdminApp";
import { SoportePage, TicketPage } from "@/modules/soporte/SoportePage";
import { EmpleadosPage } from "@/modules/empleados/EmpleadosPage";
import { EmpleadoDetallePage } from "@/modules/empleados/EmpleadoDetallePage";
import { PagoEmpleadoPage } from "@/modules/empleados/PagoEmpleadoPage";
import { CobranzasPage } from "@/modules/cobranzas/CobranzasPage";
import { NuevoReciboPage } from "@/modules/cobranzas/NuevoReciboPage";
import { ReciboDetallePage } from "@/modules/cobranzas/ReciboDetallePage";
import { ComprobanteDetallePage } from "@/modules/facturacion/ComprobanteDetallePage";
import { FacturacionPage } from "@/modules/facturacion/FacturacionPage";
import { NuevaFacturaPage } from "@/modules/facturacion/NuevaFacturaPage";
import { InicioPage } from "@/modules/inicio/InicioPage";
import { PresupuestoDetallePage } from "@/modules/presupuestos/PresupuestoDetallePage";
import { PresupuestoFormPage } from "@/modules/presupuestos/PresupuestoFormPage";
import { PresupuestosPage } from "@/modules/presupuestos/PresupuestosPage";
import { OportunidadesPage } from "@/modules/oportunidades/OportunidadesPage";
import { MovimientosPage } from "@/modules/productos/MovimientosPage";
import { ProductoDetallePage } from "@/modules/productos/ProductoDetallePage";
import { ProductosPage } from "@/modules/productos/ProductosPage";
import { ReportesPage } from "@/modules/reportes/ReportesPage";
import { NuevoRemitoPage } from "@/modules/remitos/NuevoRemitoPage";
import { RemitoDetallePage } from "@/modules/remitos/RemitoDetallePage";
import { RemitosPage } from "@/modules/remitos/RemitosPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 },
  },
});

/** Módulos planificados que todavía no tienen pantalla */
const proximos = allNavItems.filter((i) => i.features);

/** Misma dirección, pantalla distinta según el producto de la empresa (ej. /presupuestos) */
function Segun({ gestion, dental }: { gestion: ReactNode; dental: ReactNode }) {
  const { empresa } = useRole();
  return <>{empresa.producto === "dental" ? dental : gestion}</>;
}

function Cargando() {
  return (
    <div className="flex min-h-svh items-center justify-center text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
    </div>
  );
}

/** Solo usuarios con sesión; si no, al login recordando a dónde iban */
function Protegido({ children }: { children: ReactNode }) {
  const { status, cerroSesion } = useAuth();
  const location = useLocation();
  if (status === "cargando") return <Cargando />;
  if (status === "anonimo") {
    return <Navigate to="/login" replace state={cerroSesion ? undefined : { desde: location.pathname + location.search }} />;
  }
  return <>{children}</>;
}

/** Login y registro: si ya hay sesión, a la pantalla que se había pedido (o al inicio) */
function SoloAnonimo({ children }: { children: ReactNode }) {
  const { status, usuario } = useAuth();
  const location = useLocation();
  if (status === "cargando") return <Cargando />;
  if (status === "autenticado") {
    const desde = (location.state as { desde?: string } | null)?.desde;
    // Solo volvemos a esa pantalla si el rol de quien entró puede verla
    const destino = desde && usuario && canAccess({ esAdmin: !!usuario.esAdmin, permisos: usuario.permisos ?? [] }, desde.split("?")[0]) ? desde : "/";
    return <Navigate to={destino} replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TooltipProvider delayDuration={200}>
            <BrowserRouter>
              <Routes>
                <Route path="login" element={<SoloAnonimo><LoginPage /></SoloAnonimo>} />
                <Route path="registro" element={<SoloAnonimo><RegistroPage /></SoloAnonimo>} />
                <Route path="olvide" element={<SoloAnonimo><OlvideClavePage /></SoloAnonimo>} />
                <Route path="restablecer" element={<RestablecerClavePage />} />
                <Route path="terminos" element={<LegalPage tipo="terminos" />} />
                <Route path="privacidad" element={<LegalPage tipo="privacidad" />} />
                <Route path="baja" element={<SolicitudLegalPage tipo="baja" />} />
                <Route path="arrepentimiento" element={<SolicitudLegalPage tipo="arrepentimiento" />} />
                {/* Documento que abre el cliente con el link (sin iniciar sesión) */}
                <Route path="ver/:token" element={<DocumentoPublicoPage />} />
                <Route path="turno/:token" element={<TurnoPublicoPage />} />
                <Route path="reservar/:codigo" element={<ReservaPage />} />
                {/* Panel de administración de Prexacode: login y sesión propios */}
                <Route path="admin/*" element={<AdminApp />} />
                <Route element={<Protegido><AppLayout /></Protegido>}>
                  <Route index element={<InicioPage />} />
                  <Route path="clientes" element={<ClientesPage />} />
                  <Route path="pacientes" element={<PacientesPage />} />
                  <Route path="pacientes/:id" element={<PacienteDetallePage />} />
                  <Route path="clientes/:id" element={<ClienteDetallePage />} />
                  <Route path="oportunidades" element={<OportunidadesPage />} />
                  <Route path="agenda" element={<AgendaPage />} />
                  <Route path="remitos" element={<RemitosPage />} />
                  <Route path="remitos/nuevo" element={<NuevoRemitoPage />} />
                  <Route path="remitos/:id" element={<RemitoDetallePage />} />
                  <Route path="facturacion" element={<FacturacionPage />} />
                  <Route path="facturacion/nueva" element={<NuevaFacturaPage />} />
                  <Route path="facturacion/:id" element={<ComprobanteDetallePage />} />
                  <Route path="presupuestos" element={<Segun gestion={<PresupuestosPage />} dental={<PresupuestosDentalesPage />} />} />
                  <Route path="presupuestos/nuevo" element={<PresupuestoFormPage />} />
                  <Route path="presupuestos/:id" element={<Segun gestion={<PresupuestoDetallePage />} dental={<PresupuestoDentalPage />} />} />
                  <Route path="presupuestos/:id/editar" element={<PresupuestoFormPage key="editar" />} />
                  <Route path="cobranzas" element={<Segun gestion={<CobranzasPage />} dental={<CobrosConsultorioPage />} />} />
                  <Route path="prestaciones" element={<PrestacionesPage />} />
                  <Route path="caja" element={<CajaPage />} />
                  <Route path="gastos" element={<GastosPage />} />
                  <Route path="liquidacion" element={<LiquidacionPage />} />
                  <Route path="laboratorios" element={<LaboratoriosPage />} />
                  <Route path="honorarios" element={<HonorariosPage />} />
                  <Route path="laboratorios/:id" element={<LaboratorioPage />} />
                  <Route path="pacientes/:id/recibos/:pagoId" element={<ReciboPacientePage />} />
                  <Route path="cobranzas/nuevo" element={<NuevoReciboPage />} />
                  <Route path="cobranzas/recibos/:id" element={<ReciboDetallePage />} />
                  <Route path="productos" element={<ProductosPage />} />
                  <Route path="productos/:id" element={<ProductoDetallePage />} />
                  <Route path="movimientos" element={<MovimientosPage />} />
                  <Route path="reportes" element={<ReportesPage />} />
                  <Route path="suscripcion/pago/:referencia" element={<PagoSimuladoPage />} />
                  <Route path="configuracion" element={<ConfiguracionPage />} />
                  <Route path="empleados" element={<EmpleadosPage />} />
                  <Route path="empleados/pagos/:id" element={<PagoEmpleadoPage />} />
                  <Route path="empleados/:id" element={<EmpleadoDetallePage />} />
                  <Route path="ayuda" element={<AyudaPage />} />
                  <Route path="soporte" element={<SoportePage />} />
                  <Route path="soporte/:id" element={<TicketPage />} />
                  <Route path="importar-exportar" element={<ImportarExportarPage />} />
                  <Route path="cuenta/notificaciones" element={<PreferenciasNotificacionesPage />} />
                  {proximos.map((item) => (
                    <Route key={item.path} path={item.path.slice(1)} element={<ModulePlaceholder item={item} />} />
                  ))}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </BrowserRouter>
            <Toaster position="bottom-right" richColors />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
