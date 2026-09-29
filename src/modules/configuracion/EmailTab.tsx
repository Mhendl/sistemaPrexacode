import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { manejarErrorGuardado } from "@/api/errores";
import { useConfigEmail, useEmailsEnviados, useGuardarConfigEmail, useProbarEmail } from "@/api/hooks";
import type { ConfigEmailApi, SeguridadSmtp } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { QueryState } from "@/components/shared/QueryState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";
import { Field, Section } from "./parts";

/** Datos habituales de los proveedores más usados */
const PROVEEDORES = [
  { nombre: "Gmail", host: "smtp.gmail.com", puerto: 587, seguridad: "STARTTLS" as SeguridadSmtp, ayuda: "Usá una contraseña de aplicación: Cuenta de Google → Seguridad → Verificación en 2 pasos → Contraseñas de aplicaciones." },
  { nombre: "Outlook / Office 365", host: "smtp.office365.com", puerto: 587, seguridad: "STARTTLS" as SeguridadSmtp, ayuda: "Tu email y contraseña de Microsoft (si tenés verificación en 2 pasos, una contraseña de aplicación)." },
  { nombre: "Yahoo", host: "smtp.mail.yahoo.com", puerto: 465, seguridad: "SSL/TLS" as SeguridadSmtp, ayuda: "Generá una contraseña de aplicación en la seguridad de tu cuenta de Yahoo." },
];

export function EmailTab() {
  const { data, isLoading, error, refetch } = useConfigEmail();
  return (
    <QueryState isLoading={isLoading} error={error} onRetry={refetch}>
      {data && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <Configuracion config={data} />
          <Historial />
        </div>
      )}
    </QueryState>
  );
}

