import { useMemo, useState } from "react";
import { Check, Loader2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { QueryState } from "@/components/shared/QueryState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRole } from "@/context/AuthProvider";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CARAS, ESTADOS_MARCA, NOMBRE_CARA, useAccionMarca, useMarcar, useOdontograma, usePrestaciones, type Cara, type EstadoMarca, type MarcaApi } from "./api";

/** Nomenclatura FDI, como se ve de frente al paciente: su derecha queda a la izquierda del dibujo */
const FILAS_PERMANENTES = [
  [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28],
  [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38],
];
const FILAS_TEMPORARIAS = [
  [55, 54, 53, 52, 51, 61, 62, 63, 64, 65],
  [85, 84, 83, 82, 81, 71, 72, 73, 74, 75],
];

/** Rojo: lo que hay que hacer. Azul: lo que ya está hecho o el paciente ya tenía. */
const COLOR: Record<EstadoMarca, string> = { a_realizar: "#dc2626", realizado: "#2563eb", existente: "#2563eb" };

const cuadrante = (p: number) => Math.floor(p / 10);
const esSuperior = (p: number) => [1, 2, 5, 6].includes(cuadrante(p));
/** Del lado derecho del paciente (se dibuja a la izquierda): la mesial queda hacia la derecha del dibujo */
const ladoDerecho = (p: number) => [1, 4, 5, 8].includes(cuadrante(p));

type Posicion = "arriba" | "abajo" | "izq" | "der" | "centro";
function caraEn(p: number, pos: Posicion): Cara {
  if (pos === "centro") return "O";
  if (pos === "arriba") return esSuperior(p) ? "V" : "L";
  if (pos === "abajo") return esSuperior(p) ? "L" : "V";
  if (pos === "der") return ladoDerecho(p) ? "M" : "D";
  return ladoDerecho(p) ? "D" : "M";
}

const T = 40; // lado de la pieza
const I = 13; // borde del cuadrado central
const POLIGONOS: Record<Posicion, string> = {
  arriba: `0,0 ${T},0 ${T - I},${I} ${I},${I}`,
  abajo: `0,${T} ${T},${T} ${T - I},${T - I} ${I},${T - I}`,
  izq: `0,0 ${I},${I} ${I},${T - I} 0,${T}`,
  der: `${T},0 ${T - I},${I} ${T - I},${T - I} ${T},${T}`,
  centro: `${I},${I} ${T - I},${I} ${T - I},${T - I} ${I},${T - I}`,
};

interface EstadoPieza {
  caras: Partial<Record<Cara, string>>;
  cruz?: string;
  circulo?: string;
  ausente?: boolean;
  etiquetas: { texto: string; color: string }[];
}

/** Lo que se dibuja en cada pieza: las marcas vigentes, en orden (la última manda) */
function dibujoDe(marcas: MarcaApi[]) {
  const piezas = new Map<number, EstadoPieza>();
  for (const m of marcas) {
    if (m.anuladoEn) continue;
    const e = piezas.get(m.pieza) ?? { caras: {}, etiquetas: [] };
    const color = COLOR[m.estado];
    const s = m.prestacion.simbolo;
    if (m.prestacion.alcance === "cara" || s === "relleno") for (const c of m.caras) e.caras[c] = color;
    else if (s === "cruz") e.cruz = color;
    else if (s === "circulo") e.circulo = color;
    else if (s === "ausente") e.ausente = true;
    else if (s === "texto" && m.prestacion.etiqueta) e.etiquetas.push({ texto: m.prestacion.etiqueta, color });
    piezas.set(m.pieza, e);
  }
  return piezas;
}

function Pieza({ numero, estado, elegida, carasElegidas, onPieza, onCara }: { numero: number; estado?: EstadoPieza; elegida: boolean; carasElegidas: Cara[]; onPieza: () => void; onCara: (c: Cara) => void }) {
  const arriba = esSuperior(numero);
  const etiqueta = estado?.etiquetas.map((e) => e.texto).join(" ");
  const numeroEl = (
    <button
      type="button"
      onClick={onPieza}
      className={cn("h-5 w-full rounded text-[11px] font-semibold tabular hover:bg-accent", elegida ? "bg-primary text-primary-foreground hover:bg-primary" : "text-muted-foreground")}
      aria-pressed={elegida}
      aria-label={`Pieza ${numero}`}
    >
      {numero}
    </button>
  );
  const etiquetaEl = <div className="h-4 text-center text-[10px] leading-4 font-bold" style={{ color: estado?.etiquetas.at(-1)?.color }}>{etiqueta}</div>;
  return (
    <div className="flex w-11 shrink-0 flex-col items-center gap-0.5" data-testid={`pieza-${numero}`}>
      {arriba ? numeroEl : etiquetaEl}
      <svg viewBox={`-3 -3 ${T + 6} ${T + 6}`} className={cn("size-11 rounded", elegida && "ring-2 ring-primary")} role="group" aria-label={`Caras de la pieza ${numero}`}>
        {(Object.keys(POLIGONOS) as Posicion[]).map((pos) => {
          const cara = caraEn(numero, pos);
          const color = estado?.caras[cara];
          const marcadaParaCargar = elegida && carasElegidas.includes(cara);
          return (
            <polygon
              key={pos}
              points={POLIGONOS[pos]}
              fill={color ?? (marcadaParaCargar ? "var(--primary)" : "var(--card)")}
              fillOpacity={color ? 0.85 : marcadaParaCargar ? 0.25 : 1}
              stroke="currentColor"
              strokeOpacity={0.45}
              strokeWidth={1}
              className={cn("cursor-pointer text-foreground", !color && !marcadaParaCargar && "hover:fill-accent")}
              onClick={() => onCara(cara)}
              data-cara={cara}
              data-color={color ?? ""}
            >
              <title>{`${numero} · ${NOMBRE_CARA[cara]}`}</title>
            </polygon>
          );
        })}
        {estado?.ausente && (
          <>
            <rect x={0} y={0} width={T} height={T} fill="var(--muted)" fillOpacity={0.85} pointerEvents="none" />
            <line x1={-2} y1={T / 2} x2={T + 2} y2={T / 2} stroke="#2563eb" strokeWidth={3} pointerEvents="none" />
          </>
        )}
        {estado?.cruz && (
          <g stroke={estado.cruz} strokeWidth={3.5} strokeLinecap="round" pointerEvents="none" data-simbolo="cruz">
            <line x1={2} y1={2} x2={T - 2} y2={T - 2} />
            <line x1={T - 2} y1={2} x2={2} y2={T - 2} />
          </g>
        )}
        {estado?.circulo && <circle cx={T / 2} cy={T / 2} r={T / 2 + 1} fill="none" stroke={estado.circulo} strokeWidth={2.5} pointerEvents="none" data-simbolo="circulo" />}
      </svg>
      {arriba ? etiquetaEl : numeroEl}
    </div>
  );
}

function Arcada({ filas, dibujo, elegidas, caras, onPieza, onCara }: { filas: number[][]; dibujo: Map<number, EstadoPieza>; elegidas: number[]; caras: Cara[]; onPieza: (p: number) => void; onCara: (p: number, c: Cara) => void }) {
  return (
    <div className="grid gap-3">
      {filas.map((fila) => {
        const mitad = fila.length / 2;
        return (
          <div key={fila[0]} className="flex justify-center gap-1">
            {fila.map((p, i) => (
              <div key={p} className={cn("flex", i === mitad && "border-l-2 border-dashed border-border pl-1")}>
                <Pieza numero={p} estado={dibujo.get(p)} elegida={elegidas.includes(p)} carasElegidas={caras} onPieza={() => onPieza(p)} onCara={(c) => onCara(p, c)} />
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function Odontograma({ pacienteId, edad }: { pacienteId: string; edad: number | null }) {
  const { puede } = useRole();
  const editable = puede("historia.editar");
  const marcas = useOdontograma(pacienteId);
  const { data: prestaciones = [] } = usePrestaciones();
  const marcar = useMarcar(pacienteId);
  const accion = useAccionMarca(pacienteId);

  const [elegidas, setElegidas] = useState<number[]>([]);
  const [caras, setCaras] = useState<Cara[]>([]);
  const [prestacionId, setPrestacionId] = useState("");
  const [estado, setEstado] = useState<EstadoMarca>("a_realizar");
  const [notas, setNotas] = useState("");
  const [verAnuladas, setVerAnuladas] = useState(false);
  const [anulando, setAnulando] = useState<MarcaApi | null>(null);
  const [motivo, setMotivo] = useState("");
  const tieneTemporarias = (marcas.data ?? []).some((m) => m.pieza >= 51);
  const [temporarias, setTemporarias] = useState<boolean | null>(null);
  const muestraTemporarias = temporarias ?? (tieneTemporarias || (edad !== null && edad < 13));

  const dibujo = useMemo(() => dibujoDe(marcas.data ?? []), [marcas.data]);
  const marcables = prestaciones.filter((p) => p.activa && p.alcance !== "general");
  const prestacion = marcables.find((p) => p.id === prestacionId);
  const porCara = prestacion?.alcance === "cara";

  const togglePieza = (p: number) => editable && setElegidas((xs) => (xs.includes(p) ? xs.filter((x) => x !== p) : [...xs, p]));
  const toggleCara = (c: Cara) => setCaras((xs) => (xs.includes(c) ? xs.filter((x) => x !== c) : [...xs, c]));
  /** Tocar una cara elige la pieza y esa cara */
  const tocarCara = (p: number, c: Cara) => {
    if (!editable) return;
    if (!elegidas.includes(p)) setElegidas((xs) => [...xs, p]);
    toggleCara(c);
  };
  const limpiar = () => {
    setElegidas([]);
    setCaras([]);
    setNotas("");
  };

  const cargar = async () => {
    try {
      const r = await marcar.mutateAsync({ prestacionId, piezas: elegidas, caras: porCara ? caras : [], estado, notas: notas.trim() || null });
      toast.success(`${prestacion?.nombre} marcada en ${r.length === 1 ? "la pieza" : `${r.length} piezas`}`);
      limpiar();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar");
    }
  };

  const realizar = async (m: MarcaApi) => {
    try {
      await accion.mutateAsync({ marcaId: m.id, accion: "realizar" });
      toast.success(`${m.prestacion.nombre} en ${m.pieza}: realizado`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar");
    }
  };

  const anular = async () => {
    if (!anulando) return;
    try {
      await accion.mutateAsync({ marcaId: anulando.id, accion: "anular", motivo });
      toast.success("Marca anulada. Queda en el historial.");
      setAnulando(null);
      setMotivo("");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo anular");
    }
  };

  const lista = (marcas.data ?? []).filter((m) => verAnuladas || !m.anuladoEn).slice().reverse();
  const pendientes = (marcas.data ?? []).filter((m) => !m.anuladoEn && m.estado === "a_realizar").length;

  return (
    <QueryState isLoading={marcas.isLoading} error={marcas.error} onRetry={marcas.refetch}>
      <div className="grid gap-6">
        <Card className="gap-4 p-4 shadow-none sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded-sm" style={{ background: COLOR.a_realizar }} /> A realizar
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-3 rounded-sm" style={{ background: COLOR.realizado }} /> Realizado o existente
              </span>
              {pendientes > 0 && <span data-testid="odontograma-pendientes">{pendientes} {pendientes === 1 ? "prestación pendiente" : "prestaciones pendientes"}</span>}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={muestraTemporarias} onCheckedChange={setTemporarias} aria-label="Piezas temporarias" /> Temporarias
            </label>
          </div>
          <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            <div className="mx-auto grid w-max gap-6">
              <Arcada filas={[FILAS_PERMANENTES[0]!]} dibujo={dibujo} elegidas={elegidas} caras={caras} onPieza={togglePieza} onCara={tocarCara} />
              {muestraTemporarias && <Arcada filas={FILAS_TEMPORARIAS} dibujo={dibujo} elegidas={elegidas} caras={caras} onPieza={togglePieza} onCara={tocarCara} />}
              <Arcada filas={[FILAS_PERMANENTES[1]!]} dibujo={dibujo} elegidas={elegidas} caras={caras} onPieza={togglePieza} onCara={tocarCara} />
            </div>
          </div>

          {editable && (
            <div className="grid gap-4 rounded-lg border bg-muted/30 p-4" data-testid="cargar-marca">
              <div className="text-sm">
                {elegidas.length ? (
                  <>
                    Piezas elegidas: <b className="tabular">{[...elegidas].sort((a, b) => a - b).join(", ")}</b>{" "}
                    <button type="button" className="text-primary hover:underline" onClick={limpiar}>
                      Limpiar
                    </button>
                  </>
                ) : (
                  <span className="text-muted-foreground">Tocá una o varias piezas (o directamente la cara) para marcar una prestación.</span>
                )}
              </div>
              <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
                <div className="grid gap-1.5">
                  <Label htmlFor="odo-prestacion">Prestación</Label>
                  <Select value={prestacionId} onValueChange={setPrestacionId}>
                    <SelectTrigger id="odo-prestacion" className="w-full">
                      <SelectValue placeholder="Elegí la prestación" />
                    </SelectTrigger>
                    <SelectContent>
                      {marcables.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.codigo} · {p.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Estado</Label>
                  <div className="flex rounded-md border bg-background p-0.5" role="radiogroup" aria-label="Estado">
                    {(Object.keys(ESTADOS_MARCA) as EstadoMarca[]).map((e) => (
                      <button
                        key={e}
                        type="button"
                        role="radio"
                        aria-checked={estado === e}
                        onClick={() => setEstado(e)}
                        className={cn("h-8 flex-1 rounded px-2 text-xs font-medium", estado === e ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
                      >
                        {ESTADOS_MARCA[e]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {porCara && (
                <div className="grid gap-1.5">
                  <Label>Caras</Label>
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Caras">
                    {CARAS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={caras.includes(c)}
                        onClick={() => toggleCara(c)}
                        className={cn("h-8 rounded-md border px-3 text-xs font-medium", caras.includes(c) ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent")}
                      >
                        {c} · {NOMBRE_CARA[c]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="grid flex-1 gap-1.5">
                  <Label htmlFor="odo-notas">Nota (opcional)</Label>
                  <Input id="odo-notas" value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={500} placeholder="Ej.: profunda, cerca de pulpa" />
                </div>
                <Button onClick={cargar} disabled={!prestacionId || elegidas.length === 0 || (porCara && caras.length === 0) || marcar.isPending}>
                  {marcar.isPending && <Loader2 className="size-4 animate-spin" />}
                  Marcar {elegidas.length > 1 ? `en ${elegidas.length} piezas` : ""}
                </Button>
              </div>
            </div>
          )}
        </Card>

        <Card className="gap-0 overflow-hidden p-0 shadow-none">
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <div className="font-medium">Detalle</div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <Switch checked={verAnuladas} onCheckedChange={setVerAnuladas} aria-label="Ver anuladas" /> Ver anuladas
            </label>
          </div>
          {lista.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">Todavía no hay nada marcado en el odontograma.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pieza</TableHead>
                    <TableHead>Prestación</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="hidden md:table-cell">Cargó</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.map((m) => (
                    <TableRow key={m.id} className={cn(m.anuladoEn && "opacity-55")} data-testid="marca">
                      <TableCell className="font-semibold tabular">{m.pieza}</TableCell>
                      <TableCell>
                        <div className={cn(m.anuladoEn && "line-through")}>
                          {m.prestacion.nombre}
                          {m.caras.length > 0 && <span className="text-muted-foreground"> · {m.caras.join(", ")}</span>}
                        </div>
                        {m.notas && <div className="text-xs text-muted-foreground">{m.notas}</div>}
                        {m.anuladoEn && <div className="text-xs text-destructive">Anulada por {m.anuladoPor}: {m.motivoAnulacion}</div>}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: COLOR[m.estado] }}>
                          <span className="size-2 rounded-full" style={{ background: COLOR[m.estado] }} />
                          {ESTADOS_MARCA[m.estado]}
                        </span>
                        <div className="text-xs text-muted-foreground">{m.estado === "realizado" && m.realizadoEn ? formatDate(m.realizadoEn) : formatDate(m.fecha)}</div>
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{m.realizadoPor ?? m.autor}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {editable && !m.anuladoEn && (
                          <div className="flex justify-end gap-1">
                            {m.estado === "a_realizar" && (
                              <Button size="sm" variant="outline" onClick={() => realizar(m)} disabled={accion.isPending}>
                                <Check className="size-4" /> Realizado
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => setAnulando(m)} aria-label={`Anular ${m.prestacion.nombre} en ${m.pieza}`}>
                              <Undo2 className="size-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={!!anulando} onOpenChange={(o) => !o && setAnulando(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Anular marca</DialogTitle>
            <DialogDescription>
              {anulando?.prestacion.nombre} en la pieza {anulando?.pieza}. No se borra: queda en el historial como anulada, con el motivo.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="odo-motivo">Motivo</Label>
            <Input id="odo-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: se cargó en la pieza equivocada" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAnulando(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={anular} disabled={motivo.trim().length < 3 || accion.isPending}>
              Anular marca
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </QueryState>
  );
}
