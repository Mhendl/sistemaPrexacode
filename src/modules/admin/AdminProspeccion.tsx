import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Download, Loader2, Pause, Play, Plus, Upload } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/api/client";
import { PageHeader } from "@/components/shared/PageHeader";
import { QueryState } from "@/components/shared/QueryState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { leerArchivo } from "@/lib/planillas";
import { cn } from "@/lib/utils";
import { apiAdmin, useAccionAdmin } from "./api";
import { fechaHora } from "./comun";

type Producto = "dental" | "gestion";
interface Paso {
  dias: number;
  asunto: string;
  cuerpo: string;
}
interface ConfigApi {
  remitenteEmail: string | null;
  remitenteNombre: string | null;
  usuario: string | null;
  smtpHost: string;
  smtpPuerto: number;
  imapHost: string;
  imapPuerto: number;
  maxPorDia: number;
  horaDesde: number;
  horaHasta: number;
  activa: boolean;
  ultimoError: string | null;
  tienePassword: boolean;
  enviadosHoy: number;
  topeHoy: number;
  imapRevisadoEn: string | null;
}
interface CampanaApi {
  id: string;
  nombre: string;
  producto: Producto;
  pasos: Paso[];
  activa: boolean;
  total: number;
  contactados: number;
  porMandar: number;
  enviadosHoy: number;
  visitaron: number;
  registrados: number;
  pendientes: number;
  respondieron: number;
  bajas: number;
  rebotes: number;
  terminados: number;
  emailsEnviados: number;
}
interface ProspectoApi {
  id: string;
  email: string;
  nombre: string | null;
  empresa: string | null;
  ciudad: string | null;
  estado: string;
  paso: number;
  ultimoEnvio: string | null;
  nota: string | null;
  visitas: number;
  visitoEn: string | null;
  visitaEmailEn: string | null;
}

const useConfig = (casilla: Producto) =>
  useQuery({ queryKey: ["admin", "prospeccion", "config", casilla], queryFn: () => apiAdmin<ConfigApi>(`/plataforma/prospeccion/config?casilla=${casilla}`), refetchInterval: 60_000 });
const useCampanas = () => useQuery({ queryKey: ["admin", "prospeccion", "campanas"], queryFn: () => apiAdmin<CampanaApi[]>("/plataforma/prospeccion/campanas") });
const mensaje = (e: unknown) => (e instanceof ApiError ? (Object.values(e.details)[0] ?? e.message) : "No se pudo");

/** Emails comerciales de Prexacode a posibles clientes, desde un alias de la casilla, de a pocos y con cuidado */
export function AdminProspeccion() {
  const [nueva, setNueva] = useState(false);
  const campanas = useCampanas();
  return (
    <>
      <PageHeader
        title="Prospección"
        description="Emails a consultorios y PyMEs que todavía no te conocen, desde tu alias. Salen de a pocos, en horario laboral y se cortan cuando responden, para no caer en spam."
        actions={
          <Button onClick={() => setNueva(true)}>
            <Plus className="size-4" /> Nueva campaña
          </Button>
        }
      />
      <div className="grid gap-6">
        <Casilla producto="gestion" />
        <Casilla producto="dental" />
        <QueryState isLoading={campanas.isLoading} error={campanas.error} onRetry={campanas.refetch}>
          {campanas.data?.length === 0 ? (
            <Card className="gap-2 p-6 text-center text-sm text-muted-foreground shadow-none">Todavía no hay campañas. Creá una (por ejemplo «Consultorios de Rosario») e importá la lista.</Card>
          ) : (
            <div className="grid gap-4">
              {campanas.data?.map((c) => (
                <Campana key={c.id} c={c} />
              ))}
            </div>
          )}
        </QueryState>
        <Card className="gap-2 p-4 text-sm shadow-none">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">Cómo armar la lista</h3>
            <Button size="sm" variant="outline" onClick={descargarModelo}>
              <Download className="size-4" /> Planilla modelo
            </Button>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Un Excel o CSV con una columna <b>email</b>, y si podés <b>nombre</b>, <b>empresa</b>, <b>ciudad</b> y <b>rubro</b>: con esos datos cada email sale personalizado.</li>
            <li>Usá datos de contacto de negocios que sean públicos (su web, su perfil de Google, directorios). No compres bases de datos personales (Ley 25.326).</li>
            <li>Mejor listas chicas y de un mismo rubro y ciudad: el email habla de lo que les pasa a ellos.</li>
            <li>No hace falta sacar a tus clientes ni a los que ya pidieron demo: el sistema los saltea solo.</li>
          </ul>
        </Card>
      </div>
      <CampanaDialog open={nueva} onOpenChange={setNueva} />
    </>
  );
}

