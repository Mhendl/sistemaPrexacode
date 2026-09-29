import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronDown, CircleHelp, LifeBuoy, Lightbulb, Search } from "lucide-react";
import { Link, useLocation } from "react-router";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRole } from "@/context/AuthProvider";
import { puede } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { ARTICULOS, ayudasDePantalla, buscarAyuda, SECCIONES, type Articulo } from "./articulos";

/** Las ayudas que corresponden a lo que puede hacer el usuario */
function useArticulos() {
  const { acceso } = useRole();
  return useMemo(() => ARTICULOS.filter((a) => puede(acceso, ...a.permisos)), [acceso]);
}

function ArticuloItem({ a, abierto, onToggle, onIr }: { a: Articulo; abierto: boolean; onToggle: () => void; onIr?: () => void }) {
  const { pathname } = useLocation();
  const yaEsta = a.path.split("?")[0] === pathname && !a.path.includes("?");
  return (
    <li className="rounded-lg border bg-card" data-testid="ayuda-articulo">
      <button type="button" onClick={onToggle} aria-expanded={abierto} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{a.titulo}</span>
          <span className="block text-xs text-muted-foreground">{a.seccion}</span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", abierto && "rotate-180")} />
      </button>
      {abierto && (
        <div className="grid gap-3 border-t px-3.5 py-3 text-sm" data-testid="ayuda-detalle">
          <p className="text-pretty">{a.texto}</p>
          {a.pasos && (
            <ol className="grid list-decimal gap-1.5 pl-5">
              {a.pasos.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ol>
          )}
          {a.consejo && (
            <p className="flex gap-2 rounded-md bg-primary/5 px-3 py-2 text-muted-foreground">
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{a.consejo}</span>
            </p>
          )}
          {!yaEsta && (
            <Button variant="outline" size="sm" className="justify-self-start" asChild>
              <Link to={a.path} onClick={onIr}>
                Ir a {a.seccion === "Primeros pasos" || a.seccion === "Tu cuenta" ? "la pantalla" : a.seccion} <ArrowRight className="size-4" />
              </Link>
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function Lista({ articulos, onIr }: { articulos: Articulo[]; onIr?: () => void }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  return (
    <ul className="grid gap-2">
      {articulos.map((a) => (
        <ArticuloItem key={a.id} a={a} abierto={abierto === a.id} onToggle={() => setAbierto(abierto === a.id ? null : a.id)} onIr={onIr} />
      ))}
    </ul>
  );
}

function SinResultados({ consulta, onIr }: { consulta: string; onIr?: () => void }) {
  return (
    <div className="grid justify-items-center gap-3 rounded-lg border border-dashed px-4 py-8 text-center text-sm" role="status">
      <p>
        No encontramos ayuda sobre <b>“{consulta}”</b>. Probá con otras palabras, por ejemplo “factura”, “stock” o “usuario”.
      </p>
      <Button variant="outline" size="sm" asChild>
        <Link to="/soporte" onClick={onIr}>
          <LifeBuoy className="size-4" /> Preguntarle al equipo de soporte
        </Link>
      </Button>
    </div>
  );
}

/** Buscador de ayuda: con la consulta vacía muestra las ayudas de la pantalla actual (o todas, en la página) */
function BuscadorAyuda({ enPanel, onIr }: { enPanel?: boolean; onIr?: () => void }) {
  const articulos = useArticulos();
  const { pathname } = useLocation();
  const [consulta, setConsulta] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const resultados = useMemo(() => buscarAyuda(consulta, articulos), [consulta, articulos]);
  const deAca = useMemo(() => ayudasDePantalla(pathname, articulos), [pathname, articulos]);
  // Si la pantalla no tiene ayudas propias, las de primeros pasos
  const sugeridas = deAca.length ? deAca : articulos.filter((a) => a.seccion === "Primeros pasos");
  const buscando = consulta.trim().length > 0;

  useEffect(() => {
    if (enPanel) inputRef.current?.focus();
  }, [enPanel]);

  return (
    <div className="grid gap-5">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          placeholder="¿Qué necesitás hacer? Ej.: anular una factura"
          aria-label="Buscar en la ayuda"
          className="h-10 pl-9"
        />
      </div>

      {buscando ? (
        resultados.length ? (
          <section className="grid gap-2" aria-label="Resultados">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {resultados.length} {resultados.length === 1 ? "resultado" : "resultados"}
            </h2>
            <Lista key={consulta} articulos={resultados} onIr={onIr} />
          </section>
        ) : (
          <SinResultados consulta={consulta.trim()} onIr={onIr} />
        )
      ) : enPanel ? (
        <>
          <section className="grid gap-2">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{deAca.length ? "En esta pantalla" : "Primeros pasos"}</h2>
            <Lista articulos={sugeridas} onIr={onIr} />
          </section>
          <Button variant="outline" asChild>
            <Link to="/ayuda" onClick={onIr}>
              Ver todas las ayudas <ArrowRight className="size-4" />
            </Link>
          </Button>
        </>
      ) : (
        SECCIONES.map((s) => {
          const deSeccion = articulos.filter((a) => a.seccion === s);
          return deSeccion.length ? (
            <section key={s} className="grid gap-2">
              <h2 className="text-sm font-semibold">{s}</h2>
              <Lista articulos={deSeccion} />
            </section>
          ) : null;
        })
      )}

      <p className="text-center text-xs text-muted-foreground">
        ¿No encontrás lo que buscás?{" "}
        <Link to="/soporte" onClick={onIr} className="font-medium text-primary hover:underline">
          Escribile al equipo de soporte
        </Link>
      </p>
    </div>
  );
}

/** Botón "?" de la barra de arriba: abre la ayuda sin salir de la pantalla. También con F1. */
export function BotonAyuda() {
  const [abierto, setAbierto] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F1") {
        e.preventDefault();
        setAbierto(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (pathname === "/ayuda") return null;
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Ayuda" onClick={() => setAbierto(true)}>
            <CircleHelp className="size-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Ayuda (F1)</TooltipContent>
      </Tooltip>
      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
          <div className="border-b px-5 py-4 pr-12">
            <SheetTitle className="flex items-center gap-2 text-base">
              <CircleHelp className="size-5 text-primary" /> Ayuda
            </SheetTitle>
            <SheetDescription>Buscá qué hace cada cosa y cómo se hace.</SheetDescription>
          </div>
          <div className="p-5">{abierto && <BuscadorAyuda enPanel onIr={() => setAbierto(false)} />}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}

export function AyudaPage() {
  return (
    <>
      <PageHeader title="Centro de ayuda" description="Qué hace cada cosa y cómo se hace, paso a paso. Tocá una pregunta para ver la respuesta." />
      <Card className="mx-auto max-w-3xl p-4 shadow-none sm:p-6">
        <BuscadorAyuda />
      </Card>
    </>
  );
}
