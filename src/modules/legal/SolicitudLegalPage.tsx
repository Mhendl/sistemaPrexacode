import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { Link } from "react-router";
import { ApiError } from "@/api/client";
import { useSolicitudLegal } from "@/api/hooks";
import { LogoMark } from "@/components/layout/Logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { brand } from "@/config/brand";
import { condiciones, proveedor } from "@/config/legal";

const textos = {
  baja: {
    titulo: "Botón de baja",
    bajada: `Pedí la baja de tu suscripción a ${brand.nombre}. No necesitás iniciar sesión. El acceso sigue hasta el final del período ya pagado y después podés exportar tus datos durante ${condiciones.diasConservacionTrasBaja} días.`,
    boton: "Pedir la baja",
  },
  arrepentimiento: {
    titulo: "Botón de arrepentimiento",
    bajada: `Si contrataste como consumidor, podés revocar la contratación dentro de los ${condiciones.diasArrepentimiento} días corridos desde que contrataste o pagaste, sin costo ni necesidad de explicar el motivo. Te reintegramos lo pagado por ese período por el mismo medio de pago.`,
    boton: "Revocar la contratación",
  },
} as const;

/** Formularios públicos exigidos por la normativa de defensa del consumidor (baja y arrepentimiento) */
export function SolicitudLegalPage({ tipo }: { tipo: "baja" | "arrepentimiento" }) {
  const t = textos[tipo];
  const enviar = useSolicitudLegal();
  const [d, setD] = useState({ nombre: "", email: "", cuit: "", motivo: "" });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [codigo, setCodigo] = useState<string | null>(null);

  useEffect(() => {
    document.title = `${t.titulo} · ${brand.nombre}`;
  }, [t.titulo]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrores({});
    try {
      const r = await enviar.mutateAsync({ tipo, nombre: d.nombre, email: d.email, cuit: d.cuit || null, motivo: d.motivo || null });
      setCodigo(r.codigo);
    } catch (err) {
      if (err instanceof ApiError) setErrores({ ...err.details, general: err.message });
      else setErrores({ general: "No se pudo enviar. Probá de nuevo." });
    }
  };

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-xl items-center gap-2.5 px-4 py-4">
          <LogoMark />
          <span className="text-lg font-bold tracking-tight">{brand.nombre}</span>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 py-8">
        <Link to="/login" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Volver
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{t.titulo}</h1>
        <p className="mt-2 text-muted-foreground">{t.bajada}</p>

        {codigo ? (
          <Card className="mt-6 items-center gap-3 p-6 text-center shadow-none" data-testid="constancia-solicitud">
            <CheckCircle2 className="size-10 text-success" />
            <div className="text-lg font-semibold">Recibimos tu pedido</div>
            <p className="text-sm text-muted-foreground">Guardá este código de constancia. Te vamos a responder a {d.email}.</p>
            <div className="rounded-lg bg-muted px-4 py-2 font-mono text-xl font-bold tracking-wider" data-testid="codigo-constancia">
              {codigo}
            </div>
          </Card>
        ) : (
          <form onSubmit={submit} className="mt-6 grid gap-4" noValidate>
            <div className="grid gap-1.5">
              <Label htmlFor="sl-nombre">Nombre y apellido</Label>
              <Input id="sl-nombre" value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} aria-invalid={!!errores.nombre} />
              {errores.nombre && <p className="text-xs text-destructive">{errores.nombre}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sl-email">Email</Label>
              <Input id="sl-email" type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} aria-invalid={!!errores.email} />
              {errores.email && <p className="text-xs text-destructive">{errores.email}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sl-cuit">CUIT de la empresa (si lo tenés a mano)</Label>
              <Input id="sl-cuit" inputMode="numeric" value={d.cuit} onChange={(e) => setD({ ...d, cuit: e.target.value })} placeholder="30-12345678-9" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sl-motivo">Comentario (opcional)</Label>
              <Textarea id="sl-motivo" rows={3} value={d.motivo} onChange={(e) => setD({ ...d, motivo: e.target.value })} />
            </div>
            {errores.general && <p className="text-sm text-destructive">{errores.general}</p>}
            <Button type="submit" disabled={enviar.isPending}>
              {enviar.isPending && <Loader2 className="size-4 animate-spin" />}
              {t.boton}
            </Button>
            <p className="text-xs text-muted-foreground">
              También podés escribirnos a {proveedor.email}. Ver los{" "}
              <Link to="/terminos" className="underline">
                Términos y Condiciones
              </Link>
              .
            </p>
          </form>
        )}
      </main>
    </div>
  );
}

/** Links legales visibles (obligatorios en la primera pantalla del sitio) */
export function LinksLegales({ className }: { className?: string }) {
  return (
    <nav className={className} aria-label="Información legal">
      <Link to="/terminos" className="hover:underline">
        Términos y Condiciones
      </Link>
      <span aria-hidden>·</span>
      <Link to="/privacidad" className="hover:underline">
        Privacidad
      </Link>
      <span aria-hidden>·</span>
      <Link to="/arrepentimiento" className="hover:underline">
        Botón de arrepentimiento
      </Link>
      <span aria-hidden>·</span>
      <Link to="/baja" className="hover:underline">
        Botón de baja
      </Link>
    </nav>
  );
}