/** La casilla de un producto: las campañas de ese producto salen de acá (cada dominio con su propio ritmo) */
function Casilla({ producto }: { producto: Producto }) {
  const { data: c, isLoading, error, refetch } = useConfig(producto);
  const q = `?casilla=${producto}`;
  const marca = producto === "dental" ? "CoreDental" : "Prexacode";
  const accion = useAccionAdmin();
  const [d, setD] = useState<Record<string, string>>({});
  const [password, setPassword] = useState("");
  const [prueba, setPrueba] = useState<{ smtp: string; imap: string } | null>(null);
  const [probando, setProbando] = useState(false);
  useEffect(() => {
    if (c) setD({ remitenteEmail: c.remitenteEmail ?? "", remitenteNombre: c.remitenteNombre ?? "", usuario: c.usuario ?? "", smtpHost: c.smtpHost, smtpPuerto: String(c.smtpPuerto), imapHost: c.imapHost, imapPuerto: String(c.imapPuerto), maxPorDia: String(c.maxPorDia), horaDesde: String(c.horaDesde), horaHasta: String(c.horaHasta) });
  }, [c]);

  const guardar = async () => {
    try {
      await accion.mutateAsync({ url: `/plataforma/prospeccion/config${q}`, body: { ...d, password: password || null } });
      setPassword("");
      toast.success("Casilla guardada");
    } catch (e) {
      toast.error(mensaje(e));
    }
  };
  const probar = async () => {
    setProbando(true);
    setPrueba(null);
    try {
      setPrueba(await apiAdmin<{ smtp: string; imap: string }>(`/plataforma/prospeccion/config/probar${q}`, { method: "POST", body: {} }));
    } catch (e) {
      toast.error(mensaje(e));
    } finally {
      setProbando(false);
    }
  };
  const activar = async (activa: boolean) => {
    try {
      await accion.mutateAsync({ url: `/plataforma/prospeccion/config/activa${q}`, body: { activa } });
      toast.success(activa ? "Envío en marcha: salen de a uno, en horario laboral" : "Envío pausado");
    } catch (e) {
      toast.error(mensaje(e));
    }
  };
  const campo = (k: string, label: string, extra: React.ComponentProps<typeof Input> = {}) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`pr-${producto}-${k}`}>{label}</Label>
      <Input id={`pr-${producto}-${k}`} value={d[k] ?? ""} onChange={(e) => setD({ ...d, [k]: e.target.value })} {...extra} />
    </div>
  );

  return (
    <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
      {c && (
        <Card className="gap-4 p-4 shadow-none" data-testid={`casilla-${producto}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Casilla de {marca}</h3>
              {producto === "dental" && !c.tienePassword && <p className="text-xs text-muted-foreground">Mientras no la configures, las campañas de CoreDental salen de la casilla de Prexacode.</p>}
              <p className="text-sm text-muted-foreground">
                {c.activa ? (
                  <span className="text-success">● Enviando</span>
                ) : (
                  <span>● Pausado</span>
                )}{" "}
                · hoy {c.enviadosHoy} de {c.topeHoy} (arranca en 10 por día y sube de a 2 hasta {c.maxPorDia}) · lunes a viernes de {c.horaDesde} a {c.horaHasta} hs
                {c.imapRevisadoEn && ` · respuestas revisadas ${fechaHora(c.imapRevisadoEn)}`}
              </p>
            </div>
            {c.activa ? (
              <Button variant="outline" onClick={() => activar(false)}>
                <Pause className="size-4" /> Pausar
              </Button>
            ) : (
              <Button onClick={() => activar(true)} disabled={!c.tienePassword}>
                <Play className="size-4" /> Arrancar
              </Button>
            )}
          </div>
          {c.ultimoError && (
            <p className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Se pausó: {c.ultimoError}. Revisá la casilla, probala y volvé a arrancar.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {campo("remitenteEmail", "Alias desde el que salen (ej.: martin@prexacode.com)", { type: "email" })}
            {campo("remitenteNombre", "Tu nombre (firma y remitente)")}
            {campo("usuario", "Usuario de la casilla (si el alias usa el de otra casilla)", { placeholder: "Vacío: el mismo alias" })}
            <div className="grid gap-1.5">
              <Label htmlFor={`pr-${producto}-password`}>Contraseña de la casilla</Label>
              <Input id={`pr-${producto}-password`} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={c.tienePassword ? "Guardada (escribí otra para cambiarla)" : "La de Hostinger"} autoComplete="new-password" />
            </div>
            {campo("maxPorDia", "Tope de emails por día (hasta 80)", { inputMode: "numeric" })}
            <div className="grid grid-cols-2 gap-3">
              {campo("horaDesde", "Desde (hora)", { inputMode: "numeric" })}
              {campo("horaHasta", "Hasta (hora)", { inputMode: "numeric" })}
            </div>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Servidores (ya vienen los de Hostinger)</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              {campo("smtpHost", "SMTP")}
              {campo("smtpPuerto", "Puerto SMTP", { inputMode: "numeric" })}
              {campo("imapHost", "IMAP")}
              {campo("imapPuerto", "Puerto IMAP", { inputMode: "numeric" })}
            </div>
          </details>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={guardar} disabled={accion.isPending}>
              Guardar
            </Button>
            <Button variant="outline" onClick={probar} disabled={probando || !c.tienePassword}>
              {probando && <Loader2 className="size-4 animate-spin" />} Probar la casilla
            </Button>
            {prueba && (
              <span className="text-sm" data-testid="prueba-casilla">
                Envío: <b className={prueba.smtp === "Bien" ? "text-success" : "text-destructive"}>{prueba.smtp}</b> · Lectura de respuestas: <b className={prueba.imap === "Bien" ? "text-success" : "text-destructive"}>{prueba.imap}</b>
                {prueba.smtp === "Bien" && " (te llegó un email de prueba)"}
              </span>
            )}
          </div>
        </Card>
      )}
    </QueryState>
  );
}

function Campana({ c }: { c: CampanaApi }) {
  const [editar, setEditar] = useState(false);
  const [ver, setVer] = useState(false);
  const archivo = useRef<HTMLInputElement>(null);
  const [previa, setPrevia] = useState<{ filas: object[]; r: { nuevos: number; repetidos: number; excluidos: number; invalidos: number; ejemplosInvalidos: string[] } } | null>(null);
  const accion = useAccionAdmin();

  const elegir = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      const filas = mapear(await leerArchivo(f));
      if (!filas.length) return toast.error("No encontré una columna de email en el archivo");
      const r = await apiAdmin<NonNullable<typeof previa>["r"]>(`/plataforma/prospeccion/campanas/${c.id}/importar`, { method: "POST", body: { filas } });
      setPrevia({ filas, r });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo leer el archivo");
    }
  };
  const confirmar = async () => {
    try {
      await accion.mutateAsync({ url: `/plataforma/prospeccion/campanas/${c.id}/importar`, body: { filas: previa!.filas, confirmar: true } });
      toast.success(`${previa!.r.nuevos} contactos agregados a «${c.nombre}»`);
      setPrevia(null);
    } catch (e) {
      toast.error(mensaje(e));
    }
  };

  return (
    <Card className="gap-3 p-4 shadow-none" data-testid="campana-prospeccion">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">
            {c.nombre} <span className={cn("ml-1 rounded-full px-2 py-0.5 text-[11px] font-medium", c.producto === "dental" ? "bg-[#e3f5f8] text-[#0e8fae]" : "bg-primary/10 text-primary")}>{c.producto === "dental" ? "CoreDental" : "Prexacode"}</span>
          </h3>
          <p className="text-sm text-muted-foreground">
            {c.total} contactos · {c.pasos.length} emails en la secuencia · {c.emailsEnviados} emails enviados en total, contando los recordatorios
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={archivo} type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={elegir} aria-label={`Importar lista a ${c.nombre}`} />
          <Button size="sm" variant="outline" onClick={() => archivo.current?.click()}>
            <Upload className="size-4" /> Importar lista
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditar(true)}>
            Editar emails
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setVer(!ver)}>
            {ver ? "Ocultar contactos" : "Ver contactos"}
          </Button>
        </div>
      </div>
      <div className="grid gap-1.5" data-testid="avance-campana">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm">
          <span>
            <b className="text-lg tabular-nums">{c.contactados}</b> de {c.total} enviados
          </span>
          <span>
            <b className="text-lg tabular-nums">{c.porMandar}</b> por mandar
          </span>
          <span className="text-muted-foreground">
            hoy: <b className="tabular-nums text-foreground">{c.enviadosHoy}</b>
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${c.total ? Math.round((c.contactados / c.total) * 100) : 0}%` }} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-3 lg:grid-cols-6">
        {[
          ["Visitaron la página", c.visitaron],
          ["Se registraron", c.registrados],
          ["Respondieron", c.respondieron],
          ["Secuencia terminada", c.terminados],
          ["Bajas", c.bajas],
          ["Rebotaron", c.rebotes],
        ].map(([t, n]) => (
          <div key={t} className="rounded-lg bg-muted/50 p-2">
            <div className="text-lg font-semibold tabular-nums">{n}</div>
            <div className="text-xs text-muted-foreground">{t}</div>
          </div>
        ))}
      </div>
      {previa && (
        <div className="grid gap-2 rounded-lg border border-primary/40 p-3 text-sm" data-testid="previa-importacion">
          <p>
            Se agregan <b>{previa.r.nuevos}</b> contactos nuevos.
            {previa.r.repetidos > 0 && ` ${previa.r.repetidos} ya estaban.`}
            {previa.r.excluidos > 0 && ` ${previa.r.excluidos} ya son clientes o pidieron demo (se saltean).`}
            {previa.r.invalidos > 0 && ` ${previa.r.invalidos} con email inválido (${previa.r.ejemplosInvalidos.join(", ")}).`}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={confirmar} disabled={!previa.r.nuevos || accion.isPending}>
              Agregar {previa.r.nuevos}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPrevia(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {ver && <Prospectos campanaId={c.id} />}
      <CampanaDialog open={editar} onOpenChange={setEditar} campana={c} />
    </Card>
  );
}

/** Planilla modelo (CSV con punto y coma, se abre directo en Excel): en "ciudad" va el barrio o la ciudad */
function descargarModelo() {
  const filas = [
    "email;nombre;empresa;rubro;ciudad;web;telefono",
    "contacto@consultoriosonrisas.com.ar;Ana López;Consultorio Sonrisas;Odontología;Palermo;consultoriosonrisas.com.ar;11 5555-1234",
    "ventas@distribuidoranorte.com.ar;;Distribuidora Norte;Distribuidora de alimentos;Villa Urquiza;;",
  ];
  const url = URL.createObjectURL(new Blob(["﻿" + filas.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "lista-prospeccion-modelo.csv";
  a.click();
  URL.revokeObjectURL(url);
}

/** Reconoce las columnas del archivo, se llamen como se llamen */
function mapear(crudas: Record<string, unknown>[]) {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const CAMPOS: Record<string, RegExp> = {
    email: /^(e-?mail|correo|mail|correo electronico)$/,
    nombre: /^(nombre|contacto|nombre y apellido|titular|responsable)$/,
    empresa: /^(empresa|razon social|negocio|consultorio|clinica|nombre del negocio|comercio)$/,
    rubro: /^(rubro|categoria|actividad)$/,
    ciudad: /^(ciudad|localidad|provincia|zona)$/,
    web: /^(web|sitio|sitio web|pagina|url)$/,
    telefono: /^(telefono|tel|celular|whatsapp)$/,
  };
  return crudas
    .map((f) => {
      const o: Record<string, string> = {};
      for (const [k, v] of Object.entries(f)) {
        const campo = Object.entries(CAMPOS).find(([, re]) => re.test(norm(k)))?.[0];
        if (campo && v !== null && v !== undefined && String(v).trim()) o[campo] = String(v).trim().slice(0, 190);
      }
      return o;
    })
    .filter((o) => o.email);
}

function Prospectos({ campanaId }: { campanaId: string }) {
  const [estado, setEstado] = useState("");
  const q = useQuery({ queryKey: ["admin", "prospeccion", "prospectos", campanaId, estado], queryFn: () => apiAdmin<ProspectoApi[]>(`/plataforma/prospeccion/prospectos?campanaId=${campanaId}${estado ? `&estado=${encodeURIComponent(estado)}` : ""}`) });
  const accion = useAccionAdmin();
  const marcar = async (p: ProspectoApi, nuevo: string) => {
    try {
      await accion.mutateAsync({ url: `/plataforma/prospeccion/prospectos/${p.id}`, metodo: "PUT", body: { estado: nuevo, nota: p.nota } });
      q.refetch();
    } catch (e) {
      toast.error(mensaje(e));
    }
  };
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-1.5">
        {["", "Pendiente", "En curso", "Registrado", "Respondió", "Terminado", "Baja", "Rebotó"].map((e) => (
          <button key={e} type="button" onClick={() => setEstado(e)} aria-pressed={estado === e} className={cn("rounded-full border px-2.5 py-0.5 text-xs", estado === e ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary/50")}>
            {e || "Todos"}
          </button>
        ))}
      </div>
      <div className="max-h-96 divide-y overflow-y-auto rounded-lg border text-sm">
        {q.data?.length === 0 && <p className="p-3 text-muted-foreground">Nadie en este estado.</p>}
        {q.data?.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{p.empresa || p.nombre || p.email}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {p.email}
                {p.ciudad && ` · ${p.ciudad}`}
                {p.nota && ` · ${p.nota}`}
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              {p.visitas > 0 && (
                <span className="mr-1.5 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary" title={p.visitoEn ? `Primera visita: ${fechaHora(p.visitoEn)}` : undefined}>
                  Visitó la página{p.visitas > 1 ? ` (${p.visitas} veces)` : ""}
                </span>
              )}
              {p.visitaEmailEn && (
                <span className="mr-1.5 rounded-full bg-success/12 px-2 py-0.5 font-medium text-success" title={`Le llegó el ${fechaHora(p.visitaEmailEn)}`}>
                  Recibió el email personal
                </span>
              )}
              {p.estado}
              {p.ultimoEnvio && ` · último ${fechaHora(p.ultimoEnvio)}`}
            </span>
            {["Pendiente", "En curso", "Terminado"].includes(p.estado) && (
              <>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => marcar(p, "Respondió")}>
                  Respondió
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => marcar(p, "Baja")}>
                  No escribir más
                </Button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function CampanaDialog({ open, onOpenChange, campana }: { open: boolean; onOpenChange: (o: boolean) => void; campana?: CampanaApi }) {
  const plantillas = useQuery({ queryKey: ["admin", "prospeccion", "plantillas"], queryFn: () => apiAdmin<Record<Producto, Paso[]>>("/plataforma/prospeccion/plantillas"), enabled: open });
  const accion = useAccionAdmin();
  const [nombre, setNombre] = useState("");
  const [producto, setProducto] = useState<Producto>("dental");
  const [pasos, setPasos] = useState<Paso[]>([]);
  useEffect(() => {
    if (!open) return;
    setNombre(campana?.nombre ?? "");
    setProducto(campana?.producto ?? "dental");
    setPasos(campana?.pasos ?? plantillas.data?.dental ?? []);
  }, [open, campana, plantillas.data]);

  /** Al cambiar de producto se cargan sus emails; si se habían editado a mano, se pregunta antes de reemplazarlos */
  const cambiarProducto = (p: Producto) => {
    if (p === producto) return;
    const sugeridos = plantillas.data;
    if (!sugeridos) return setProducto(p);
    const igualesAlModelo = JSON.stringify(pasos) === JSON.stringify(sugeridos[producto]);
    if (!igualesAlModelo && !window.confirm(`¿Reemplazar los emails por los de ${p === "dental" ? "CoreDental" : "Prexacode"}? Se pierden los cambios que hiciste en los textos.`)) return;
    setProducto(p);
    setPasos(sugeridos[p]);
  };
  const guardar = async () => {
    try {
      await accion.mutateAsync({ url: `/plataforma/prospeccion/campanas${campana ? `/${campana.id}` : ""}`, metodo: campana ? "PUT" : "POST", body: { nombre, producto, pasos, activa: campana?.activa ?? true } });
      toast.success(campana ? "Campaña guardada" : "Campaña creada: ahora importá la lista");
      onOpenChange(false);
    } catch (e) {
      toast.error(mensaje(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{campana ? "Editar campaña" : "Nueva campaña"}</DialogTitle>
          <DialogDescription>Podés usar {"{nombre}"}, {"{empresa}"}, {"{ciudad}"}, {"{link}"} (la landing, con seguimiento) y {"{firma}"}. Al final de cada email se agrega solo el link de baja.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="grid gap-1.5">
              <Label htmlFor="pc-nombre">Nombre (para vos)</Label>
              <Input id="pc-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej.: Consultorios de Rosario" />
            </div>
            <div className="grid gap-1.5">
              <Label>Producto</Label>
              <div className="flex rounded-lg bg-muted p-0.5 text-sm">
                {(["dental", "gestion"] as const).map((p) => (
                  <button key={p} type="button" onClick={() => cambiarProducto(p)} aria-pressed={producto === p} className={cn("rounded-md px-3 py-1.5", producto === p ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}>
                    {p === "dental" ? "CoreDental" : "Prexacode"}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {pasos.map((p, i) => (
            <div key={i} className="grid gap-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                Email {i + 1}
                {i > 0 && (
                  <span className="flex items-center gap-1.5 font-normal text-muted-foreground">
                    · a los
                    <Input className="h-7 w-14" inputMode="numeric" value={String(p.dias)} onChange={(e) => setPasos(pasos.map((x, j) => (j === i ? { ...x, dias: Number(e.target.value.replace(/\D/g, "") || 0) } : x)))} aria-label={`Días hábiles del email ${i + 1}`} />
                    días hábiles del anterior, si no respondió
                  </span>
                )}
              </div>
              <Input value={p.asunto} onChange={(e) => setPasos(pasos.map((x, j) => (j === i ? { ...x, asunto: e.target.value } : x)))} placeholder={i === 0 ? "Asunto" : "Vacío: sale como respuesta al primero (Re: …)"} aria-label={`Asunto del email ${i + 1}`} />
              <Textarea rows={7} value={p.cuerpo} onChange={(e) => setPasos(pasos.map((x, j) => (j === i ? { ...x, cuerpo: e.target.value } : x)))} aria-label={`Texto del email ${i + 1}`} />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={accion.isPending || nombre.trim().length < 3 || !pasos.length}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
