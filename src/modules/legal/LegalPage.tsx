import { useEffect, useState } from "react";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { Link } from "react-router";
import { LogoMark } from "@/components/layout/Logo";
import { brand } from "@/config/brand";
import { formatDate } from "@/lib/format";
import { faltanDatosProveedor } from "@/config/legal";
import { LinksLegales } from "./SolicitudLegalPage";
import { privacidad, terminos, type Seccion } from "./textos";

const paginas: Record<"terminos" | "privacidad", { titulo: string; secciones: Seccion[] }> = {
  terminos: { titulo: "Términos y Condiciones", secciones: terminos },
  privacidad: { titulo: "Política de Privacidad", secciones: privacidad },
};

/** Páginas públicas: se pueden leer sin iniciar sesión (se enlazan desde el registro) */
export function LegalPage({ tipo }: { tipo: "terminos" | "privacidad" }) {
  const { titulo, secciones } = paginas[tipo];
  const [version, setVersion] = useState<string>();

  useEffect(() => {
    document.title = `${titulo} · ${brand.nombre}`;
    fetch("/api/legal")
      .then((r) => r.json())
      .then((d) => setVersion(d.version))
      .catch(() => undefined);
  }, [titulo]);

  return (
    <div className="min-h-svh bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-3xl items-center gap-2.5 px-4 py-4">
          <LogoMark />
          <span className="text-lg font-bold tracking-tight">{brand.nombre}</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link to="/registro" className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Volver
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{titulo}</h1>
        {version && <p className="mt-1 text-sm text-muted-foreground">Versión vigente desde el {formatDate(version)}</p>}

        {faltanDatosProveedor && (
          <div className="mt-6 flex gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm" data-testid="aviso-borrador-legal">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning-ink" />
            <span>
              <b>Texto pendiente de completar y de revisión legal.</b> Faltan los datos del proveedor (entre corchetes) y la revisión de un abogado antes de usarlo con clientes reales.
            </span>
          </div>
        )}

        <div className="mt-8 grid gap-8">
          {secciones.map((s) => (
            <section key={s.titulo}>
              <h2 className="mb-2 text-lg font-semibold">{s.titulo}</h2>
              <div className="grid gap-3 text-[15px] leading-relaxed text-foreground/90">
                {s.parrafos.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
        <LinksLegales className="mt-10 flex flex-wrap gap-x-2 gap-y-1 border-t pt-6 text-sm text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground">
          Ver también: {tipo === "terminos" ? <Link to="/privacidad" className="text-primary hover:underline">Política de Privacidad</Link> : <Link to="/terminos" className="text-primary hover:underline">Términos y Condiciones</Link>}
        </p>
      </main>
    </div>
  );
}
