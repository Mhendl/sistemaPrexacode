import { useMemo, useState } from "react";
import { ArrowLeft, Loader2, Plus, Send, Trash2 } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { useClientes, useEmitirRemito, useProductos } from "@/api/hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/PageHeader";
import { aNumero } from "@/lib/numeros";
import { cn } from "@/lib/utils";
import { formatCantidad } from "@/modules/productos/stock";

interface Renglon {
  productoId: string;
  cantidad: string;
}

const hoy = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export function NuevoRemitoPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: clientes = [] } = useClientes();
  const { data: productos = [] } = useProductos();
  const emitir = useEmitirRemito();

  const [clienteId, setClienteId] = useState(params.get("cliente") ?? "");
  const [fecha, setFecha] = useState(hoy());
  const [domicilio, setDomicilio] = useState<string | null>(null);
  const [observaciones, setObservaciones] = useState("");
  const [renglones, setRenglones] = useState<Renglon[]>([]);
  const [errores, setErrores] = useState<Record<string, string>>({});

  const cliente = clientes.find((c) => c.id === clienteId);
  const domicilioCliente = cliente ? [cliente.domicilio, cliente.localidad].filter(Boolean).join(", ") : "";
  const activos = useMemo(() => productos.filter((p) => p.activo), [productos]);
  const disponibles = activos.filter((p) => !renglones.some((r) => r.productoId === p.id));

  const agregar = (productoId: string) => setRenglones((rs) => [...rs, { productoId, cantidad: "1" }]);
  const quitar = (i: number) => setRenglones((rs) => rs.filter((_, k) => k !== i));
  const cambiar = (i: number, cantidad: string) => setRenglones((rs) => rs.map((r, k) => (k === i ? { ...r, cantidad } : r)));

  const submit = async () => {
    setErrores({});
    try {
      const r = await emitir.mutateAsync({
        clienteId,
        fecha,
        domicilioEntrega: domicilio === null ? domicilioCliente || null : domicilio || null,
        observaciones: observaciones || null,
        items: renglones.map((r) => ({ productoId: r.productoId, cantidad: aNumero(r.cantidad) })),
      });
      toast.success(`Remito ${String(r.puntoVenta).padStart(4, "0")}-${String(r.numero).padStart(8, "0")} emitido`);
      navigate(`/remitos/${r.id}`);
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      setErrores(err.details);
      toast.error(err.message);
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-3 -ml-2 text-muted-foreground">
        <Link to="/remitos">
          <ArrowLeft className="size-4" /> Remitos
        </Link>
      </Button>
      <PageHeader
        title="Nuevo remito"
        description="Al emitirlo se descuenta el stock de los productos."
        actions={
          <Button onClick={submit} disabled={emitir.isPending}>
            {emitir.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Emitir remito
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Card className="h-fit shadow-none">
          <CardHeader>
            <CardTitle>Entrega</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="rem-cliente">Cliente</Label>
              <Select value={clienteId} onValueChange={(v) => { setClienteId(v); setDomicilio(null); }}>
                <SelectTrigger id="rem-cliente" className="w-full" aria-invalid={!!errores.clienteId}>
                  <SelectValue placeholder="Elegí un cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clientes
                    .filter((c) => c.estado === "Activo")
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
              <Label htmlFor="rem-fecha">Fecha</Label>
              <Input id="rem-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rem-domicilio">Domicilio de entrega</Label>
              <Input id="rem-domicilio" value={domicilio ?? domicilioCliente} onChange={(e) => setDomicilio(e.target.value)} placeholder="Si queda vacío, no se imprime" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rem-obs">Observaciones</Label>
              <Textarea id="rem-obs" rows={3} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Ej.: entregar por la tarde, preguntar por Jorge" />
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 pb-0 shadow-none">
          <CardHeader className="pb-4">
            <CardTitle>Productos a entregar</CardTitle>
          </CardHeader>
          <div className="px-6 pb-4">
            <Select value="" onValueChange={agregar}>
              <SelectTrigger className="w-full" aria-label="Agregar producto">
                <Plus className="size-4" />
                <SelectValue placeholder="Agregar producto" />
              </SelectTrigger>
              <SelectContent>
                {disponibles.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.descripcion} <span className="text-muted-foreground">· {p.codigo}{p.controlaStock ? ` · stock ${formatCantidad(p.stock)}` : ""}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errores.items && <p className="mt-1 text-xs text-destructive">{errores.items}</p>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-6 py-2 font-medium">Producto</th>
                  <th className="w-32 px-2 py-2 font-medium">Cantidad</th>
                  <th className="px-2 py-2 text-right font-medium">Disponible</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody>
                {renglones.map((r, i) => {
                  const p = productos.find((x) => x.id === r.productoId)!;
                  const error = errores[`items.${i}.cantidad`] ?? errores[`items.${i}.productoId`];
                  const n = aNumero(r.cantidad);
                  const excede = p.controlaStock && !Number.isNaN(n) && n > p.stock;
                  return (
                    <tr key={r.productoId} className="border-b align-top" data-testid="renglon-remito">
                      <td className="px-6 py-2.5">
                        <div className="font-medium">{p.descripcion}</div>
                        <div className="text-xs text-muted-foreground">{p.codigo}</div>
                        {error && <div className="mt-0.5 text-xs text-destructive">{error}</div>}
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          aria-label={`Cantidad de ${p.descripcion}`}
                          inputMode="decimal"
                          value={r.cantidad}
                          onChange={(e) => cambiar(i, e.target.value)}
                          className={cn("h-8", (excede || error) && "border-destructive")}
                        />
                      </td>
                      <td className={cn("tabular px-2 py-3 text-right whitespace-nowrap", excede ? "text-destructive" : "text-muted-foreground")}>
                        {p.controlaStock ? `${formatCantidad(p.stock)} ${p.unidad}` : "Servicio"}
                      </td>
                      <td className="px-2 py-2">
                        <Button variant="ghost" size="icon-sm" onClick={() => quitar(i)} aria-label={`Quitar ${p.descripcion}`}>
                          <Trash2 className="size-4 text-muted-foreground" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {renglones.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-10 text-center text-muted-foreground">
                      Todavía no agregaste productos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
