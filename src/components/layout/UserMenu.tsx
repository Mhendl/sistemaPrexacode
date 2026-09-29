import { Bell, ChevronDown, CreditCard, LogOut, Monitor, Moon, Sun } from "lucide-react";
import { Link } from "react-router";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth, useRole } from "@/context/AuthProvider";
import { useTheme } from "@/context/ThemeProvider";

export function UserMenu() {
  const { usuario, esAdmin } = useRole();
  const { logout } = useAuth();
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-10 gap-2 px-1.5 sm:px-2" aria-label="Menú de usuario">
          <Avatar className="size-8">
            <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">{usuario.iniciales}</AvatarFallback>
          </Avatar>
          <div className="hidden text-left leading-tight md:block">
            <div className="text-sm font-medium">{usuario.nombre}</div>
            <div className="text-xs text-muted-foreground">{usuario.rolNombre}</div>
          </div>
          <ChevronDown className="hidden size-4 text-muted-foreground md:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-medium">{usuario.nombre}</div>
          <div className="text-xs text-muted-foreground">{usuario.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            {theme === "dark" ? <Moon className="size-4" /> : theme === "light" ? <Sun className="size-4" /> : <Monitor className="size-4" />}
            Tema
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as typeof theme)}>
              <DropdownMenuRadioItem value="light">Claro</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark">Oscuro</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system">Según el sistema</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem asChild>
          <Link to="/cuenta/notificaciones">
            <Bell className="size-4" /> Mis notificaciones
          </Link>
        </DropdownMenuItem>
        {esAdmin && (
          <DropdownMenuItem asChild>
            <Link to="/configuracion?tab=plan">
              <CreditCard className="size-4" /> Plan y suscripción
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout}>
          <LogOut className="size-4" /> Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
