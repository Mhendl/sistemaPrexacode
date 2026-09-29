import { useState } from "react";
import { Loader2, MoreHorizontal, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router";
import { ApiError } from "@/api/client";
import { useCambiarPlan, usePlanes, useSuscripcion, useCrearUsuario, useEditarUsuario, useRoles, useUsuarios } from "@/api/hooks";
import type { RolApi, SuscripcionApi } from "@/api/types";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { iniciales, useRole } from "@/context/AuthProvider";
import { formatDate, formatMoney } from "@/lib/format";
import { Field, Section } from "./parts";


export function UsuariosTab() {
  const { usuario: yo } = useRole();
  const { data: usuarios, isLoading, error, refetch } = useUsuarios();
  const editar = useEditarUsuario();
  const [invitar, setInvitar] = useState(false);
  const { data: sus } = useSuscripcion();
  const { data: roles = [] } = useRoles();
  const usados = usuarios?.filter((u) => u.estado === "Activo").length ?? 0;
  const limite = sus?.limites?.usuarios ?? usados;

  const cambiar = async (id: string, datos: { rolId?: string; estado?: string }, ok: string) => {
    try {
      await editar.mutateAsync({ id, ...datos });
      toast.success(ok);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar");
    }
  };

  return (
    <div className="grid gap-6">
      <Section
        title="Usuarios"
        description={sus ? `Plan ${sus.planNombre}: ${limite} usuarios activos como máximo${sus.usuariosAdicionales ? ` (incluye ${sus.usuariosAdicionales} adicional${sus.usuariosAdicionales === 1 ? "" : "es"})` : ""}` : undefined}
        action={
          <Button onClick={() => setInvitar(true)}>
            <UserPlus className="size-4" /> Nuevo usuario
          </Button>
        }
      >
        <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
          <div className="mb-5 max-w-sm">
            <div className="mb-1.5 flex justify-between text-xs">
              <span className="text-muted-foreground">Usuarios activos</span>
              <span className="tabular font-medium">
                {usados} de {limite}
              </span>
            </div>
            <Progress value={Math.min(100, (usados / Math.max(1, limite)) * 100)} />
          </div>

          <div className="-mx-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-6 py-2.5 font-medium">Usuario</th>
                  <th className="px-4 py-2.5 font-medium">Rol</th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">Último acceso</th>
                  <th className="px-4 py-2.5 font-medium">Estado</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody>
                {usuarios?.map((u) => (
                  <tr key={u.id} className="border-b last:border-b-0" data-testid={`usuario-${u.email}`}>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-8">
                          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{iniciales(u.nombre)}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="font-medium">
                            {u.nombre} {u.id === yo.id && <span className="text-xs font-normal text-muted-foreground">(vos)</span>}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{u.rolNombre}</td>
                    <td className="tabular hidden px-4 py-3 text-muted-foreground md:table-cell">{u.ultimoAcceso ? formatDate(new Date(u.ultimoAcceso)) : "Nunca"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={u.estado} />
                    </td>
                    <td className="px-2 py-3">
                      {u.id !== yo.id && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label={`Acciones de ${u.nombre}`}>
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel className="text-xs text-muted-foreground">Cambiar rol</DropdownMenuLabel>
                            {roles
                              .filter((r) => r.id !== u.rolId)
                              .map((r) => (
                                <DropdownMenuItem key={r.id} onClick={() => cambiar(u.id, { rolId: r.id }, `${u.nombre} ahora es ${r.nombre}`)}>
                                  {r.nombre}
                                </DropdownMenuItem>
                              ))}
                            <DropdownMenuSeparator />
                            {u.estado === "Activo" ? (
                              <DropdownMenuItem variant="destructive" onClick={() => cambiar(u.id, { estado: "Suspendido" }, `${u.nombre} fue suspendido`)}>
                                Suspender
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => cambiar(u.id, { estado: "Activo" }, `${u.nombre} fue reactivado`)}>Reactivar</DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </QueryState>
      </Section>

      <Section
        title="Roles"
        description="Qué puede ver y hacer cada rol. Podés editarlos o crear roles nuevos."
        action={
          <Button variant="outline" asChild>
            <Link to="/configuracion?tab=roles">Administrar roles</Link>
          </Button>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {roles.map((r) => (
            <div key={r.id} className="rounded-lg border p-4">
              <div className="font-medium">{r.nombre}</div>
              {r.descripcion && <p className="mt-1 text-sm text-muted-foreground">{r.descripcion}</p>}
              <div className="mt-2 text-xs text-muted-foreground">
                {r.usuarios} {r.usuarios === 1 ? "usuario" : "usuarios"}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <NuevoUsuarioDialog open={invitar} onOpenChange={setInvitar} lleno={usados >= limite} limite={limite} sus={sus} roles={roles} />
    </div>
  );
}

function NuevoUsuarioDialog({ open, onOpenChange, lleno, limite, sus, roles }: { open: boolean; onOpenChange: (o: boolean) => void; lleno: boolean; limite: number; sus?: SuscripcionApi; roles: RolApi[] }) {
  const crear = useCrearUsuario();
  const porDefecto = roles.find((r) => r.prearmado === "ventas")?.id ?? roles.find((r) => !r.esAdmin)?.id ?? "";
  const [datos, setDatos] = useState({ nombre: "", email: "", rolId: "", password: "" });
  const rolId = datos.rolId || porDefecto;
  const [errores, setErrores] = useState<Record<string, string>>({});

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrores({});
    try {
      await crear.mutateAsync({ ...datos, rolId });
      toast.success(`Usuario creado. Pasale a ${datos.nombre} su email y contraseña.`);
      setDatos({ nombre: "", email: "", rolId: "", password: "" });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrores(err.details);
        toast.error(err.message);
      } else throw err;
    }
  };

  const input = (id: "nombre" | "email" | "password", label: string, type = "text", hint?: string) => (
    <Field label={label} htmlFor={`nu-${id}`} hint={hint}>
      <Input id={`nu-${id}`} type={type} value={datos[id]} onChange={(e) => setDatos({ ...datos, [id]: e.target.value })} aria-invalid={!!errores[id]} />
      {errores[id] && <p className="text-xs text-destructive">{errores[id]}</p>}
    </Field>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo usuario</DialogTitle>
          <DialogDescription>Definí una contraseña inicial y compartísela. Más adelante se va a poder invitar por email.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit} noValidate>
          {input("nombre", "Nombre y apellido")}
          {input("email", "Email", "email")}
          <Field label="Rol" htmlFor="nu-rol">
            <Select value={rolId} onValueChange={(v) => setDatos({ ...datos, rolId: v })}>
              <SelectTrigger id="nu-rol" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {input("password", "Contraseña inicial", "text", "Mínimo 8 caracteres")}
          {lleno && (
            <div className="rounded-lg bg-warning/15 p-3 text-sm text-warning-ink" data-testid="aviso-limite-usuarios">
              Ya usás los {limite} usuarios de tu plan. Sumá un usuario adicional o suspendé a alguien que ya no lo use (<Link to="/configuracion?tab=plan" className="font-medium underline" onClick={() => onOpenChange(false)}>
                ver planes
              </Link>
              ).
              {sus && <SumarUsuario sus={sus} alListo={() => onOpenChange(false)} />}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={crear.isPending}>
              {crear.isPending && <Loader2 className="size-4 animate-spin" />}
              Crear usuario
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Compra de un usuario adicional en un paso: si hay período pago, lleva a pagar lo proporcional */
function SumarUsuario({ sus, alListo }: { sus: SuscripcionApi; alListo: () => void }) {
  const cambiar = useCambiarPlan();
  const { data: catalogo } = usePlanes();
  const navigate = useNavigate();
  const sumar = async () => {
    try {
      const r = await cambiar.mutateAsync({ plan: sus.plan, usuariosAdicionales: (sus.usuariosAdicionales ?? 0) + 1, version: sus.version });
      if (r.aplicado === "pagar") {
        toast(`Pagá ${formatMoney(r.importeArs)} por el usuario nuevo`, { description: `Es lo proporcional a los ${r.dias} días que faltan para tu vencimiento. Se habilita apenas se acredita.` });
        const url = new URL(r.url, window.location.origin);
        if (url.origin === window.location.origin) navigate(url.pathname + url.search);
        else window.location.href = r.url;
      } else {
        toast.success("Usuario adicional sumado", { description: "Ya podés crear el usuario. Se cobra con tu próximo pago." });
      }
      alListo();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo sumar el usuario");
    }
  };
  return (
    <div className="mt-2">
      <Button type="button" size="sm" onClick={sumar} disabled={cambiar.isPending}>
        {cambiar.isPending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
        Sumar 1 usuario{catalogo ? ` (USD ${catalogo.precioUsuarioAdicionalUsd}/mes)` : ""}
      </Button>
    </div>
  );
}
