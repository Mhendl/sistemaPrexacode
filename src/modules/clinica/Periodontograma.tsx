import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { QueryState } from "@/components/shared/QueryState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRole } from "@/context/AuthProvider";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAccionClinica, usePeriodontogramas, type IndicesPerio, type PeriodontogramaApi, type PiezaPerio } from "./api";

const SUPERIOR = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const INFERIOR = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
const TODAS = [...SUPERIOR, ...INFERIOR];
/** Sitios: vestibular distal, medio y mesial · lingual/palatino distal, medio y mesial */
const SITIOS_V = [0, 1, 2];
const SITIOS_L = [3, 4, 5];

interface Fila {
  ausente: boolean;
  ps: string[];
  mg: string[];
  sangrado: boolean[];
  movilidad: string;
  furca: string;
}
const filaVacia = (): Fila => ({ ausente: false, ps: Array(6).fill(""), mg: Array(6).fill(""), sangrado: Array(6).fill(false), movilidad: "0", furca: "0" });
const aNum = (v: string) => (v.trim() === "" ? null : Number(v));

const colorPs = (ps: number | null) => (ps === null ? "" : ps >= 6 ? "bg-destructive/20 text-destructive font-semibold" : ps >= 4 ? "bg-warning/20 font-semibold" : "");

