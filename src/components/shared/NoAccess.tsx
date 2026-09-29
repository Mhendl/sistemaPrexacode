import { ShieldOff } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { useRole } from "@/context/AuthProvider";

export function NoAccess() {
  const { usuario } = useRole();
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <ShieldOff className="size-6 text-muted-foreground" />
      </div>
      <h2 className="mt-4 text-lg font-semibold">Sin acceso a este módulo</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Tu rol (<strong>{usuario.rolNombre}</strong>) no tiene permiso para ver esta sección. Si lo necesitás, pedíselo a un administrador.
      </p>
      <Button asChild className="mt-6">
        <Link to="/">Ir al inicio</Link>
      </Button>
    </div>
  );
}
