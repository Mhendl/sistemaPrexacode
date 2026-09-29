import { useState } from "react";
import { KeyRound, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { apiAdmin, useAccionAdmin, useAdministradores, type AdminApi } from "./api";
import { fechaHora } from "./comun";

const mensaje = (e: unknown) => (e instanceof ApiError ? e.message : "No se pudo completar");

export function AdminAdministradores({ yo }: { yo: AdminApi }) {
  const { data = [], isLoading, error, refetch } = useAdministradores();
  const accion = useAccionAdmin();
  return (
    <>
      <PageHeader title="Administradores" description="Quiénes pueden entrar a este panel. Cada uno entra con su propio email y contraseña." />
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="gap-0 pb-0 shadow-none xl:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle>Con acceso al panel</CardTitle>
          </CardHeader>
          <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
            <ul className="divide-y border-t" data-testid="lista-administradores">
              {data.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {a.nombre} {a.id === yo.id && <span className="text-xs text-muted-foreground">(vos)</span>}
                    </div>
                    <div className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {a.email} · último acceso: {a.ultimoAcceso ? fechaHora(a.ultimoAcceso) : "nunca"}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={a.activo ? "Activo" : "Inactivo"} />
                    <Switch
                      checked={a.activo}
                      disabled={a.id === yo.id || accion.isPending}
                      aria-label={`Acceso de ${a.email}`}
                      onCheckedChange={async (activo) => {
                        try {
                          await accion.mutateAsync({ url: `/admin/administradores/${a.id}`, metodo: "PATCH", body: { activo } });
                          toast.success(activo ? "Acceso habilitado" : "Acceso quitado");
                        } catch (e) {
                          toast.error(mensaje(e));
                        }
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </QueryState>
        </Card>
        <div className="grid content-start gap-6">
          <NuevoAdmin />
          <CambiarClave />
        </div>
      </div>
    </>
  );
}

function NuevoAdmin() {
  const accion = useAccionAdmin();
  const vacio = { nombre: "", email: "", password: "" };
  const [f, setF] = useState(vacio);
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>Sumar un administrador</CardTitle>
        <CardDescription>Va a poder ver y administrar todas las empresas.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await accion.mutateAsync({ url: "/admin/administradores", body: f });
              toast.success("Administrador creado");
              setF(vacio);
            } catch (err) {
              toast.error(mensaje(err));
            }
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="na-nombre">Nombre</Label>
            <Input id="na-nombre" value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="na-email">Email</Label>
            <Input id="na-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="na-password">Contraseña inicial</Label>
            <Input id="na-password" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </div>
          <Button type="submit" disabled={accion.isPending}>
            {accion.isPending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />} Crear administrador
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function CambiarClave() {
  const [f, setF] = useState({ actual: "", nueva: "", repetir: "" });
  const [enviando, setEnviando] = useState(false);
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>Tu contraseña</CardTitle>
        <CardDescription>Cambiala después de la primera entrada.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (f.nueva !== f.repetir) return toast.error("Las contraseñas nuevas no coinciden");
            setEnviando(true);
            try {
              await apiAdmin("/admin/password", { method: "POST", body: { actual: f.actual, nueva: f.nueva } });
              toast.success("Contraseña cambiada");
              setF({ actual: "", nueva: "", repetir: "" });
            } catch (err) {
              toast.error(mensaje(err));
            } finally {
              setEnviando(false);
            }
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="cc-actual">Contraseña actual</Label>
            <Input id="cc-actual" type="password" autoComplete="current-password" value={f.actual} onChange={(e) => setF({ ...f, actual: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cc-nueva">Nueva</Label>
            <Input id="cc-nueva" type="password" autoComplete="new-password" value={f.nueva} onChange={(e) => setF({ ...f, nueva: e.target.value })} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cc-repetir">Repetir la nueva</Label>
            <Input id="cc-repetir" type="password" autoComplete="new-password" value={f.repetir} onChange={(e) => setF({ ...f, repetir: e.target.value })} />
          </div>
          <Button type="submit" variant="outline" disabled={enviando}>
            {enviando ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Cambiar contraseña
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
