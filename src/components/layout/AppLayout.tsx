import { SuscripcionAviso } from "./SuscripcionAviso";
import { AceptarTerminos } from "./AceptarTerminos";
import { LinksLegales } from "@/modules/legal/SolicitudLegalPage";
import { useState } from "react";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Outlet, useLocation } from "react-router";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useRole } from "@/context/AuthProvider";
import { canAccess } from "@/lib/navigation";

import { cn } from "@/lib/utils";
import { NoAccess } from "@/components/shared/NoAccess";
import { EmpresaLogo } from "@/components/shared/EmpresaLogo";
import { GlobalSearch } from "./GlobalSearch";
import { Logo } from "./Logo";
import { NotificationsBell } from "./NotificationsBell";
import { SidebarNav } from "./SidebarNav";
import { UserMenu } from "./UserMenu";

const COLLAPSE_KEY = "prexacode-sidebar-collapsed";

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { empresa, acceso } = useRole();
  const { pathname } = useLocation();

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* ignorar */
      }
      return !c;
    });
  };

  const allowed = canAccess(acceso, pathname);

  return (
    <div className="flex min-h-svh">
      {/* Barra lateral (escritorio) */}
      <aside
        className={cn(
          "sticky top-0 hidden h-svh shrink-0 flex-col bg-sidebar transition-[width] duration-200 lg:flex",
          collapsed ? "w-[68px]" : "w-64",
        )}
      >
        <div className={cn("flex h-16 items-center", collapsed ? "justify-center" : "px-4")}>
          <Logo collapsed={collapsed} />
        </div>
        <div className="flex-1 overflow-y-auto px-2.5 py-3">
          <SidebarNav collapsed={collapsed} />
        </div>
        {!collapsed && (
          <div className="mx-2.5 mb-2 flex items-center gap-2.5 rounded-lg bg-sidebar-accent/70 px-2.5 py-2.5" data-testid="empresa-actual">
            <EmpresaLogo empresa={empresa} />
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-white">{empresa.razonSocial}</div>
              <div className="text-[11px] text-sidebar-muted capitalize">Plan {empresa.plan}</div>
            </div>
          </div>
        )}
        <div className="border-t border-sidebar-border p-2.5">
          <button
            type="button"
            onClick={toggleCollapsed}
            className={cn(
              "flex h-9 w-full items-center gap-3 rounded-md px-3 text-sm text-sidebar-muted hover:bg-sidebar-accent hover:text-white",
              collapsed && "justify-center px-0",
            )}
          >
            {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
            {!collapsed && "Contraer menú"}
          </button>
        </div>
      </aside>

      {/* Menú lateral (celular / tablet) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 border-none bg-sidebar p-0 text-sidebar-foreground">
          <SheetTitle className="sr-only">Menú</SheetTitle>
          <SheetDescription className="sr-only">Módulos del sistema</SheetDescription>
          <div className="flex h-16 items-center px-4">
            <Logo />
          </div>
          <div className="overflow-y-auto px-2.5 pb-6">
            <SidebarNav onNavigate={() => setMobileOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <SuscripcionAviso />
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur sm:gap-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu className="size-5" />
          </Button>
          <GlobalSearch />
          <div className="ml-auto flex items-center gap-1">
            <NotificationsBell />
            <UserMenu />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8">
          <div className="mx-auto w-full max-w-[1400px]">{allowed ? <Outlet /> : <NoAccess />}</div>
        </main>
        <footer className="px-4 pb-6 lg:px-8 print:hidden">
          <LinksLegales className="mx-auto flex max-w-[1400px] flex-wrap gap-x-2 gap-y-1 border-t pt-4 text-xs text-muted-foreground" />
        </footer>
        <AceptarTerminos />
      </div>
    </div>
  );
}
