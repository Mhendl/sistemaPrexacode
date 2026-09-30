import { useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Percent, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRole } from "@/context/AuthProvider";
import { aNumero } from "@/lib/numeros";
import { useCrearObraSocial, useObrasSociales, usePrestaciones, type PrestacionApi } from "@/modules/pacientes/api";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAccionClinica, usePlantillas } from "@/modules/clinica/api";
import { useAumentarPrecios, useGuardarObraSocial, useGuardarPrecios, useGuardarPrestacion, usePrecios } from "./api";

const aTexto = (n: number | null) => (n === null ? "" : n.toLocaleString("es-AR", { maximumFractionDigits: 2 }));
const ALCANCE = { cara: "Por cara", pieza: "Por pieza", general: "Sin pieza (consulta, limpieza…)" } as const;
const SIMBOLO = { relleno: "Pinta las caras", cruz: "Cruz", circulo: "Círculo", ausente: "Pieza ausente", texto: "Letras" } as const;

/** Precios de una lista: particular o una obra social */
function Precios() {
  const { puede } = useRole();
  const editable = puede("configuracion");
  const { data: obras = [] } = useObrasSociales();
  const [lista, setLista] = useState("particular");
  const precios = usePrecios(lista);
  const guardar = useGuardarPrecios();
  const aumentar = useAumentarPrecios();
  const [valores, setValores] = useState<Record<string, { paciente: string; obra: string }>>({});
  const [aumento, setAumento] = useState<{ porcentaje: string; redondeo: string } | null>(null);
  const esObra = lista !== "particular";

  useEffect(() => {
    if (!precios.data) return;
    setValores(Object.fromEntries(precios.data.map((p) => [p.id, { paciente: aTexto(p.precioPaciente), obra: aTexto(p.precioObraSocial) }])));
  }, [precios.data]);

  const cambios = useMemo(
    () =>
      (precios.data ?? []).filter((p) => {
        const v = valores[p.id];
        return v && (v.paciente !== aTexto(p.precioPaciente) || (esObra && v.obra !== aTexto(p.precioObraSocial)));
      }),
    [precios.data, valores, esObra],
  );

  const guardarTodo = async () => {
    const lista2 = cambios.map((p) => {
      const v = valores[p.id]!;
      return { prestacionId: p.id, precioPaciente: v.paciente.trim() ? aNumero(v.paciente) : null, precioObraSocial: esObra ? (v.obra.trim() ? aNumero(v.obra) : 0) : 0 };
    });
    if (lista2.some((x) => (x.precioPaciente !== null && Number.isNaN(x.precioPaciente)) || Number.isNaN(x.precioObraSocial))) return toast.error("Hay precios que no son números");
    try {
      await guardar.mutateAsync({ lista, precios: lista2 });
      toast.success(`${lista2.length} ${lista2.length === 1 ? "precio guardado" : "precios guardados"}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar");
    }
  };

  const aplicarAumento = async () => {
    if (!aumento) return;
    const porcentaje = aNumero(aumento.porcentaje);
    if (Number.isNaN(porcentaje)) return toast.error("Poné el porcentaje");
    try {
      const r = await aumentar.mutateAsync({ lista, porcentaje, redondeo: Number(aumento.redondeo) });
      toast.success(`Se actualizaron ${r.actualizados} precios`);
      setAumento(null);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo aplicar");
    }
  };

  const nombreLista = esObra ? (obras.find((o) => o.id === lista)?.nombre ?? "") : "Particular";

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1.5 sm:w-72">
          <Label htmlFor="lista-precios">Lista</Label>
          <Select value={lista} onValueChange={setLista}>
            <SelectTrigger id="lista-precios" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="particular">Particular (sin obra social)</SelectItem>
              {obras
                .filter((o) => o.activa)
                .map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.nombre}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        {editable && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setAumento({ porcentaje: "", redondeo: "100" })}>
              <Percent className="size-4" /> Aumentar precios
            </Button>
            <Button onClick={guardarTodo} disabled={!cambios.length || guardar.isPending}>
              {guardar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Guardar {cambios.length ? `(${cambios.length})` : ""}
            </Button>
          </div>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        {esObra
          ? `Para los afiliados de ${nombreLista}: lo que paga el paciente (coseguro) y lo que se le liquida a la obra social. Si una prestación queda vacía, se cobra el precio particular.`
          : "Lo que paga un paciente sin obra social. También se usa cuando la obra social del paciente no tiene precio para esa prestación."}
      </p>
      <QueryState isLoading={precios.isLoading} error={precios.error} onRetry={precios.refetch}>
        <Card className="overflow-hidden p-0 shadow-none">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Código</TableHead>
                  <TableHead>Prestación</TableHead>
                  <TableHead className="w-40 text-right">{esObra ? "Paga el paciente" : "Precio"}</TableHead>
                  {esObra && <TableHead className="w-40 text-right">Paga la obra social</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(precios.data ?? [])
                  .filter((p) => p.activa)
                  .map((p) => (
                    <TableRow key={p.id} data-testid="fila-precio">
                      <TableCell className="tabular text-muted-foreground">{p.codigo}</TableCell>
                      <TableCell>{p.nombre}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          className="ml-auto h-8 w-32 text-right tabular"
                          inputMode="decimal"
                          placeholder={esObra ? "Particular" : "Sin precio"}
                          value={valores[p.id]?.paciente ?? ""}
                          onChange={(e) => setValores((v) => ({ ...v, [p.id]: { ...v[p.id]!, paciente: e.target.value } }))}
                          disabled={!editable}
                          aria-label={`${esObra ? "Paga el paciente" : "Precio"} de ${p.nombre}`}
                        />
                      </TableCell>
                      {esObra && (
                        <TableCell className="text-right">
                          <Input
                            className="ml-auto h-8 w-32 text-right tabular"
                            inputMode="decimal"
                            value={valores[p.id]?.obra ?? ""}
                            onChange={(e) => setValores((v) => ({ ...v, [p.id]: { ...v[p.id]!, obra: e.target.value } }))}
                            disabled={!editable}
                            aria-label={`Paga la obra social de ${p.nombre}`}
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </QueryState>

      <Dialog open={!!aumento} onOpenChange={(o) => !o && setAumento(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aumentar precios · {nombreLista}</DialogTitle>
            <DialogDescription>Se aplica a todos los precios cargados en esta lista{esObra ? ", lo del paciente y lo de la obra social" : ""}.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="aum-pct">Porcentaje</Label>
              <Input id="aum-pct" inputMode="decimal" placeholder="Ej.: 8" value={aumento?.porcentaje ?? ""} onChange={(e) => setAumento((a) => a && { ...a, porcentaje: e.target.value })} autoFocus />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="aum-red">Redondear a</Label>
              <Select value={aumento?.redondeo ?? "100"} onValueChange={(v) => setAumento((a) => a && { ...a, redondeo: v })}>
                <SelectTrigger id="aum-red" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">$ 1</SelectItem>
                  <SelectItem value="10">$ 10</SelectItem>
                  <SelectItem value="100">$ 100</SelectItem>
                  <SelectItem value="1000">$ 1.000</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAumento(null)}>
              Cancelar
            </Button>
            <Button onClick={aplicarAumento} disabled={aumentar.isPending}>
              Aplicar aumento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Nomenclador: prestaciones con su código y cómo se dibujan en el odontograma */
function Nomenclador() {
  const { puede } = useRole();
  const editable = puede("configuracion");
  const prest = usePrestaciones();
  const guardar = useGuardarPrestacion();
  const [edit, setEdit] = useState<Partial<PrestacionApi> | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});

  const submit = async () => {
    setErrores({});
    try {
      await guardar.mutateAsync({ ...edit!, id: edit!.id });
      toast.success(edit!.id ? "Prestación actualizada" : "Prestación agregada");
      setEdit(null);
    } catch (e) {
      if (e instanceof ApiError) {
        setErrores(e.details);
        toast.error(e.message);
      }
    }
  };

  return (
    <div className="grid gap-4">
      {editable && (
        <div className="flex justify-end">
          <Button onClick={() => setEdit({ codigo: "", nombre: "", alcance: "general", simbolo: "relleno", etiqueta: null, activa: true })}>
            <Plus className="size-4" /> Nueva prestación
          </Button>
        </div>
      )}
      <QueryState isLoading={prest.isLoading} error={prest.error} onRetry={prest.refetch}>
        <Card className="overflow-hidden p-0 shadow-none">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Código</TableHead>
                  <TableHead>Prestación</TableHead>
                  <TableHead className="hidden sm:table-cell">Se marca</TableHead>
                  <TableHead className="hidden md:table-cell">En el odontograma</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(prest.data ?? []).map((p) => (
                  <TableRow key={p.id} className={p.activa ? "" : "opacity-50"}>
                    <TableCell className="tabular text-muted-foreground">{p.codigo}</TableCell>
                    <TableCell>
                      {p.nombre}
                      {!p.activa && <span className="ml-2 text-xs">(desactivada)</span>}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{ALCANCE[p.alcance]}</TableCell>
                    <TableCell className="hidden md:table-cell">{p.alcance === "general" ? "—" : p.simbolo === "texto" ? `Letras: ${p.etiqueta}` : SIMBOLO[p.simbolo]}</TableCell>
                    <TableCell className="text-right">
                      {editable && (
                        <Button size="icon-sm" variant="ghost" onClick={() => setEdit(p)} aria-label={`Editar ${p.nombre}`}>
                          <Pencil className="size-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </QueryState>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Editar prestación" : "Nueva prestación"}</DialogTitle>
            <DialogDescription>El código es el del nomenclador que uses (por ejemplo, el de la obra social).</DialogDescription>
          </DialogHeader>
          {edit && (
            <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
              <div className="grid gap-1.5">
                <Label htmlFor="pr-codigo">Código</Label>
                <Input id="pr-codigo" value={edit.codigo ?? ""} onChange={(e) => setEdit({ ...edit, codigo: e.target.value })} aria-invalid={!!errores.codigo} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pr-nombre">Nombre</Label>
                <Input id="pr-nombre" value={edit.nombre ?? ""} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} aria-invalid={!!errores.nombre} />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="pr-alcance">Se marca</Label>
                <Select value={edit.alcance} onValueChange={(v) => setEdit({ ...edit, alcance: v as PrestacionApi["alcance"] })}>
                  <SelectTrigger id="pr-alcance" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ALCANCE).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {edit.alcance === "pieza" && (
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor="pr-simbolo">Cómo se dibuja en la pieza</Label>
                  <Select value={edit.simbolo} onValueChange={(v) => setEdit({ ...edit, simbolo: v as PrestacionApi["simbolo"] })}>
                    <SelectTrigger id="pr-simbolo" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["cruz", "circulo", "ausente", "texto"] as const).map((k) => (
                        <SelectItem key={k} value={k}>
                          {SIMBOLO[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {edit.alcance === "pieza" && edit.simbolo === "texto" && (
                <div className="grid gap-1.5">
                  <Label htmlFor="pr-etiqueta">Letras</Label>
                  <Input id="pr-etiqueta" maxLength={3} value={edit.etiqueta ?? ""} onChange={(e) => setEdit({ ...edit, etiqueta: e.target.value })} aria-invalid={!!errores.etiqueta} />
                </div>
              )}
              {edit.id && (
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <Switch checked={edit.activa ?? true} onCheckedChange={(v) => setEdit({ ...edit, activa: v })} aria-label="Activa" /> Activa
                </label>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={guardar.isPending}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ObrasSociales() {
  const { puede } = useRole();
  const editable = puede("configuracion");
  const { data: obras = [] } = useObrasSociales();
  const crear = useCrearObraSocial();
  const guardar = useGuardarObraSocial();
  const [nueva, setNueva] = useState("");
  const [renombrar, setRenombrar] = useState<{ id: string; nombre: string; activa: boolean } | null>(null);

  const agregar = async () => {
    try {
      await crear.mutateAsync(nueva.trim());
      setNueva("");
      toast.success("Obra social agregada");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo agregar");
    }
  };
  const cambiar = async (o: { id: string; nombre: string; activa: boolean }) => {
    try {
      await guardar.mutateAsync(o);
      setRenombrar(null);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar");
    }
  };

  return (
    <div className="grid gap-4">
      {editable && (
        <div className="flex gap-2 sm:max-w-md">
          <Input placeholder="Nombre de la obra social o prepaga" value={nueva} onChange={(e) => setNueva(e.target.value)} aria-label="Nueva obra social" />
          <Button onClick={agregar} disabled={nueva.trim().length < 2 || crear.isPending}>
            <Plus className="size-4" /> Agregar
          </Button>
        </div>
      )}
      <Card className="overflow-hidden p-0 shadow-none">
        <ul className="divide-y">
          {obras.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              {renombrar?.id === o.id ? (
                <div className="flex flex-1 gap-2">
                  <Input value={renombrar.nombre} onChange={(e) => setRenombrar({ ...renombrar, nombre: e.target.value })} autoFocus aria-label="Nombre" />
                  <Button size="sm" onClick={() => cambiar(renombrar)}>
                    Guardar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRenombrar(null)}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <>
                  <span className={o.activa ? "" : "text-muted-foreground line-through"}>{o.nombre}</span>
                  {editable && (
                    <div className="flex items-center gap-3">
                      <Button size="icon-sm" variant="ghost" onClick={() => setRenombrar({ id: o.id, nombre: o.nombre, activa: o.activa })} aria-label={`Renombrar ${o.nombre}`}>
                        <Pencil className="size-4" />
                      </Button>
                      <Switch checked={o.activa} onCheckedChange={(v) => cambiar({ id: o.id, nombre: o.nombre, activa: v })} aria-label={`${o.nombre} activa`} />
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/** Modelos de consentimiento informado: se completan solos con los datos del paciente al firmar */
function ModelosConsentimiento() {
  const { puede } = useRole();
  const editable = puede("configuracion");
  const { data: plantillas = [] } = usePlantillas();
  const accion = useAccionClinica();
  const [edit, setEdit] = useState<{ id?: string; titulo: string; texto: string; activa: boolean } | null>(null);
  const guardar = async () => {
    try {
      await accion.mutateAsync({ url: edit!.id ? `/consentimientos/plantillas/${edit!.id}` : "/consentimientos/plantillas", metodo: edit!.id ? "PUT" : "POST", body: { titulo: edit!.titulo, texto: edit!.texto, activa: edit!.activa } });
      toast.success("Modelo guardado");
      setEdit(null);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar");
    }
  };
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Son modelos orientativos: revisalos y adaptalos a tu práctica. Al firmar se completan solos <code className="rounded bg-muted px-1">{"{paciente}"}</code>, <code className="rounded bg-muted px-1">{"{dni}"}</code>, <code className="rounded bg-muted px-1">{"{profesional}"}</code>, <code className="rounded bg-muted px-1">{"{consultorio}"}</code> y <code className="rounded bg-muted px-1">{"{fecha}"}</code>. Lo ya firmado no cambia.
        </p>
        {editable && (
          <Button onClick={() => setEdit({ titulo: "", texto: "", activa: true })}>
            <Plus className="size-4" /> Nuevo modelo
          </Button>
        )}
      </div>
      <Card className="overflow-hidden p-0 shadow-none">
        <ul className="divide-y">
          {plantillas.map((p) => (
            <li key={p.id} className={cn("flex items-center justify-between gap-3 px-4 py-3", !p.activa && "opacity-50")}>
              <span>{p.titulo}</span>
              {editable && (
                <Button size="icon-sm" variant="ghost" onClick={() => setEdit(p)} aria-label={`Editar ${p.titulo}`}>
                  <Pencil className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Editar modelo" : "Nuevo modelo de consentimiento"}</DialogTitle>
            <DialogDescription>Escribilo como lo va a leer el paciente.</DialogDescription>
          </DialogHeader>
          {edit && (
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="mod-titulo">Título</Label>
                <Input id="mod-titulo" value={edit.titulo} onChange={(e) => setEdit({ ...edit, titulo: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="mod-texto">Texto</Label>
                <Textarea id="mod-texto" rows={14} value={edit.texto} onChange={(e) => setEdit({ ...edit, texto: e.target.value })} />
              </div>
              {edit.id && (
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={edit.activa} onCheckedChange={(v) => setEdit({ ...edit, activa: v })} aria-label="Activo" /> Activo
                </label>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={accion.isPending}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function PrestacionesPage() {
  const { puede } = useRole();
  return (
    <>
      <PageHeader title="Prestaciones y precios" description="El nomenclador del consultorio, las obras sociales y cuánto se cobra cada prestación en cada una." />
      <Tabs defaultValue="precios">
        <div className="-mx-4 mb-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          <TabsList className="w-max">
            <TabsTrigger value="precios">Precios</TabsTrigger>
            <TabsTrigger value="nomenclador">Nomenclador</TabsTrigger>
            <TabsTrigger value="obras">Obras sociales</TabsTrigger>
            {puede("historia.ver") && <TabsTrigger value="consentimientos">Consentimientos</TabsTrigger>}
          </TabsList>
        </div>
        <TabsContent value="precios">
          <Precios />
        </TabsContent>
        <TabsContent value="nomenclador">
          <Nomenclador />
        </TabsContent>
        <TabsContent value="obras">
          <ObrasSociales />
        </TabsContent>
        {puede("historia.ver") && (
          <TabsContent value="consentimientos">
            <ModelosConsentimiento />
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}