/** Cargar un examen periodontal nuevo */
function NuevoExamen({ pacienteId, anterior, open, onOpenChange }: { pacienteId: string; anterior?: PeriodontogramaApi; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [filas, setFilas] = useState<Record<number, Fila>>(() => Object.fromEntries(TODAS.map((p) => [p, { ...filaVacia(), ausente: !!anterior?.piezas[String(p)]?.ausente }])));
  const [notas, setNotas] = useState("");
  const accion = useAccionClinica();
  const set = (p: number, cambio: Partial<Fila>) => setFilas((f) => ({ ...f, [p]: { ...f[p]!, ...cambio } }));
  const setSitio = (p: number, campo: "ps" | "mg", i: number, v: string) => setFilas((f) => {
    const x = [...f[p]![campo]];
    x[i] = v.replace(/[^\d-]/g, "").slice(0, 3);
    return { ...f, [p]: { ...f[p]!, [campo]: x } };
  });

  const guardar = async () => {
    const piezas: Record<string, PiezaPerio> = {};
    for (const p of TODAS) {
      const f = filas[p]!;
      const ps = f.ps.map(aNum);
      if (!f.ausente && ps.every((x) => x === null)) continue;
      piezas[String(p)] = { ausente: f.ausente || undefined, ps: f.ausente ? Array(6).fill(null) : ps, mg: f.ausente ? Array(6).fill(null) : f.mg.map(aNum), sangrado: f.sangrado, placa: Array(6).fill(false), movilidad: Number(f.movilidad), furca: Number(f.furca) };
    }
    try {
      await accion.mutateAsync({ url: `/pacientes/${pacienteId}/periodontogramas`, body: { piezas, notas: notas.trim() || null } });
      toast.success("Examen periodontal guardado");
      onOpenChange(false);
    } catch (e) {
      if (!(e instanceof ApiError)) return toast.error("No se pudo guardar");
      // Qué piezas tienen valores fuera de rango (los detalles vienen como "piezas.16.ps.1")
      const piezasMal = [...new Set(Object.keys(e.details).map((k) => k.split(".")[1]).filter(Boolean))];
      toast.error(piezasMal.length ? `Revisá la${piezasMal.length > 1 ? "s piezas" : " pieza"} ${piezasMal.join(", ")}: hay valores fuera de rango (de 0 a 20 mm).` : e.message, { duration: 8000 });
    }
  };

  const celda = (p: number, campo: "ps" | "mg", i: number) => (
    <input
      key={`${campo}${i}`}
      value={filas[p]![campo][i]}
      onChange={(e) => setSitio(p, campo, i, e.target.value)}
      disabled={filas[p]!.ausente}
      inputMode="numeric"
      className={cn("h-7 w-7 rounded border bg-background text-center text-xs tabular focus:outline-2 focus:outline-primary disabled:opacity-30", campo === "ps" && colorPs(aNum(filas[p]![campo][i])))}
      aria-label={`${campo === "ps" ? "Profundidad" : "Margen"} ${p} sitio ${i + 1}`}
    />
  );
  const sangra = (p: number, i: number) => (
    <button
      key={`s${i}`}
      type="button"
      disabled={filas[p]!.ausente}
      onClick={() => set(p, { sangrado: filas[p]!.sangrado.map((b, j) => (j === i ? !b : b)) })}
      className={cn("h-5 w-7 rounded border text-[10px]", filas[p]!.sangrado[i] ? "border-destructive bg-destructive text-white" : "text-muted-foreground")}
      aria-pressed={filas[p]!.sangrado[i]}
      aria-label={`Sangrado ${p} sitio ${i + 1}`}
    >
      •
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94svh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Nuevo examen periodontal</DialogTitle>
          <DialogDescription>Por pieza: profundidad de sondaje (PS) y margen gingival (MG) en milímetros, en 3 sitios vestibulares y 3 linguales (distal, medio, mesial). Tocá • si sangra. Las piezas sin datos no se guardan.</DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="px-1 py-1 text-left">Pieza</th>
                <th className="px-1">Aus.</th>
                <th className="px-1">PS vestibular</th>
                <th className="px-1">MG vestibular</th>
                <th className="px-1">Sangrado V</th>
                <th className="px-1">PS lingual</th>
                <th className="px-1">MG lingual</th>
                <th className="px-1">Sangrado L</th>
                <th className="px-1">Mov.</th>
                <th className="px-1">Furca</th>
              </tr>
            </thead>
            <tbody>
              {TODAS.map((p) => (
                <tr key={p} className={cn("border-t", p === 48 && "border-t-4")} data-testid={`fila-perio-${p}`}>
                  <td className="px-1 py-1 font-semibold tabular">{p}</td>
                  <td className="px-1 text-center">
                    <input type="checkbox" checked={filas[p]!.ausente} onChange={(e) => set(p, { ausente: e.target.checked })} aria-label={`Pieza ${p} ausente`} />
                  </td>
                  <td className="px-1">
                    <div className="flex gap-0.5">{SITIOS_V.map((i) => celda(p, "ps", i))}</div>
                  </td>
                  <td className="px-1">
                    <div className="flex gap-0.5">{SITIOS_V.map((i) => celda(p, "mg", i))}</div>
                  </td>
                  <td className="px-1">
                    <div className="flex gap-0.5">{SITIOS_V.map((i) => sangra(p, i))}</div>
                  </td>
                  <td className="px-1">
                    <div className="flex gap-0.5">{SITIOS_L.map((i) => celda(p, "ps", i))}</div>
                  </td>
                  <td className="px-1">
                    <div className="flex gap-0.5">{SITIOS_L.map((i) => celda(p, "mg", i))}</div>
                  </td>
                  <td className="px-1">
                    <div className="flex gap-0.5">{SITIOS_L.map((i) => sangra(p, i))}</div>
                  </td>
                  {(["movilidad", "furca"] as const).map((k) => (
                    <td key={k} className="px-1">
                      <Select value={filas[p]![k]} onValueChange={(v) => set(p, { [k]: v })} disabled={filas[p]!.ausente}>
                        <SelectTrigger className="h-7 w-14 px-2 text-xs" aria-label={`${k === "movilidad" ? "Movilidad" : "Furca"} ${p}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["0", "1", "2", "3"].map((n) => (
                            <SelectItem key={n} value={n}>
                              {n}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="perio-notas">Notas</Label>
          <Textarea id="perio-notas" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Diagnóstico, indicaciones…" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={accion.isPending}>
            {accion.isPending && <Loader2 className="size-4 animate-spin" />}
            Guardar examen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Indice({ label, valor, antes, sufijo = "", mejorSiBaja = true }: { label: string; valor: number | null; antes?: number | null; sufijo?: string; mejorSiBaja?: boolean }) {
  const delta = valor !== null && antes !== null && antes !== undefined ? Math.round((valor - antes) * 10) / 10 : null;
  const mejora = delta !== null && (mejorSiBaja ? delta < 0 : delta > 0);
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular">{valor === null ? "—" : `${valor.toLocaleString("es-AR")}${sufijo}`}</div>
      {delta !== null && delta !== 0 && (
        <div className={cn("flex items-center gap-0.5 text-xs", mejora ? "text-success" : "text-destructive")}>
          {delta < 0 ? <ArrowDownRight className="size-3" /> : <ArrowUpRight className="size-3" />}
          {Math.abs(delta).toLocaleString("es-AR")}
          {sufijo} vs. anterior
        </div>
      )}
    </div>
  );
}

/** Un examen: la tabla de profundidades con colores y los índices, comparados con el anterior */
function Examen({ e, anterior }: { e: PeriodontogramaApi; anterior?: IndicesPerio }) {
  const fila = (piezas: number[], sitios: number[], titulo: string) => (
    <tr>
      <th className="px-1 py-1 text-left text-[10px] font-medium whitespace-nowrap text-muted-foreground">{titulo}</th>
      {piezas.map((p) => {
        const x = e.piezas[String(p)];
        return (
          <td key={p} className="px-0.5 py-0.5">
            {x?.ausente ? (
              <div className="h-6 rounded bg-muted text-center text-[10px] leading-6 text-muted-foreground">aus.</div>
            ) : (
              <div className="flex justify-center gap-px">
                {sitios.map((i) => (
                  <span key={i} className={cn("relative inline-block w-4 rounded-sm text-center text-[10px] leading-5 tabular", colorPs(x?.ps[i] ?? null))}>
                    {x?.ps[i] ?? "·"}
                    {x?.sangrado[i] && <span className="absolute -top-0.5 right-0 size-1.5 rounded-full bg-destructive" />}
                  </span>
                ))}
              </div>
            )}
          </td>
        );
      })}
    </tr>
  );
  const encabezado = (piezas: number[]) => (
    <tr>
      <th />
      {piezas.map((p) => (
        <th key={p} className="px-0.5 text-[10px] font-semibold tabular">
          {p}
        </th>
      ))}
    </tr>
  );
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="indices-perio">
        <Indice label="Profundidad promedio" valor={e.indices.psPromedio} antes={anterior?.psPromedio} sufijo=" mm" />
        <Indice label="Sangrado al sondaje" valor={e.indices.sangrado} antes={anterior?.sangrado} sufijo=" %" />
        <Indice label="Sitios de 4 mm o más" valor={e.indices.sitiosPs4} antes={anterior?.sitiosPs4} />
        <Indice label="Inserción clínica promedio" valor={e.indices.nicPromedio} antes={anterior?.nicPromedio} sufijo=" mm" />
      </div>
      <div className="overflow-x-auto rounded-lg border p-2">
        <table className="mx-auto">
          <tbody>
            {encabezado(SUPERIOR)}
            {fila(SUPERIOR, SITIOS_V, "Vestibular")}
            {fila(SUPERIOR, SITIOS_L, "Palatino")}
            <tr>
              <td colSpan={17} className="h-3" />
            </tr>
            {fila(INFERIOR, SITIOS_L, "Lingual")}
            {fila(INFERIOR, SITIOS_V, "Vestibular")}
            {encabezado(INFERIOR)}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-warning/40" /> 4–5 mm
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-destructive/30" /> 6 mm o más
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-destructive" /> Sangrado
        </span>
      </div>
      {e.notas && <p className="rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-wrap">{e.notas}</p>}
    </div>
  );
}

export function Periodontograma({ pacienteId }: { pacienteId: string }) {
  const { puede } = useRole();
  const lista = usePeriodontogramas(pacienteId);
  const [nuevo, setNuevo] = useState(false);
  const examenes = useMemo(() => lista.data ?? [], [lista.data]);
  const [elegido, setElegido] = useState<string | null>(null);
  const actual = examenes.find((e) => e.id === elegido) ?? examenes.at(-1);
  const idx = actual ? examenes.indexOf(actual) : -1;
  const anterior = idx > 0 ? examenes[idx - 1] : undefined;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {examenes.length > 0 ? (
          <Select value={actual?.id} onValueChange={setElegido}>
            <SelectTrigger className="w-72" aria-label="Examen">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {examenes.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {formatDate(e.fecha)} · {e.profesional}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span />
        )}
        {puede("historia.editar") && (
          <Button onClick={() => setNuevo(true)}>
            <Plus className="size-4" /> Nuevo examen
          </Button>
        )}
      </div>
      <QueryState isLoading={lista.isLoading} error={lista.error} onRetry={lista.refetch}>
        {actual ? (
          <Card className="p-4 shadow-none sm:p-6">
            <Examen e={actual} anterior={anterior?.indices} />
          </Card>
        ) : (
          <Card className="py-10 text-center text-sm text-muted-foreground shadow-none">Todavía no tiene exámenes periodontales.</Card>
        )}
      </QueryState>
      {nuevo && <NuevoExamen pacienteId={pacienteId} anterior={examenes.at(-1)} open={nuevo} onOpenChange={setNuevo} />}
    </div>
  );
}
