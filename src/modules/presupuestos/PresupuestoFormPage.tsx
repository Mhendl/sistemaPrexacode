import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { manejarErrorGuardado } from "@/api/errores";
import { useClientes, useConfigFacturacion, useGuardarPresupuesto, usePresupuesto, useProductos } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/PageHeader";
import { PaperFit } from "@/components/shared/PaperFit";
import { useRole } from "@/context/AuthProvider";
import { letraSegun } from "@/lib/facturacion";
import { ItemsEditor, itemsDesdeParametro, useRenglones } from "@/modules/facturacion/ItemsEditor";
import { numeroPresupuesto, PresupuestoHoja } from "./PresupuestoHoja";

const hoyLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const sumarDias = (f: string, n: number) => {
  const d = new Date(`${f}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Alta y edición de presupuestos */
export function PresupuestoFormPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { empresa } = useRole();
  const { data: config } = useConfigFacturacion();
  const { data: clientes = [] } = useClientes();
  const { data: productos = [] } = useProductos();
  const { data: existente } = usePresupuesto(id);
  const guardar = useGuardarPresupuesto();

  const [clienteId, setClienteId] = useState(params.get("cliente") ?? "");
  // Presupuesto hecho desde una oportunidad del embudo (solo al crear)
  const oportunidadId = id ? undefined : (params.get("oportunidad") ?? undefined);
  const [fecha, setFecha] = useState(hoyLocal());
  const [validoHasta, setValidoHasta] = useState(sumarDias(hoyLocal(), 15));
  const [condiciones, setCondiciones] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});

  const cliente = clientes.find((c) => c.id === clienteId);
  const letra = letraSegun(config?.condicionIvaEmisor ?? empresa.condicionIva, cliente?.condicionIva ?? "Consumidor Final");
  const editor = useRenglones(letra, productos);
  const { cargar } = editor;

  useEffect(() => {
    if (!existente || (productos.length === 0 && existente.items.some((i) => i.productoId))) return;
    setClienteId(existente.clienteId);
    setFecha(existente.fecha);
    setValidoHasta(existente.validoHasta);
    setCondiciones(existente.condiciones ?? "");
    setObservaciones(existente.observaciones ?? "");
    cargar(existente.items);
  }, [existente, productos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Desde "Productos que usa" del cliente: precarga esos productos (una sola vez)
  const productosParam = params.get("productos");
  const precargado = useRef(false);
  useEffect(() => {
    if (precargado.current || id || !productosParam || productos.length === 0) return;
    precargado.current = true;
    cargar(itemsDesdeParametro(productosParam, productos));
  }, [productos]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    setErrores({});
    try {
      const p = await guardar.mutateAsync({
        id,
        datos: { clienteId, fecha, validoHasta, condiciones: condiciones || null, observaciones: observaciones || null, items: editor.paraEnviar(), version: existente?.version, oportunidadId },
      });
      toast.success(id ? "Presupuesto actualizado" : `Presupuesto ${numeroPresupuesto(p.numero)} creado`);
      navigate(`/presupuestos/${p.id}`);
    } catch (err) {
      if (manejarErrorGuardado(err, { setErrores, qc, recargar: ["presupuestos"] })) navigate(`/presupuestos/${id}`);
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2 text-muted-foreground">
        <Link to={id ? `/presupuestos/${id}` : "/presupuestos"}>
          <ArrowLeft className="size-4" /> {id ? "Volver al presupuesto" : "Presupuestos"}
        </Link>
      </Button>
      <PageHeader
        title={id ? `Editar presupuesto ${numeroPresupuesto(existente?.numero ?? null)}` : "Nuevo presupuesto"}
        description={
          oportunidadId
            ? "Queda vinculado a la oportunidad: pasa a Propuesta, y cuando lo factures se marca como ganada."
            : "Los importes se calculan igual que en la factura, así el cliente ve lo que después le vas a facturar."
        }
        actions={
          <Button onClick={submit} disabled={guardar.isPending}>
            {guardar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Guardar presupuesto
          </Button>
        }
      />
      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle>Datos</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="pre-cliente">Cliente</Label>
                <Select value={clienteId} onValueChange={setClienteId}>
                  <SelectTrigger id="pre-cliente" className="w-full" aria-invalid={!!errores.clienteId}>
                    <SelectValue placeholder="Elegí un cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes
                      .filter((c) => c.estado === "Activo" || c.id === clienteId)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.razonSocial}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {errores.clienteId && <p className="text-xs text-destructive">{errores.clienteId}</p>}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pre-fecha">Fecha</Label>
                <Input id="pre-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="pre-valido">Válido hasta</Label>
                <Input id="pre-valido" type="date" value={validoHasta} onChange={(e) => setValidoHasta(e.target.value)} aria-invalid={!!errores.validoHasta} />
                {errores.validoHasta && <p className="text-xs text-destructive">{errores.validoHasta}</p>}
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="pre-condiciones">Condiciones</Label>
                <Textarea id="pre-condiciones" rows={2} value={condiciones} onChange={(e) => setCondiciones(e.target.value)} placeholder="Ej.: 50 % anticipado, saldo contra entrega. Entrega en 7 días hábiles." />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="pre-obs">Observaciones</Label>
                <Textarea id="pre-obs" rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
              </div>
            </CardContent>
          </Card>
          <ItemsEditor editor={editor} productos={productos} letra={letra} errores={errores} testidTotal="total-presupuesto" />
        </div>
        <div className="min-w-0">
          <div className="mb-2 text-sm font-medium text-muted-foreground">Vista previa</div>
          <div className="rounded-xl bg-muted p-3 sm:p-5 2xl:sticky 2xl:top-20">
            <PaperFit>
              <PresupuestoHoja
                empresa={empresa}
                p={{
                  numero: existente?.numero ?? null,
                  fecha,
                  validoHasta,
                  letra,
                  cliente: cliente ? { ...cliente, domicilio: [cliente.domicilio, cliente.localidad].filter(Boolean).join(", ") || null } : null,
                  items: editor.paraHoja(),
                  ...editor.totales,
                  condiciones,
                  observaciones,
                }}
              />
            </PaperFit>
          </div>
        </div>
      </div>
    </>
  );
}
