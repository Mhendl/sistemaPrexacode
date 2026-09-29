import { useState } from "react";
import { FileSpreadsheet, FlaskConical, Loader2, Receipt, TrendingUp, Undo2, Wallet } from "lucide-react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { useLibroIva, useReporteVentas } from "@/api/hooks";
import type { LibroIvaApi, Periodo, ReporteVentasApi } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { KpiCard } from "@/components/shared/KpiCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";
import { formatCuit, formatDate, formatMoney, formatMoneyShort } from "@/lib/format";
import { exportarReporte } from "@/lib/planillas";
import { cn } from "@/lib/utils";
import { VentasChart } from "@/modules/inicio/VentasChart";

type Rango = "mes" | "mes-anterior" | "trimestre" | "anio" | "anio-anterior" | "personalizado";

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/** Rangos habituales, en fecha local */
function rango(r: Exclude<Rango, "personalizado">): Periodo {
  const hoy = new Date();
  const a = hoy.getFullYear();
  const m = hoy.getMonth();
  switch (r) {
    case "mes":
      return { desde: iso(new Date(a, m, 1)), hasta: iso(hoy) };
    case "mes-anterior":
      return { desde: iso(new Date(a, m - 1, 1)), hasta: iso(new Date(a, m, 0)) };
    case "trimestre":
      return { desde: iso(new Date(a, m - 2, 1)), hasta: iso(hoy) };
    case "anio":
      return { desde: iso(new Date(a, 0, 1)), hasta: iso(hoy) };
    case "anio-anterior":
      return { desde: iso(new Date(a - 1, 0, 1)), hasta: iso(new Date(a - 1, 11, 31)) };
  }
}

const nombresRango: Record<Rango, string> = {
  mes: "Este mes",
  "mes-anterior": "Mes anterior",
  trimestre: "Últimos 3 meses",
  anio: "Este año",
  "anio-anterior": "Año anterior",
  personalizado: "Personalizado",
};

const cant = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 3 });
const ali = (a: number) => a.toLocaleString("es-AR");

type FilaCliente = ReporteVentasApi["porCliente"][number];
type FilaProducto = ReporteVentasApi["porProducto"][number];

const columnasCliente: Column<FilaCliente>[] = [
  { key: "cliente", header: "Cliente", sortValue: (c) => c.razonSocial, cell: (c) => <span className="font-medium">{c.razonSocial}</span> },
  { key: "cuit", header: "CUIT", cell: (c) => <span className="tabular text-muted-foreground">{formatCuit(c.cuit)}</span>, hideBelow: "md" },
  { key: "facturas", header: "Facturas", align: "right", sortValue: (c) => c.facturas, cell: (c) => <span className="tabular">{c.facturas}</span>, hideBelow: "sm" },
  { key: "neto", header: "Neto", align: "right", sortValue: (c) => c.neto, cell: (c) => <span className="tabular whitespace-nowrap">{formatMoney(c.neto)}</span>, hideBelow: "sm" },
  { key: "total", header: "Total", align: "right", sortValue: (c) => c.total, cell: (c) => <span className="tabular font-medium whitespace-nowrap">{formatMoney(c.total)}</span> },
];

const columnasProducto: Column<FilaProducto>[] = [
  {
    key: "producto",
    header: "Producto o servicio",
    sortValue: (p) => p.descripcion,
    cell: (p) => (
      <span>
        <span className="font-medium">{p.descripcion}</span>
        {p.codigo ? <span className="text-muted-foreground"> · {p.codigo}</span> : !p.productoId && <span className="text-muted-foreground"> · ítem libre</span>}
      </span>
    ),
  },
  { key: "cantidad", header: "Cantidad", align: "right", sortValue: (p) => p.cantidad, cell: (p) => <span className="tabular whitespace-nowrap">{cant(p.cantidad)} {p.unidad}</span> },
  { key: "neto", header: "Neto vendido", align: "right", sortValue: (p) => p.neto, cell: (p) => <span className="tabular font-medium whitespace-nowrap">{formatMoney(p.neto)}</span> },
];