function Configuracion({ config }: { config: ConfigEmailApi }) {
  const qc = useQueryClient();
  const guardar = useGuardarConfigEmail();
  const probar = useProbarEmail();
  const [d, setD] = useState(config);
  const [password, setPassword] = useState("");
  const [ayuda, setAyuda] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  useEffect(() => setD(config), [config]);

  const set = <K extends keyof ConfigEmailApi>(k: K, v: ConfigEmailApi[K]) => setD((x) => ({ ...x, [k]: v }));

  const submit = async () => {
    setErrores({});
    try {
      await guardar.mutateAsync({
        modo: d.modo,
        host: d.host,
        puerto: d.puerto,
        seguridad: d.seguridad,
        usuario: d.usuario,
        password: password || null,
        remitenteNombre: d.remitenteNombre,
        responderA: d.responderA,
        enviarFacturaAlEmitir: d.enviarFacturaAlEmitir,
        recordarFacturas: d.recordarFacturas,
        version: config.version,
      });
      setPassword("");
      toast.success("Configuración de email guardada", { description: d.modo === "smtp" ? "Mandate un email de prueba para confirmar que funciona." : undefined });
    } catch (err) {
      manejarErrorGuardado(err, { setErrores, qc, recargar: ["email"] });
    }
  };

  const enviarPrueba = async () => {
    const r = await probar.mutateAsync(undefined).catch(() => null);
    if (!r) return toast.error("No se pudo enviar la prueba");
    if (r.estado === "Enviado") toast.success(`Email de prueba enviado a ${r.para}`, { description: "Revisá tu bandeja (y la carpeta de spam)." });
    else if (r.estado === "Simulado") toast.warning("Envío simulado", { description: "El servidor de correo de la plataforma todavía no está configurado. Usá tu propia casilla (SMTP)." });
    else toast.error("No se pudo enviar", { description: r.error ?? undefined, duration: 12_000 });
  };

  const cambios = JSON.stringify({ ...d, version: 0 }) !== JSON.stringify({ ...config, version: 0 }) || !!password;

  return (
    <Section
      title="Envío de emails"
      description="Desde qué casilla les llegan a tus clientes las facturas y presupuestos."
      action={config.modo === "smtp" ? <StatusBadge status={config.verificado ? "Verificado" : "Sin verificar"} /> : undefined}
    >
      <div className="mb-5 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Cómo se envían">
        {(
          [
            { id: "plataforma", titulo: `Servidor de ${brand.nombre}`, desc: `Sin configurar nada. Sale desde ${brand.nombre} con tu nombre, y las respuestas te llegan a vos.` },
            { id: "smtp", titulo: "Mi propia casilla (SMTP)", desc: "Gmail, Outlook o el correo de tu dominio. Sale desde tu dirección." },
          ] as const
        ).map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={d.modo === o.id}
            onClick={() => set("modo", o.id)}
            className={cn("rounded-lg border p-4 text-left transition-colors", d.modo === o.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50")}
          >
            <div className="text-sm font-medium">{o.titulo}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{o.desc}</div>
          </button>
        ))}
      </div>

      {d.modo === "plataforma" && !config.correoPlataforma && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 px-3 py-2 text-sm">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning-ink" />
          El servidor de correo de {brand.nombre} todavía no está habilitado en esta instalación: por ahora los envíos se simulan. Para enviar de verdad, usá tu propia casilla.
        </p>
      )}

      {d.modo === "smtp" && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Completar con:</span>
            {PROVEEDORES.map((p) => (
              <button
                key={p.nombre}
                type="button"
                onClick={() => {
                  setD((x) => ({ ...x, host: p.host, puerto: p.puerto, seguridad: p.seguridad }));
                  setAyuda(p.ayuda);
                }}
                className="rounded-full border px-2.5 py-1 hover:border-primary hover:text-primary"
              >
                {p.nombre}
              </button>
            ))}
          </div>
          {ayuda && <p className="mb-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{ayuda}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Servidor SMTP" htmlFor="em-host">
              <Input id="em-host" value={d.host ?? ""} onChange={(e) => set("host", e.target.value || null)} placeholder="smtp.gmail.com" aria-invalid={!!errores.host} />
              {errores.host && <p className="text-xs text-destructive">{errores.host}</p>}
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Puerto" htmlFor="em-puerto">
                <Input id="em-puerto" inputMode="numeric" value={d.puerto ?? ""} onChange={(e) => set("puerto", e.target.value ? Number(e.target.value.replace(/\D/g, "")) : null)} placeholder="587" aria-invalid={!!errores.puerto} />
              </Field>
              <div className="grid gap-1.5">
                <Label htmlFor="em-seguridad">Seguridad</Label>
                <Select value={d.seguridad ?? "STARTTLS"} onValueChange={(v) => set("seguridad", v as SeguridadSmtp)}>
                  <SelectTrigger id="em-seguridad" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STARTTLS">STARTTLS</SelectItem>
                    <SelectItem value="SSL/TLS">SSL/TLS</SelectItem>
                    <SelectItem value="Ninguna">Ninguna</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Field label="Usuario" htmlFor="em-usuario" hint="Normalmente, tu dirección de email.">
              <Input id="em-usuario" value={d.usuario ?? ""} onChange={(e) => set("usuario", e.target.value || null)} aria-invalid={!!errores.usuario} />
              {errores.usuario && <p className="text-xs text-destructive">{errores.usuario}</p>}
            </Field>
            <Field label="Contraseña" htmlFor="em-password" hint={config.tienePassword ? "Guardada de forma cifrada. Dejala vacía para no cambiarla." : "Se guarda cifrada."}>
              <Input id="em-password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={config.tienePassword ? "••••••••" : ""} aria-invalid={!!errores.password} />
              {errores.password && <p className="text-xs text-destructive">{errores.password}</p>}
            </Field>
          </div>
        </>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Nombre del remitente" htmlFor="em-nombre" hint="Cómo aparece en la bandeja del cliente.">
          <Input id="em-nombre" value={d.remitenteNombre ?? ""} onChange={(e) => set("remitenteNombre", e.target.value || null)} />
        </Field>
        <Field label="Las respuestas van a" htmlFor="em-responder" hint="Si queda vacío, al email de la empresa.">
          <Input id="em-responder" type="email" value={d.responderA ?? ""} onChange={(e) => set("responderA", e.target.value || null)} aria-invalid={!!errores.responderA} />
          {errores.responderA && <p className="text-xs text-destructive">{errores.responderA}</p>}
        </Field>
      </div>

      <label className="mt-5 flex items-center justify-between gap-4 rounded-lg border px-3 py-3 text-sm">
        <span>
          <span className="font-medium">Mandar la factura por email al emitirla</span>
          <span className="block text-xs text-muted-foreground">Solo a clientes con email cargado. Si falla, queda anotado en el historial.</span>
        </span>
        <Switch checked={d.enviarFacturaAlEmitir} onCheckedChange={(v) => set("enviarFacturaAlEmitir", v)} aria-label="Mandar la factura por email al emitirla" />
      </label>

      <label className="mt-3 flex items-center justify-between gap-4 rounded-lg border px-3 py-3 text-sm">
        <span>
          <span className="font-medium">Recordarles a los clientes las facturas por vencer y vencidas</span>
          <span className="block text-xs text-muted-foreground">
            Un email 3 días antes del vencimiento y otro cuando vence, con la factura y el saldo. Solo facturas a cuenta corriente con saldo, y una sola vez cada aviso.
          </span>
        </span>
        <Switch checked={d.recordarFacturas} onCheckedChange={(v) => set("recordarFacturas", v)} aria-label="Recordar las facturas por vencer y vencidas" />
      </label>

      {config.ultimoError && (
        <p className="mt-4 flex items-start gap-2 text-sm text-destructive" data-testid="error-email">
          <AlertCircle className="mt-0.5 size-4 shrink-0" /> Última prueba: {config.ultimoError}
        </p>
      )}
      {config.modo === "smtp" && config.verificado && !config.ultimoError && (
        <p className="mt-4 flex items-center gap-2 text-sm text-success">
          <CheckCircle2 className="size-4" /> Funciona: la última prueba salió bien.
        </p>
      )}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={enviarPrueba} disabled={probar.isPending || cambios} title={cambios ? "Guardá los cambios antes de probar" : undefined}>
          {probar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Enviarme una prueba
        </Button>
        <Button onClick={submit} disabled={guardar.isPending || !cambios}>
          {guardar.isPending && <Loader2 className="size-4 animate-spin" />}
          Guardar
        </Button>
      </div>
    </Section>
  );
}

function Historial() {
  const { data = [] } = useEmailsEnviados();
  return (
    <Section title="Últimos envíos" description="Lo que salió por email, manual o automático.">
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no se envió nada.</p>
      ) : (
        <ul className="grid gap-2 text-sm" data-testid="historial-emails">
          {data.slice(0, 15).map((e) => (
            <li key={e.id} className="rounded-md border px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{e.asunto}</span>
                <StatusBadge status={e.estado} />
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {new Date(e.createdAt).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {e.para}
                {e.automatico && " · automático"}
              </div>
              {e.error && <div className="mt-0.5 text-xs text-destructive">{e.error}</div>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
