import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

const PAPER_WIDTH = 800;

/** Renderiza el contenido a ancho de hoja y lo escala para que entre en el contenedor */
export function PaperFit({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number>();

  useLayoutEffect(() => {
    const update = () => {
      if (!outer.current || !inner.current) return;
      const s = Math.min(1, outer.current.clientWidth / PAPER_WIDTH);
      setScale(s);
      setHeight(inner.current.offsetHeight * s);
    };
    update();
    const ro = new ResizeObserver(update);
    if (outer.current) ro.observe(outer.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outer} style={{ height }} className="relative w-full overflow-hidden" data-paper-outer>
      <div ref={inner} style={{ width: PAPER_WIDTH, transform: `scale(${scale})`, transformOrigin: "top left" }} className="absolute top-0 left-0" data-paper>
        {children}
      </div>
    </div>
  );
}
