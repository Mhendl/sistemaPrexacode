import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Cake, CalendarClock, Check, Loader2, Mail, Megaphone, MessageCircle, Plus, Users, Wallet } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { api, ApiError } from "@/api/client";
import { useConfigAgenda } from "@/api/hooks";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRole } from "@/context/AuthProvider";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useObrasSociales } from "@/modules/pacientes/api";

type Segmento = "todos" | "sin_visita" | "cumpleanos" | "deudores" | "obra_social";
type Canal = "Email" | "WhatsApp";

interface CampanaFila {
  id: string;
  nombre: string;
  canal: Canal;
  segmento: Segmento;
  parametro: string | null;
  asunto: string | null;
  mensaje: string;
  destinatarios: number;
  creadoPor: string;
  createdAt: string;
  enviados: number;
  pendientes: number;
  errores: number;
}
interface EnvioApi {
  id: string;
  paciente: string;
  destino: string;
  texto: string;
  estado: "Pendiente" | "Enviado" | "Simulado" | "Error";
  error: string | null;
  enviadoEn: string | null;
}
interface CampanaApi extends Omit<CampanaFila, "enviados" | "pendientes" | "errores"> {
  envios: EnvioApi[];
}
interface PreviaApi {
  total: number;
  conContacto: number;
  sinContacto: number;
  muestra: string[];
}

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const SEGMENTOS: { id: Segmento; titulo: string; detalle: string; icono: typeof Users; asunto: string; mensaje: (conLink: boolean) => string; permiso?: string }[] = [
  {
    id: "sin_visita",
    titulo: "Control: los que no vienen hace un tiempo",
    detalle: "Pacientes cuya última visita fue hace más de los meses que elijas, y que no tienen turno dado.",
    icono: CalendarClock,
    asunto: "Te esperamos para tu control",
    mensaje: (l) => `Hace tiempo que no te vemos por {consultorio}. Te recomendamos hacer un control para cuidar tu salud bucal.\n${l ? "Sacá tu turno cuando quieras desde acá: {link_turnos}" : "Respondé este mensaje o llamanos y te damos un turno."}`,
  },
  {
    id: "cumpleanos",
    titulo: "Cumpleaños del mes",
    detalle: "Un saludo a los pacientes que cumplen años en el mes que elijas (hace falta la fecha de nacimiento).",
    icono: Cake,
    asunto: "¡Feliz cumpleaños, {nombre}!",
    mensaje: () => "¡Feliz cumpleaños! Todo el equipo de {consultorio} te desea un gran día.",
  },
  {
    id: "deudores",
    titulo: "Pacientes con saldo pendiente",
    detalle: "Los que tienen deuda en su cuenta. {saldo} se reemplaza por lo que debe cada uno.",
    icono: Wallet,
    asunto: "Tu saldo en {consultorio}",
    mensaje: () => "Te recordamos que tenés un saldo pendiente de {saldo} en {consultorio}. Podés abonarlo en tu próxima visita o por transferencia. ¡Gracias!",
    permiso: "cobranzas.ver",
  },
  {
    id: "obra_social",
    titulo: "Afiliados de una obra social",
    detalle: "Por ejemplo, para avisar que empezás o dejás de atender una cobertura.",
    icono: Users,
    asunto: "Novedades de {consultorio}",
    mensaje: () => "",
  },
  {
    id: "todos",
    titulo: "Todos los pacientes",
    detalle: "Novedades del consultorio: horarios de verano, vacaciones, un profesional nuevo…",
    icono: Megaphone,
    asunto: "Novedades de {consultorio}",
    mensaje: () => "",
  },
];
const nombreSegmento = (s: Segmento) => SEGMENTOS.find((x) => x.id === s)?.titulo ?? s;

const useCampanas = () => useQuery({ queryKey: ["campanas"], queryFn: () => api<CampanaFila[]>("/campanas") });

// ---------------------------------------------------------------- lista