export function ReportesPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "iva" ? "iva" : "ventas";
  const [tipoRango, setTipoRango] = useState<Rango>("mes");
  const [periodo, setPeriodo] = useState<Periodo>(() => rango("mes"));
  const [exportando, setExportando] = useState(false);
  const invertido = periodo.hasta < periodo.desde;

  const ventas = useReporteVentas(periodo);
  const libro = useLibroIva(periodo);

  const elegirRango = (r: Rango) => {
    setTipoRango(r);
    if (r !== "personalizado") setPeriodo(rango(r));
  };
  const cambiarFecha = (campo: keyof Periodo, valor: string) => {
    if (!valor) return;
    setTipoRango("personalizado");
    setPeriodo((p) => ({ ...p, [campo]: valor }));
  };

  const exportar = async () => {
    if (!ventas.data || !libro.data) return;
    setExportando(true);
    try {
      await exportarReporte(`reporte-${periodo.desde}-a-${periodo.hasta}`, hojasExcel(ventas.data, libro.data));
    } catch {
      toast.error("No se pudo generar el Excel");
    } finally {
      setExportando(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Reportes"
        description="Ventas del período (las notas de crédito restan) y el Libro IVA Ventas para tu contador."
        actions={
          <Button variant="outline" onClick={exportar} disabled={!ventas.data || !libro.data || exportando}>
            {exportando ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
            Exportar a Excel
          </Button>
        }
      />

      <Card className="mb-6 shadow-none">
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="grid gap-1.5 sm:w-48">
            <Label htmlFor="rep-rango">Período</Label>
            <Select value={tipoRango} onValueChange={(v) => elegirRango(v as Rango)}>
              <SelectTrigger id="rep-rango" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(nombresRango) as Rango[]).map((r) => (
                  <SelectItem key={r} value={r}>
                    {nombresRango[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:flex">
            <div className="grid gap-1.5">
              <Label htmlFor="rep-desde">Desde</Label>
              <Input id="rep-desde" type="date" value={periodo.desde} onChange={(e) => cambiarFecha("desde", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rep-hasta">Hasta</Label>
              <Input id="rep-hasta" type="date" value={periodo.hasta} onChange={(e) => cambiarFecha("hasta", e.target.value)} aria-invalid={invertido} />
            </div>
          </div>
          {invertido && <p className="text-sm text-destructive sm:pb-2">La fecha "hasta" es anterior a "desde".</p>}
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setParams(v === "iva" ? { tab: v } : {}, { replace: true })}>
        <TabsList className="mb-4">
          <TabsTrigger value="ventas">Ventas</TabsTrigger>
          <TabsTrigger value="iva">Libro IVA Ventas</TabsTrigger>
        </TabsList>
        <TabsContent value="ventas">
          <QueryState isLoading={ventas.isLoading} error={ventas.error} onRetry={ventas.refetch}>
            {ventas.data && <Ventas r={ventas.data} />}
          </QueryState>
        </TabsContent>
        <TabsContent value="iva">
          <QueryState isLoading={libro.isLoading} error={libro.error} onRetry={libro.refetch}>
            {libro.data && <LibroIva l={libro.data} />}
          </QueryState>
        </TabsContent>
      </Tabs>
    </>
  );
}

function Ventas({ r }: { r: ReporteVentasApi }) {
  const { resumen } = r;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div data-testid="kpi-ventas">
          <KpiCard label="Ventas del período" value={formatMoneyShort(resumen.total)} icon={TrendingUp} tone="highlight" hint={`${formatMoney(resumen.neto)} sin IVA`} />
        </div>
        <KpiCard label="Facturas" value={String(resumen.facturas)} icon={Receipt} hint={resumen.facturas ? `Ticket promedio ${formatMoney(resumen.ticketPromedio)}` : "Sin facturas en el período"} />
        <KpiCard label="Notas de crédito" value={formatMoneyShort(resumen.notasCredito)} icon={Undo2} tone={resumen.notas ? "warning" : "default"} hint={`${resumen.notas} ${resumen.notas === 1 ? "nota" : "notas"}`} />
        <KpiCard label="IVA débito fiscal" value={formatMoneyShort(resumen.iva)} icon={Wallet} tone="success" hint="Neto de notas de crédito" />
      </div>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>{r.agrupacion === "dia" ? "Ventas por día" : "Ventas por mes"}</CardTitle>
        </CardHeader>
        <CardContent>
          <VentasChart data={r.serie.map((s) => ({ mes: s.etiqueta, total: s.total }))} resaltarUltimo={false} />
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="min-w-0">
          <h2 className="mb-3 text-base font-semibold">Por cliente</h2>
          <DataTable
            data={r.porCliente}
            columns={columnasCliente}
            rowKey={(c) => c.clienteId}
            searchText={(c) => `${c.razonSocial} ${c.cuit}`}
            searchPlaceholder="Buscar cliente…"
            pageSize={10}
            emptyText="Sin ventas en el período"
          />
        </section>
        <section className="min-w-0">
          <h2 className="mb-3 text-base font-semibold">Por producto o servicio</h2>
          <DataTable
            data={r.porProducto}
            columns={columnasProducto}
            rowKey={(p) => p.productoId ?? `libre:${p.descripcion}`}
            searchText={(p) => `${p.descripcion} ${p.codigo ?? ""}`}
            searchPlaceholder="Buscar producto…"
            pageSize={10}
            emptyText="Sin ventas en el período"
          />
        </section>
      </div>
    </div>
  );
}

function Importe({ v, className }: { v: number; className?: string }) {
  return <TableCell className={cn("tabular text-right whitespace-nowrap", v < 0 && "text-destructive", className)}>{v ? formatMoney(v) : "—"}</TableCell>;
}

function LibroIva({ l }: { l: LibroIvaApi }) {
  return (
    <>
      {l.conPruebas && (
        <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-warning/50 bg-warning/10 px-3 py-2.5 text-sm" data-testid="aviso-libro-prueba">
          <FlaskConical className="mt-0.5 size-4 shrink-0 text-warning-ink" />
          <span>
            <b>Incluye comprobantes de prueba.</b> <span className="text-muted-foreground">Los emitidos en modo de prueba no tienen validez fiscal: no los presentes ante ARCA.</span>
          </span>
        </div>
      )}
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <Table data-testid="libro-iva">
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Fecha</TableHead>
              <TableHead>Comprobante</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>CUIT</TableHead>
              <TableHead className="text-right">Neto gravado</TableHead>
              <TableHead className="text-right">Exento</TableHead>
              {l.alicuotas.map((a) => (
                <TableHead key={a} className="text-right whitespace-nowrap">
                  IVA {ali(a)} %
                </TableHead>
              ))}
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {l.renglones.map((x) => (
              <TableRow key={x.id} data-testid="renglon-libro">
                <TableCell className="tabular">{formatDate(x.fecha)}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {x.tipo} <span className="tabular">{x.numero}</span>
                </TableCell>
                <TableCell>
                  <div>{x.razonSocial}</div>
                  <div className="text-xs text-muted-foreground">{x.condicionIva}</div>
                </TableCell>
                <TableCell className="tabular whitespace-nowrap">{formatCuit(x.cuit)}</TableCell>
                <Importe v={x.neto} />
                <Importe v={x.exento} />
                {l.alicuotas.map((a) => (
                  <Importe key={a} v={x.iva[String(a)] ?? 0} />
                ))}
                <Importe v={x.total} className="font-medium" />
              </TableRow>
            ))}
            {l.renglones.length === 0 && (
              <TableRow>
                <TableCell colSpan={7 + l.alicuotas.length} className="py-10 text-center text-muted-foreground">
                  No hay comprobantes autorizados en el período
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          {l.renglones.length > 0 && (
            <TableFooter data-testid="libro-totales">
              <TableRow className="font-semibold">
                <TableCell colSpan={4}>Totales ({l.renglones.length} comprobantes)</TableCell>
                <Importe v={l.totales.neto} />
                <Importe v={l.totales.exento} />
                {l.alicuotas.map((a) => (
                  <Importe key={a} v={l.totales.iva[String(a)] ?? 0} />
                ))}
                <Importe v={l.totales.total} />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </Card>
    </>
  );
}

/** Hojas del Excel: resumen, por cliente, por producto y Libro IVA */
function hojasExcel(r: ReporteVentasApi, l: LibroIvaApi) {
  const periodo = `${formatDate(r.desde)} al ${formatDate(r.hasta)}`;
  return [
    {
      nombre: "Resumen",
      anchos: [28, 18],
      filas: [
        ["Período", periodo],
        [],
        ["Facturado", r.resumen.facturado],
        ["Notas de crédito", -r.resumen.notasCredito],
        ["Ventas (total)", r.resumen.total],
        ["Neto sin IVA", r.resumen.neto],
        ["IVA débito fiscal", r.resumen.iva],
        ["Cantidad de facturas", r.resumen.facturas],
        ["Ticket promedio", r.resumen.ticketPromedio],
        [],
        [r.agrupacion === "dia" ? "Día" : "Mes", "Total"],
        ...r.serie.map((s) => [r.agrupacion === "dia" ? formatDate(s.clave) : s.etiqueta, s.total]),
      ],
    },
    {
      nombre: "Por cliente",
      anchos: [36, 16, 10, 16, 16],
      filas: [["Cliente", "CUIT", "Facturas", "Neto", "Total"], ...r.porCliente.map((c) => [c.razonSocial, formatCuit(c.cuit), c.facturas, c.neto, c.total])],
    },
    {
      nombre: "Por producto",
      anchos: [14, 40, 12, 10, 16],
      filas: [["Código", "Descripción", "Cantidad", "Unidad", "Neto vendido"], ...r.porProducto.map((p) => [p.codigo ?? "", p.descripcion, p.cantidad, p.unidad, p.neto])],
    },
    {
      nombre: "Libro IVA Ventas",
      anchos: [12, 22, 16, 36, 16, 24, 16, 14, ...l.alicuotas.map(() => 14), 16],
      filas: [
        ["Fecha", "Tipo", "Número", "Cliente", "CUIT", "Condición IVA", "Neto gravado", "Exento", ...l.alicuotas.map((a) => `IVA ${ali(a)} %`), "Total"],
        ...l.renglones.map((x) => [formatDate(x.fecha), x.tipo, x.numero, x.razonSocial, formatCuit(x.cuit), x.condicionIva, x.neto, x.exento, ...l.alicuotas.map((a) => x.iva[String(a)] ?? 0), x.total]),
        ["Totales", "", "", "", "", "", l.totales.neto, l.totales.exento, ...l.alicuotas.map((a) => l.totales.iva[String(a)] ?? 0), l.totales.total],
      ],
    },
  ];
}
