import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, ChevronLeft, ChevronRight, Loader2, MapPin, Phone, Stethoscope } from "lucide-react";
import { Link, useParams } from "react-router";
import { LogoMark } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { brand, setProductoActivo } from "@/config/brand";
import { cn } from "@/lib/utils";

interface Consultorio {
  consultorio: string;
  direccion: string | null;
  telefono: string | null;
  mensaje: string | null;
  diasMax: number;
  profesionales: { id: string; nombre: string; duracion: number }[];
}
interface Reservado {
  profesional: string;
  cuando: string;
  token: string;
}

class ErrorPublico extends Error {
  constructor(
    message: string,
    public details: Record<string, string> = {},
  ) {
    super(message);
  }
}

async function pedir<T>(url: string, body?: object): Promise<T> {
  const r = await fetch(`/api/publico/reservas/${url}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : undefined);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErrorPublico(d.error ?? "No se pudo completar", d.details ?? {});
  return d as T;
}

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fechaCorta = (f: string) => {
  const d = new Date(`${f}T12:00:00`);
  return { dia: DIAS[d.getDay()]!, numero: d.getDate(), mes: MESES[d.getMonth()]! };
};
const fechaLarga = (f: string) => new Date(`${f}T12:00:00`).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });

/** Reserva de turnos online: el paciente elige profesional, día y horario, sin usuario (CoreDental) */
export function ReservaPage() {
  const { codigo = "" } = useParams();
  const qc = useQueryClient();
  useEffect(() => setProductoActivo("dental"), []);
  const info = useQuery({ queryKey: ["reserva", codigo], queryFn: () => pedir<Consultorio>(codigo), retry: false });
  const [profesional, setProfesional] = useState("");
  const [fecha, setFecha] = useState("");
  const [inicio, setInicio] = useState("");
  const [reservado, setReservado] = useState<Reservado | null>(null);

  // Si hay un solo profesional, ya queda elegido
  useEffect(() => {
    if (info.data?.profesionales.length === 1) setProfesional(info.data.profesionales[0]!.id);
  }, [info.data]);

  const c = info.data;
  return (
    <div className="flex min-h-svh flex-col items-center bg-muted/40 px-4 py-8">
      <Card className="w-full max-w-xl gap-5 p-5 shadow-sm sm:p-6">
        {info.isLoading && (
          <div className="flex justify-center py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        )}
        {info.error && (
          <div className="py-8 text-center">
            <p className="font-medium">No encontramos este link</p>
            <p className="mt-1 text-sm text-muted-foreground">{info.error.message}</p>
          </div>
        )}
        {c && (
          <>
            <header className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Stethoscope className="size-5" />
              </span>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold">{c.consultorio}</h1>
                <p className="text-sm text-muted-foreground">Sacá tu turno online</p>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {c.direccion && (
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3.5" /> {c.direccion}
                    </span>
                  )}
                  {c.telefono && (
                    <span className="flex items-center gap-1">
                      <Phone className="size-3.5" /> {c.telefono}
                    </span>
                  )}
                </div>
              </div>
            </header>

            {reservado ? (
              <div className="grid gap-3 py-4 text-center" data-testid="turno-reservado">
                <CalendarCheck className="mx-auto size-10 text-success" />
                <p className="text-lg font-semibold">¡Listo! Tu turno quedó reservado</p>
                <p className="first-letter:uppercase">
                  {reservado.cuando} con {reservado.profesional}.
                </p>
                {c.mensaje && <p className="rounded-lg bg-muted/60 p-3 text-sm">{c.mensaje}</p>}
                <p className="text-sm text-muted-foreground">Si dejaste tu email, te llegó la confirmación. Si no podés venir, avisá desde este link así le damos el horario a otro paciente:</p>
                <Button asChild variant="outline" className="mx-auto">
                  <Link to={`/turno/${reservado.token}`}>Ver, confirmar o cancelar mi turno</Link>
                </Button>
              </div>
            ) : c.profesionales.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">En este momento no hay turnos online. Comunicate con el consultorio{c.telefono ? ` al ${c.telefono}` : ""}.</p>
            ) : (
              <>
                {c.profesionales.length > 1 && (
                  <section className="grid gap-2">
                    <h2 className="text-sm font-semibold">1. ¿Con quién?</h2>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {c.profesionales.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          aria-pressed={profesional === p.id}
                          onClick={() => {
                            setProfesional(p.id);
                            setFecha("");
                            setInicio("");
                          }}
                          className={cn("rounded-lg border p-3 text-left text-sm transition-colors", profesional === p.id ? "border-primary bg-primary/5 font-medium text-primary" : "hover:border-primary/60")}
                        >
                          {p.nombre}
                        </button>
                      ))}
                    </div>
                  </section>
                )}
                {profesional && (
                  <Dias
                    codigo={codigo}
                    recursoId={profesional}
                    fecha={fecha}
                    numero={c.profesionales.length > 1 ? 2 : 1}
                    onFecha={(f) => {
                      setFecha(f);
                      setInicio("");
                    }}
                  />
                )}
                {profesional && fecha && <Horarios codigo={codigo} recursoId={profesional} fecha={fecha} inicio={inicio} onInicio={setInicio} numero={c.profesionales.length > 1 ? 3 : 2} />}
                {profesional && fecha && inicio && (
                  <Datos
                    codigo={codigo}
                    recursoId={profesional}
                    fecha={fecha}
                    inicio={inicio}
                    mensaje={c.mensaje}
                    resumen={`${fechaLarga(fecha)} a las ${inicio} con ${c.profesionales.find((p) => p.id === profesional)?.nombre}`}
                    onReservado={setReservado}
                    onOcupado={() => {
                      setInicio("");
                      qc.invalidateQueries({ queryKey: ["reserva", codigo] });
                    }}
                  />
                )}
              </>
            )}
          </>
        )}
      </Card>
      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <LogoMark className="size-4" /> Turnos con {brand.nombre}
      </p>
    </div>
  );
}

function Dias({ codigo, recursoId, fecha, numero, onFecha }: { codigo: string; recursoId: string; fecha: string; numero: number; onFecha: (f: string) => void }) {
  const dias = useQuery({ queryKey: ["reserva", codigo, "dias", recursoId], queryFn: () => pedir<{ fecha: string; libres: number }[]>(`${codigo}/dias?recursoId=${recursoId}`) });
  const [desde, setDesde] = useState(0);
  const conLugar = (dias.data ?? []).filter((d) => d.libres > 0);
  const POR_VEZ = 7;
  const visibles = conLugar.slice(desde, desde + POR_VEZ);
  useEffect(() => setDesde(0), [recursoId]);
  return (
    <section className="grid gap-2">
      <h2 className="text-sm font-semibold">{numero}. ¿Qué día?</h2>
      {dias.isLoading ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : conLugar.length === 0 ? (
        <p className="text-sm text-muted-foreground">No quedan turnos libres en las próximas semanas. Comunicate con el consultorio.</p>
      ) : (
        <div className="flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" onClick={() => setDesde(Math.max(0, desde - POR_VEZ))} disabled={desde === 0} aria-label="Días anteriores">
            <ChevronLeft className="size-4" />
          </Button>
          <div className="grid flex-1 grid-cols-4 gap-1.5 sm:grid-cols-7">
            {visibles.map((d) => {
              const f = fechaCorta(d.fecha);
              return (
                <button
                  key={d.fecha}
                  type="button"
                  onClick={() => onFecha(d.fecha)}
                  aria-pressed={fecha === d.fecha}
                  aria-label={`${fechaLarga(d.fecha)}, ${d.libres} ${d.libres === 1 ? "turno libre" : "turnos libres"}`}
                  className={cn("rounded-lg border px-1 py-2 text-center transition-colors", fecha === d.fecha ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/60")}
                >
                  <div className="text-[11px] opacity-80">{f.dia}</div>
                  <div className="text-base font-semibold leading-tight">{f.numero}</div>
                  <div className="text-[11px] opacity-80">{f.mes}</div>
                </button>
              );
            })}
          </div>
          <Button size="icon-sm" variant="ghost" onClick={() => setDesde(desde + POR_VEZ)} disabled={desde + POR_VEZ >= conLugar.length} aria-label="Más días">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </section>
  );
}

function Horarios({ codigo, recursoId, fecha, inicio, numero, onInicio }: { codigo: string; recursoId: string; fecha: string; inicio: string; numero: number; onInicio: (h: string) => void }) {
  const h = useQuery({ queryKey: ["reserva", codigo, "horarios", recursoId, fecha], queryFn: () => pedir<{ libres: string[] }>(`${codigo}/horarios?recursoId=${recursoId}&fecha=${fecha}`) });
  return (
    <section className="grid gap-2">
      <h2 className="text-sm font-semibold first-letter:uppercase">
        {numero}. ¿A qué hora? <span className="font-normal text-muted-foreground">({fechaLarga(fecha)})</span>
      </h2>
      {h.isLoading ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : !h.data?.libres.length ? (
        <p className="text-sm text-muted-foreground">Ese día ya no quedan horarios. Elegí otro.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {h.data.libres.map((x) => (
            <button
              key={x}
              type="button"
              onClick={() => onInicio(x)}
              aria-pressed={inicio === x}
              className={cn("rounded-md border px-3 py-1.5 text-sm tabular-nums transition-colors", inicio === x ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/60")}
            >
              {x}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function Datos(props: { codigo: string; recursoId: string; fecha: string; inicio: string; mensaje: string | null; resumen: string; onReservado: (r: Reservado) => void; onOcupado: () => void }) {
  const [d, setD] = useState({ nombre: "", apellido: "", dni: "", telefono: "", email: "", motivo: "", sitio: "" });
  const [acepta, setAcepta] = useState(false);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const campo = (k: keyof typeof d, label: string, extra: React.ComponentProps<typeof Input> = {}) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`rs-${k}`}>{label}</Label>
      <Input id={`rs-${k}`} value={d[k]} onChange={(e) => setD({ ...d, [k]: e.target.value })} aria-invalid={!!errores[k]} {...extra} />
      {errores[k] && <p className="text-xs text-destructive">{errores[k]}</p>}
    </div>
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrores({});
    setError("");
    setEnviando(true);
    try {
      const r = await pedir<Reservado>(props.codigo, { recursoId: props.recursoId, fecha: props.fecha, inicio: props.inicio, ...d });
      props.onReservado(r);
    } catch (err) {
      if (err instanceof ErrorPublico) {
        setErrores(err.details);
        setError(err.message);
        if (/ya no está disponible|se acaba de ocupar/.test(err.message)) props.onOcupado();
      } else setError("No se pudo reservar. Revisá tu conexión y probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4 border-t pt-4">
      <p className="rounded-lg bg-primary/5 p-3 text-sm first-letter:uppercase" data-testid="resumen-reserva">
        {props.resumen}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {campo("nombre", "Nombre", { autoComplete: "given-name" })}
        {campo("apellido", "Apellido", { autoComplete: "family-name" })}
        {campo("dni", "DNI", { inputMode: "numeric" })}
        {campo("telefono", "Celular", { inputMode: "tel", autoComplete: "tel", placeholder: "11 5555-1234" })}
      </div>
      {campo("email", "Email (para recibir la confirmación)", { type: "email", autoComplete: "email" })}
      <div className="grid gap-1.5">
        <Label htmlFor="rs-motivo">Motivo de la consulta (opcional)</Label>
        <Textarea id="rs-motivo" rows={2} maxLength={300} value={d.motivo} onChange={(e) => setD({ ...d, motivo: e.target.value })} />
      </div>
      {/* Campo trampa para robots: no se ve */}
      <input type="text" name="sitio" tabIndex={-1} autoComplete="off" value={d.sitio} onChange={(e) => setD({ ...d, sitio: e.target.value })} className="absolute -left-[9999px] size-px opacity-0" aria-hidden="true" />
      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <Checkbox checked={acepta} onCheckedChange={(v) => setAcepta(!!v)} aria-label="Acepto que el consultorio use mis datos para gestionar el turno" className="mt-0.5" />
        <span>Acepto que el consultorio use estos datos para gestionar mi turno y comunicarse conmigo (Ley 25.326).</span>
      </label>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" disabled={!acepta || enviando}>
        {enviando && <Loader2 className="size-4 animate-spin" />}
        Reservar turno
      </Button>
    </form>
  );
}