export function CampanasPage() {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useCampanas();
  return (
    <>
      <PageHeader
        title="Campañas"
        description="Mensajes a grupos de pacientes: el recordatorio de control, el saludo de cumpleaños, los que deben o una novedad. Por email o por WhatsApp."
        actions={
          <Button asChild>
            <Link to="/campanas/nueva">
              <Plus className="size-4" /> Nueva campaña
            </Link>
          </Button>
        }
      />
      <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
        {data && data.length === 0 ? (
          <Card className="items-center gap-3 py-14 text-center shadow-none">
            <Megaphone className="size-8 text-primary" />
            <p className="max-w-md text-sm text-muted-foreground">Todavía no mandaste campañas. La más útil: avisarles a los que no vienen hace 6 meses que les toca el control.</p>
            <Button variant="outline" asChild>
              <Link to="/campanas/nueva">Armar la primera</Link>
            </Button>
          </Card>
        ) : (
          <div className="grid gap-2">
            {data?.map((c) => (
              <button key={c.id} type="button" data-testid="campana" onClick={() => navigate(`/campanas/${c.id}`)} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 text-left text-sm hover:border-primary/50">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">{c.canal === "Email" ? <Mail className="size-4" /> : <MessageCircle className="size-4" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{c.nombre}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {nombreSegmento(c.segmento)} · {formatDate(c.createdAt)} · {c.creadoPor}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {c.enviados} de {c.destinatarios} {c.canal === "Email" ? "enviados" : "mandados"}
                  {c.errores > 0 && <span className="text-destructive"> · {c.errores} con error</span>}
                </span>
              </button>
            ))}
          </div>
        )}
      </QueryState>
    </>
  );
}

// ---------------------------------------------------------------- nueva

export function NuevaCampanaPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { puede } = useRole();
  const { data: config } = useConfigAgenda();
  const { data: obras = [] } = useObrasSociales();
  const conLink = !!config?.reservaOnline;
  const segmentos = SEGMENTOS.filter((s) => !s.permiso || puede(s.permiso));

  const [segmento, setSegmento] = useState<Segmento>("sin_visita");
  const [parametro, setParametro] = useState("6");
  const [canal, setCanal] = useState<Canal>("Email");
  const [nombre, setNombre] = useState("Control");
  const [asunto, setAsunto] = useState(SEGMENTOS[0]!.asunto);
  const [mensaje, setMensaje] = useState(() => SEGMENTOS[0]!.mensaje(false));
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [confirmar, setConfirmar] = useState(false);

  // Con los turnos online activos, el mensaje de control incluye el link
  useEffect(() => {
    if (segmento === "sin_visita") setMensaje(SEGMENTOS[0]!.mensaje(conLink));
  }, [conLink]); // eslint-disable-line react-hooks/exhaustive-deps

  const elegir = (s: Segmento) => {
    const def = SEGMENTOS.find((x) => x.id === s)!;
    setSegmento(s);
    setParametro(s === "sin_visita" ? "6" : s === "cumpleanos" ? String(new Date().getMonth() + 1) : "");
    setAsunto(def.asunto);
    setMensaje(def.mensaje(conLink));
    setNombre(s === "sin_visita" ? "Control" : s === "cumpleanos" ? `Cumpleaños de ${MESES[new Date().getMonth()]!.toLowerCase()}` : s === "deudores" ? "Saldos pendientes" : "");
    setConfirmar(false);
  };

  const listo = segmento !== "obra_social" || !!parametro;
  const previa = useQuery({
    queryKey: ["campanas", "previa", segmento, parametro, canal],
    queryFn: () => api<PreviaApi>("/campanas/previa", { method: "POST", body: { segmento, parametro: parametro || null, canal } }),
    enabled: listo,
  });

  const crear = useMutation({
    mutationFn: () => api<{ id: string }>("/campanas", { method: "POST", body: { nombre, segmento, parametro: parametro || null, canal, asunto: canal === "Email" ? asunto : null, mensaje } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campanas"] }),
  });

  const enviar = async () => {
    setErrores({});
    try {
      const c = await crear.mutateAsync();
      toast.success(canal === "Email" ? "Campaña en camino: los emails salen de a uno" : "Campaña lista: mandá cada WhatsApp con un toque");
      navigate(`/campanas/${c.id}`);
    } catch (e) {
      setConfirmar(false);
      if (e instanceof ApiError) {
        setErrores(e.details);
        toast.error(e.message, { duration: 8000 });
      } else toast.error("No se pudo crear la campaña");
    }
  };

  const insertar = (v: string) => setMensaje((m) => `${m}${m && !m.endsWith(" ") && !m.endsWith("\n") ? " " : ""}${v}`);
  const ejemplo = useMemo(
    () =>
      mensaje
        .replace(/\{nombre\}/g, "María")
        .replace(/\{apellido\}/g, "González")
        .replace(/\{consultorio\}/g, "tu consultorio")
        .replace(/\{saldo\}/g, "$ 12.500,00")
        .replace(/\{link_turnos\}/g, conLink ? `${window.location.origin}/reservar/…` : "(turnos online no activados)"),
    [mensaje, conLink],
  );
  const cantidad = previa.data?.conContacto ?? 0;

  return (
    <>
      <Link to="/campanas" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Campañas
      </Link>
      <PageHeader title="Nueva campaña" description="Elegí a quién, por dónde y qué decir. Los pacientes que se dieron de baja o no aceptan campañas nunca la reciben." />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="grid gap-6">
          <Card className="gap-3 p-4 shadow-none">
            <h2 className="text-sm font-semibold">1. ¿A quién?</h2>
            <div className="grid gap-2">
              {segmentos.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={segmento === s.id}
                  onClick={() => elegir(s.id)}
                  className={cn("flex items-start gap-3 rounded-lg border p-3 text-left text-sm transition-colors", segmento === s.id ? "border-primary bg-primary/5" : "hover:border-primary/50")}
                >
                  <s.icono className={cn("mt-0.5 size-4 shrink-0", segmento === s.id ? "text-primary" : "text-muted-foreground")} />
                  <span>
                    <span className="block font-medium">{s.titulo}</span>
                    <span className="block text-xs text-muted-foreground">{s.detalle}</span>
                  </span>
                </button>
              ))}
            </div>
            {segmento === "sin_visita" && (
              <div className="grid gap-1.5">
                <Label>Hace más de</Label>
                <Select value={parametro} onValueChange={setParametro}>
                  <SelectTrigger className="w-44" aria-label="Meses sin venir">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["3", "6", "9", "12", "18", "24"].map((m) => (
                      <SelectItem key={m} value={m}>
                        {m} meses
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {segmento === "cumpleanos" && (
              <div className="grid gap-1.5">
                <Label>Mes</Label>
                <Select value={parametro} onValueChange={setParametro}>
                  <SelectTrigger className="w-44" aria-label="Mes del cumpleaños">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MESES.map((m, i) => (
                      <SelectItem key={m} value={String(i + 1)}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {segmento === "obra_social" && (
              <div className="grid gap-1.5">
                <Label>Obra social</Label>
                <Select value={parametro} onValueChange={setParametro}>
                  <SelectTrigger className="w-64" aria-label="Obra social">
                    <SelectValue placeholder="Elegí" />
                  </SelectTrigger>
                  <SelectContent>
                    {obras.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </Card>

          <Card className="gap-3 p-4 shadow-none">
            <h2 className="text-sm font-semibold">2. ¿Por dónde?</h2>
            <div className="flex w-fit rounded-lg bg-muted p-0.5 text-sm">
              {(["Email", "WhatsApp"] as const).map((c) => (
                <button key={c} type="button" onClick={() => setCanal(c)} aria-pressed={canal === c} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5", canal === c ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}>
                  {c === "Email" ? <Mail className="size-4" /> : <MessageCircle className="size-4" />} {c}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {canal === "Email" ? "Salen solos, de a uno, con un link para darse de baja." : "Te queda la lista: tocás WhatsApp en cada paciente y se abre el chat con el mensaje escrito (desde la compu o el celular del consultorio)."}
            </p>
          </Card>

          <Card className="gap-4 p-4 shadow-none">
            <h2 className="text-sm font-semibold">3. El mensaje</h2>
            <div className="grid gap-1.5">
              <Label htmlFor="cp-nombre">Nombre de la campaña (para vos)</Label>
              <Input id="cp-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} aria-invalid={!!errores.nombre} />
              {errores.nombre && <p className="text-xs text-destructive">{errores.nombre}</p>}
            </div>
            {canal === "Email" && (
              <div className="grid gap-1.5">
                <Label htmlFor="cp-asunto">Asunto del email</Label>
                <Input id="cp-asunto" value={asunto} onChange={(e) => setAsunto(e.target.value)} maxLength={120} aria-invalid={!!errores.asunto} />
                {errores.asunto && <p className="text-xs text-destructive">{errores.asunto}</p>}
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="cp-mensaje">Mensaje</Label>
              <Textarea id="cp-mensaje" rows={6} value={mensaje} onChange={(e) => setMensaje(e.target.value)} maxLength={2000} aria-invalid={!!errores.mensaje} placeholder="Empieza solo con «Hola María,»: escribí lo que sigue." />
              {errores.mensaje && <p className="text-xs text-destructive">{errores.mensaje}</p>}
              <div className="flex flex-wrap gap-1.5 text-xs">
                <span className="text-muted-foreground">Agregar:</span>
                {["{nombre}", "{consultorio}", ...(conLink ? ["{link_turnos}"] : []), ...(segmento === "deudores" ? ["{saldo}"] : [])].map((v) => (
                  <button key={v} type="button" onClick={() => insertar(v)} className="rounded border px-1.5 py-0.5 font-mono hover:border-primary hover:text-primary">
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </Card>
        </div>

        <div className="grid h-fit gap-4 lg:sticky lg:top-4">
          <Card className="gap-3 p-4 shadow-none" data-testid="previa-campana">
            <h2 className="text-sm font-semibold">Le llega a</h2>
            {!listo ? (
              <p className="text-sm text-muted-foreground">Elegí la obra social.</p>
            ) : previa.isLoading ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : previa.data ? (
              <>
                <p className="text-2xl font-semibold tabular-nums">
                  {cantidad} {cantidad === 1 ? "paciente" : "pacientes"}
                </p>
                {previa.data.sinContacto > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {previa.data.sinContacto} del grupo no {previa.data.sinContacto === 1 ? "tiene" : "tienen"} {canal === "Email" ? "email" : "celular"} cargado.
                  </p>
                )}
                {previa.data.muestra.length > 0 && <p className="text-xs text-muted-foreground">{previa.data.muestra.join(" · ")}{cantidad > previa.data.muestra.length ? "…" : ""}</p>}
              </>
            ) : null}
          </Card>
          <Card className="gap-2 p-4 shadow-none">
            <h2 className="text-sm font-semibold">Así se ve</h2>
            <div className="rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-line" data-testid="ejemplo-mensaje">
              {canal === "Email" ? "Hola María,\n" : "Hola María!\n"}
              {ejemplo || <span className="text-muted-foreground">Escribí el mensaje…</span>}
            </div>
          </Card>
          {confirmar ? (
            <Card className="gap-3 border-primary/40 p-4 shadow-none">
              <p className="text-sm">
                ¿Mandar «{nombre}» a {cantidad} {cantidad === 1 ? "paciente" : "pacientes"} por {canal}?
              </p>
              <div className="flex gap-2">
                <Button onClick={enviar} disabled={crear.isPending}>
                  {crear.isPending && <Loader2 className="size-4 animate-spin" />}
                  Sí, mandar
                </Button>
                <Button variant="outline" onClick={() => setConfirmar(false)}>
                  No
                </Button>
              </div>
            </Card>
          ) : (
            <Button size="lg" onClick={() => setConfirmar(true)} disabled={!listo || !cantidad || mensaje.trim().length < 10}>
              {canal === "Email" ? <Mail className="size-4" /> : <MessageCircle className="size-4" />} Mandar a {cantidad} {cantidad === 1 ? "paciente" : "pacientes"}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- detalle

export function CampanaPage() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["campanas", id],
    queryFn: () => api<CampanaApi>(`/campanas/${id}`),
    // Mientras salen los emails, se actualiza sola
    refetchInterval: (query) => (query.state.data?.canal === "Email" && query.state.data.envios.some((e) => e.estado === "Pendiente") ? 2000 : false),
  });
  const whatsapp = useMutation({
    mutationFn: (envioId: string) => api<{ url: string }>(`/campanas/${id}/envios/${envioId}/whatsapp`, { method: "POST", body: {} }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campanas"] }),
  });

  const abrir = async (envioId: string) => {
    // La ventana se abre en el mismo clic (si no, el navegador la bloquea) y después se le pone la dirección
    const ventana = window.open("", "_blank");
    try {
      const r = await whatsapp.mutateAsync(envioId);
      if (ventana) ventana.location.href = r.url;
      else window.location.href = r.url;
    } catch (e) {
      ventana?.close();
      toast.error(e instanceof ApiError ? e.message : "No se pudo abrir WhatsApp");
    }
  };

  const c = q.data;
  const enviados = c?.envios.filter((e) => e.estado === "Enviado" || e.estado === "Simulado").length ?? 0;
  const errores = c?.envios.filter((e) => e.estado === "Error").length ?? 0;
  return (
    <>
      <Link to="/campanas" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Campañas
      </Link>
      <QueryState isLoading={q.isLoading} error={q.error} onRetry={q.refetch}>
        {c && (
          <>
            <PageHeader title={c.nombre} description={`${nombreSegmento(c.segmento)} · por ${c.canal} · ${formatDate(c.createdAt)} · ${c.creadoPor}`} />
            <div className="mb-4 flex flex-wrap gap-4 text-sm" data-testid="resumen-campana">
              <span>
                <b className="tabular-nums">{enviados}</b> de {c.destinatarios} {c.canal === "Email" ? "enviados" : "mandados"}
              </span>
              {errores > 0 && <span className="text-destructive">{errores} con error</span>}
              {c.canal === "Email" && enviados + errores < c.destinatarios && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> enviando…
                </span>
              )}
            </div>
            {c.canal === "Email" && c.asunto && <p className="mb-2 text-sm">Asunto: {c.asunto}</p>}
            <Card className="gap-0 divide-y p-0 shadow-none">
              {c.envios.map((e) => (
                <div key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm" data-testid="envio-campana">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{e.paciente}</span>
                    <span className="block truncate text-xs text-muted-foreground">{e.error ?? e.destino}</span>
                  </span>
                  {c.canal === "WhatsApp" ? (
                    e.estado === "Enviado" ? (
                      <span className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-xs text-success">
                          <Check className="size-3.5" /> Mandado
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => abrir(e.id)} aria-label={`Abrir de nuevo el WhatsApp de ${e.paciente}`}>
                          Abrir de nuevo
                        </Button>
                      </span>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => abrir(e.id)} aria-label={`WhatsApp a ${e.paciente}`}>
                        <MessageCircle className="size-4" /> WhatsApp
                      </Button>
                    )
                  ) : (
                    <StatusBadge status={e.estado === "Simulado" ? "Enviado" : e.estado} />
                  )}
                </div>
              ))}
            </Card>
          </>
        )}
      </QueryState>
    </>
  );
}

// ---------------------------------------------------------------- baja (pública)

export function BajaCampanasPage() {
  const { token = "" } = useParams();
  const q = useQuery({
    queryKey: ["baja-campanas", token],
    queryFn: async () => {
      const r = await fetch(`/api/publico/baja-campanas/${token}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "El link no es válido");
      return d as { consultorio: string; nombre: string; dadoDeBaja: boolean };
    },
    retry: false,
  });
  const [listo, setListo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const baja = async () => {
    setEnviando(true);
    try {
      const r = await fetch(`/api/publico/baja-campanas/${token}`, { method: "POST" });
      if (!r.ok) throw new Error();
      setListo(true);
    } catch {
      toast.error("No se pudo. Probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  };
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-md gap-4 p-6 text-center shadow-sm">
        {q.isLoading && <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />}
        {q.error && <p className="text-sm text-muted-foreground">{q.error.message}</p>}
        {q.data &&
          (listo || q.data.dadoDeBaja ? (
            <div data-testid="baja-lista">
              <p className="font-semibold">Listo, {q.data.nombre}</p>
              <p className="mt-1 text-sm text-muted-foreground">No vas a recibir más novedades de {q.data.consultorio}. Los avisos de tus turnos te siguen llegando.</p>
            </div>
          ) : (
            <>
              <p className="font-semibold">¿No querés recibir más novedades de {q.data.consultorio}?</p>
              <p className="text-sm text-muted-foreground">Dejás de recibir recordatorios de control, saludos y novedades. Los avisos de tus turnos te siguen llegando.</p>
              <Button onClick={baja} disabled={enviando} className="mx-auto">
                {enviando && <Loader2 className="size-4 animate-spin" />}
                Darme de baja
              </Button>
            </>
          ))}
      </Card>
    </div>
  );
}
