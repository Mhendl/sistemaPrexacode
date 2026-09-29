import { useState } from "react";
import { Copy, Loader2, Lock, Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { useBorrarRol, useCatalogoPermisos, useGuardarRol, useRoles } from "@/api/hooks";
import type { RolApi, SeccionPermisosApi } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryState } from "@/components/shared/QueryState";
import { Section } from "./parts";

const mensaje = (e: unknown) => (e instanceof ApiError ? e.message : "No se pudo completar");

/** Roles de la empresa: los pre armados se pueden ajustar, y se crean los que hagan falta (el de Administrador no se toca) */
export function RolesTab() {
  const { data: roles = [], isLoading, error, refetch } = useRoles();
  const { data: catalogo = [] } = useCatalogoPermisos();
  const borrar = useBorrarRol();
  const [editando, setEditando] = useState<{ rol?: RolApi; base?: RolApi } | null>(null);
  const [aBorrar, setABorrar] = useState<RolApi | null>(null);
  const nombrePermiso = new Map(catalogo.flatMap((s) => s.permisos.map((p) => [p.id, p.nombre])));

  return (
    <Section
      title="Roles y permisos"
      description="Cada usuario tiene un rol, y el rol dice qué puede ver y hacer. Ajustá los que vienen armados o creá los tuyos (por ejemplo, &quot;Cajero&quot; que solo cobra)."
      action={
        <Button onClick={() => setEditando({})}>
          <Plus className="size-4" /> Nuevo rol
        </Button>
      }
    >
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        <div className="grid gap-3 lg:grid-cols-2" data-testid="lista-roles">
          {roles.map((r) => (
            <div key={r.id} className="grid content-start gap-2 rounded-lg border p-4" data-testid={`rol-${r.nombre}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    {r.esAdmin && <ShieldCheck className="size-4 text-primary" />}
                    {r.nombre}
                  </div>
                  {r.descripcion && <p className="text-sm text-muted-foreground">{r.descripcion}</p>}
                </div>
                <div className="flex gap-1">
                  {!r.esAdmin && (
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditando({ rol: r })} aria-label={`Editar ${r.nombre}`}>
                      <Pencil className="size-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditando({ base: r })} aria-label={`Duplicar ${r.nombre}`}>
                    <Copy className="size-4" />
                  </Button>
                  {!r.esAdmin && (
                    <Button variant="ghost" size="icon-sm" onClick={() => setABorrar(r)} aria-label={`Borrar ${r.nombre}`}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {r.usuarios} {r.usuarios === 1 ? "usuario" : "usuarios"}
                {r.esAdmin ? " · acceso a todo, incluidos usuarios, roles, plan y pagos" : ` · ${r.permisos.length} permisos`}
              </div>
              {!r.esAdmin && r.permisos.length > 0 && (
                <ul className="flex flex-wrap gap-1">
                  {r.permisos.map((p) => (
                    <li key={p} className="rounded-md bg-muted px-2 py-0.5 text-xs">
                      {nombrePermiso.get(p) ?? p}
                    </li>
                  ))}
                </ul>
              )}
              {r.esAdmin && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Lock className="size-3" /> No se puede modificar ni borrar: siempre tiene que haber al menos un administrador.
                </p>
              )}
            </div>
          ))}
        </div>
      </QueryState>

      {editando && <EditorRol catalogo={catalogo} rol={editando.rol} base={editando.base} onCerrar={() => setEditando(null)} />}

      <Dialog open={!!aBorrar} onOpenChange={(o) => !o && setABorrar(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>¿Borrar el rol {aBorrar?.nombre}?</DialogTitle>
            <DialogDescription>{aBorrar?.usuarios ? `Tiene ${aBorrar.usuarios} usuarios: primero pasalos a otro rol.` : "No lo usa ningún usuario."}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setABorrar(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={borrar.isPending}
              onClick={async () => {
                try {
                  await borrar.mutateAsync(aBorrar!.id);
                  toast.success("Rol borrado");
                  setABorrar(null);
                } catch (e) {
                  toast.error(mensaje(e));
                }
              }}
            >
              Borrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

function EditorRol({ catalogo, rol, base, onCerrar }: { catalogo: SeccionPermisosApi[]; rol?: RolApi; base?: RolApi; onCerrar: () => void }) {
  const guardar = useGuardarRol();
  const [nombre, setNombre] = useState(rol?.nombre ?? (base ? `${base.nombre} (copia)` : ""));
  const [descripcion, setDescripcion] = useState(rol?.descripcion ?? base?.descripcion ?? "");
  const todos = catalogo.flatMap((s) => s.permisos.map((p) => p.id));
  const [elegidos, setElegidos] = useState<Set<string>>(new Set(rol?.permisos ?? (base?.esAdmin ? todos : base?.permisos) ?? []));
  const [error, setError] = useState<string | null>(null);

  const alternar = (id: string, si: boolean) => {
    const n = new Set(elegidos);
    if (si) n.add(id);
    else n.delete(id);
    setElegidos(n);
  };
  const seccionEntera = (s: SeccionPermisosApi, si: boolean) => {
    const n = new Set(elegidos);
    for (const p of s.permisos) {
      if (si) n.add(p.id);
      else n.delete(p.id);
    }
    setElegidos(n);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{rol ? `Editar ${rol.nombre}` : "Nuevo rol"}</DialogTitle>
          <DialogDescription>Tildá lo que puede ver y hacer. Para cargar o modificar algo, el sistema le da también permiso para verlo.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            try {
              await guardar.mutateAsync({ id: rol?.id, nombre, descripcion: descripcion || null, permisos: [...elegidos], version: rol?.version });
              toast.success(rol ? "Rol actualizado" : "Rol creado", { description: rol ? "Los usuarios con este rol ya ven los cambios." : undefined });
              onCerrar();
            } catch (err) {
              setError(mensaje(err));
            }
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="rol-nombre">Nombre</Label>
              <Input id="rol-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Cajero" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rol-descripcion">Descripción (opcional)</Label>
              <Input id="rol-descripcion" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej.: Cobra en el mostrador" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2" data-testid="permisos-rol">
            {catalogo.map((s) => {
              const todas = s.permisos.every((p) => elegidos.has(p.id));
              return (
                <fieldset key={s.seccion} className="rounded-lg border p-3">
                  <legend className="px-1 text-sm font-medium">
                    <label className="flex items-center gap-2">
                      <Checkbox checked={todas} onCheckedChange={(v) => seccionEntera(s, v === true)} aria-label={`Todo ${s.seccion}`} />
                      {s.seccion}
                    </label>
                  </legend>
                  <div className="grid gap-1.5">
                    {s.permisos.map((p) => (
                      <label key={p.id} className="flex items-start gap-2 text-sm">
                        <Checkbox className="mt-0.5" checked={elegidos.has(p.id)} onCheckedChange={(v) => alternar(p.id, v === true)} aria-label={p.nombre} />
                        {p.nombre}
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </div>
          {error && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardar.isPending}>
              {guardar.isPending && <Loader2 className="size-4 animate-spin" />}
              {rol ? "Guardar cambios" : "Crear rol"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
