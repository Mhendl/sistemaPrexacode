import { useEffect, useState, type ReactNode } from "react";
import { Building2, ClipboardList, CreditCard, Inbox, LayoutDashboard, LifeBuoy, Loader2, LogOut, Menu, ShieldCheck, Users } from "lucide-react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/api/client";
import { LogoMark } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { plataforma as brand } from "@/config/brand";
import { cn } from "@/lib/utils";
import { apiAdmin, getAdminToken, setAdminToken, useAdminYo, type AdminApi } from "./api";
import { AdminAdministradores } from "./AdminAdministradores";
import { AdminAuditoria } from "./AdminAuditoria";
import { AdminEmpresa } from "./AdminEmpresa";
import { AdminEmpresas } from "./AdminEmpresas";
import { AdminPagos } from "./AdminPagos";
import { AdminResumen } from "./AdminResumen";
import { AdminSolicitudes } from "./AdminSolicitudes";
import { AdminSoporte, AdminTicket } from "./AdminSoporte";

const menu = [
  { to: "/admin", label: "Resumen", icon: LayoutDashboard, fin: true },
  { to: "/admin/empresas", label: "Empresas", icon: Building2 },
  { to: "/admin/soporte", label: "Soporte", icon: LifeBuoy },
  { to: "/admin/pagos", label: "Pagos", icon: CreditCard },
  { to: "/admin/solicitudes", label: "Baja y arrepentimiento", icon: Inbox },
  { to: "/admin/auditoria", label: "Auditoría", icon: ClipboardList },
  { to: "/admin/administradores", label: "Administradores", icon: Users },
];

/** Panel de administración de Prexacode: entrada propia (/admin), separada de las cuentas de las empresas */
export function AdminApp() {
  return (
    <Routes>
      <Route path="login" element={<AdminLogin />} />
      <Route path="*" element={<Protegido />} />
    </Routes>
  );
}

function Protegido() {
  const token = getAdminToken();
  const { data: yo, isLoading, error } = useAdminYo(!!token);
  if (!token || error) return <Navigate to="/admin/login" replace />;
  if (isLoading || !yo) {
    return (
      <div className="flex min-h-svh items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }
  return (
    <Marco yo={yo}>
      <Routes>
        <Route index element={<AdminResumen />} />
        <Route path="empresas" element={<AdminEmpresas />} />
        <Route path="empresas/:id" element={<AdminEmpresa />} />
        <Route path="soporte" element={<AdminSoporte />} />
        <Route path="soporte/:id" element={<AdminTicket />} />
        <Route path="pagos" element={<AdminPagos />} />
        <Route path="solicitudes" element={<AdminSolicitudes />} />
        <Route path="auditoria" element={<AdminAuditoria />} />
        <Route path="administradores" element={<AdminAdministradores yo={yo} />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </Marco>
  );
}

function Navegacion({ onNavegar }: { onNavegar?: () => void }) {
  return (
    <nav className="grid gap-1 p-3" aria-label="Panel de administración">
      {menu.map((m) => (
        <NavLink
          key={m.to}
          to={m.to}
          end={m.fin}
          onClick={onNavegar}
          className={({ isActive }) =>
            cn("flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors", isActive ? "bg-white/10 font-medium text-white" : "text-slate-300 hover:bg-white/5 hover:text-white")
          }
        >
          <m.icon className="size-4" /> {m.label}
        </NavLink>
      ))}
    </nav>
  );
}

function Marco({ yo, children }: { yo: AdminApi; children: ReactNode }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [menuMovil, setMenuMovil] = useState(false);
  const salir = () => {
    setAdminToken(null);
    qc.removeQueries({ queryKey: ["admin"] });
    navigate("/admin/login", { replace: true });
  };
  const cabecera = (
    <div className="flex items-center gap-2.5 px-5 py-5">
      <LogoMark />
      <div>
        <div className="font-bold tracking-tight text-white">{brand.nombre}</div>
        <div className="flex items-center gap-1 text-[11px] text-amber-300">
          <ShieldCheck className="size-3" /> Administración
        </div>
      </div>
    </div>
  );
  return (
    <div className="flex min-h-svh bg-muted/40">
      <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col bg-slate-950 lg:flex">
        {cabecera}
        <Navegacion />
      </aside>
      <Sheet open={menuMovil} onOpenChange={setMenuMovil}>
        <SheetContent side="left" className="w-72 border-none bg-slate-950 p-0">
          <SheetTitle className="sr-only">Menú</SheetTitle>
          <SheetDescription className="sr-only">Secciones del panel</SheetDescription>
          {cabecera}
          <Navegacion onNavegar={() => setMenuMovil(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/90 px-4 backdrop-blur lg:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMenuMovil(true)} aria-label="Abrir menú del panel">
            <Menu className="size-5" />
          </Button>
          <span className="text-sm font-semibold lg:hidden">Administración</span>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline" data-testid="admin-nombre">
              {yo.nombre} · {yo.email}
            </span>
            <Button variant="outline" size="sm" onClick={salir}>
              <LogOut className="size-4" /> Salir
            </Button>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1400px]">{children}</div>
        </main>
      </div>
    </div>
  );
}

function AdminLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    document.title = `Administración · ${brand.nombre}`;
  }, []);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      const r = await apiAdmin<{ token: string; admin: AdminApi }>("/admin/login", { method: "POST", body: { email, password } });
      setAdminToken(r.token);
      qc.setQueryData(["admin", "yo"], r.admin);
      navigate(((location.state as { desde?: string } | null)?.desde ?? "/admin") as string, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo entrar");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex min-h-svh items-center justify-center bg-slate-950 px-4">
      <form onSubmit={entrar} className="w-full max-w-sm rounded-xl bg-background p-6 shadow-xl" noValidate>
        <div className="mb-6 flex items-center gap-2.5">
          <LogoMark />
          <div>
            <div className="font-bold tracking-tight">{brand.nombre}</div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <ShieldCheck className="size-3" /> Panel de administración
            </div>
          </div>
        </div>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="adm-email">Email</Label>
            <Input id="adm-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="adm-password">Contraseña</Label>
            <Input id="adm-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <Button type="submit" disabled={enviando}>
            {enviando && <Loader2 className="size-4 animate-spin" />}
            Entrar al panel
          </Button>
          <p className="text-center text-xs text-muted-foreground">Acceso exclusivo para administradores de {brand.nombre}.</p>
        </div>
      </form>
    </div>
  );
}
