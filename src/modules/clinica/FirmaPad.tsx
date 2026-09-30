import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Recuadro para firmar con el dedo (celular o tablet) o con el mouse.
 * Devuelve la firma como imagen PNG, o null si está vacía.
 */
export function FirmaPad({ etiqueta, onChange }: { etiqueta: string; onChange: (png: string | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const [vacia, setVacia] = useState(true);

  useEffect(() => {
    const c = canvas.current!;
    const ajustar = () => {
      const r = window.devicePixelRatio || 1;
      c.width = c.clientWidth * r;
      c.height = c.clientHeight * r;
      const ctx = c.getContext("2d")!;
      ctx.scale(r, r);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#111827";
    };
    ajustar();
  }, []);

  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const empezar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    canvas.current!.setPointerCapture(e.pointerId);
    dibujando.current = true;
    const ctx = canvas.current!.getContext("2d")!;
    const p = punto(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + 0.1, p.y + 0.1);
    ctx.stroke();
  };
  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dibujando.current) return;
    const ctx = canvas.current!.getContext("2d")!;
    const p = punto(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const terminar = () => {
    if (!dibujando.current) return;
    dibujando.current = false;
    setVacia(false);
    onChange(canvas.current!.toDataURL("image/png"));
  };
  const borrar = () => {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setVacia(true);
    onChange(null);
  };

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{etiqueta}</span>
        <Button type="button" size="sm" variant="ghost" onClick={borrar} disabled={vacia}>
          <Eraser className="size-4" /> Borrar
        </Button>
      </div>
      <div className="relative">
        <canvas
          ref={canvas}
          className="h-36 w-full touch-none rounded-lg border-2 border-dashed bg-white"
          onPointerDown={empezar}
          onPointerMove={mover}
          onPointerUp={terminar}
          onPointerLeave={terminar}
          aria-label={etiqueta}
          data-testid={`firma-${etiqueta.toLowerCase().includes("profesional") ? "profesional" : "paciente"}`}
        />
        {vacia && <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-neutral-400">Firmá acá con el dedo o el mouse</span>}
      </div>
    </div>
  );
}
