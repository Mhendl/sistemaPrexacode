import { useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router";
import { Compass } from "lucide-react";
import { driver, type DriveStep, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import "./guia.css";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRole } from "@/context/AuthProvider";
import { guiaDe, type Guia, type PasoGuia } from "./guias";

const selector = (el: string) => (/^[a-z0-9-]+$/.test(el) ? `[data-guia="${el}"]` : el);
const seVe = (e: Element) => {
  const r = e.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden";
};
/** La parte de la pantalla de un paso: la primera que se vea de las que nombra */
function buscar(el: PasoGuia["el"]): Element | null {
  for (const s of typeof el === "string" ? [el] : (el ?? [])) {
    const e = [...document.querySelectorAll(selector(s))].find(seVe);
    if (e) return e;
  }
  return null;
}

/** Los pasos que se pueden mostrar ahora (los de partes que no están en la pantalla se saltean) */
function pasosDe(guia: Guia): DriveStep[] {
  return guia.pasos.flatMap((p): DriveStep[] => {
    const popover = { title: p.titulo, description: p.texto, ...(p.lado ? { side: p.lado } : {}) };
    if (!p.el) return [{ popover }];
    const element = buscar(p.el);
    return element ? [{ element, popover }] : [];
  });
}

let actual: Driver | null = null;

/** Muestra la guía. Si la pantalla todavía está cargando (no hay nada para resaltar), reintenta un momento después. */
export function mostrarGuia(guia: Guia, intentos = 8) {
  actual?.destroy();
  const pasos = pasosDe(guia);
  const cargando = guia.pasos.some((p) => p.el) && !pasos.some((p) => p.element);
  if (cargando || !pasos.length) {
    if (intentos > 0) setTimeout(() => mostrarGuia(guia, intentos - 1), 400);
    return;
  }
  actual = driver({
    steps: pasos,
    showProgress: pasos.length > 1,
    progressText: "{{current}} de {{total}}",
    nextBtnText: "Siguiente →",
    prevBtnText: "← Anterior",
    doneBtnText: "Listo",
    popoverClass: "guia-pop",
    smoothScroll: true,
    stagePadding: 6,
    stageRadius: 10,
    onDestroyed: () => {
      actual = null;
    },
  });
  actual.drive();
}

const claveVista = (usuarioId: string, guiaId: string) => `prexacode-guia-${usuarioId}-${guiaId}`;

/** El botón "Guía" de la barra de arriba (solo en las pantallas que tienen guía). La primera vez que se entra a una pantalla, la guía arranca sola. */
export function BotonGuia() {
  const { pathname } = useLocation();
  const { usuario, empresa } = useRole();
  const guia = useMemo(() => guiaDe(pathname, empresa.producto), [pathname, empresa.producto]);
  const intento = useRef(0);
  // Al cambiar de pantalla, la guía de la anterior se cierra
  useEffect(() => () => actual?.destroy(), [pathname]);

  useEffect(() => {
    if (!guia) return;
    // Las pruebas automáticas no la abren sola (taparía la pantalla)
    if (navigator.webdriver) return;
    const clave = claveVista(usuario.id, guia.id);
    try {
      if (localStorage.getItem(clave)) return;
    } catch {
      return;
    }
    const este = ++intento.current;
    const inicio = Date.now();
    let espera: ReturnType<typeof setTimeout>;
    // Espera a que la pantalla termine de cargar y que no haya un diálogo abierto (por ejemplo, aceptar los términos)
    const probar = () => {
      if (este !== intento.current) return;
      const lista = !!document.querySelector('[data-guia="encabezado"]') && !document.querySelector('[role="dialog"], [role="alertdialog"]') && !document.querySelector(".animate-spin");
      if (lista) {
        try {
          localStorage.setItem(clave, "1");
        } catch {
          /* sin almacenamiento */
        }
        mostrarGuia(guia);
        return;
      }
      if (Date.now() - inicio < 15_000) espera = setTimeout(probar, 400);
    };
    espera = setTimeout(probar, 700);
    return () => clearTimeout(espera);
  }, [guia, usuario.id]);

  if (!guia) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Guía de esta pantalla" data-guia="boton-guia" onClick={() => mostrarGuia(guia)}>
          <Compass className="size-5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Guía de esta pantalla</TooltipContent>
    </Tooltip>
  );
}
