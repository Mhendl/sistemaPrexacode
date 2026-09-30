/**
 * Medición de visitas y registros (Google Analytics 4 y píxel de Meta), solo en las pantallas públicas
 * (ingreso y registro). Dentro del sistema no se carga. Si no hay IDs configurados en el servidor, no hace nada.
 */
type Ventana = Window & { dataLayer?: unknown[]; gtag?: (...a: unknown[]) => void; fbq?: ((...a: unknown[]) => void) & { callMethod?: unknown; queue?: unknown[] } };

let cargada: Promise<void> | null = null;

function agregarScript(src: string) {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

export function cargarMedicion() {
  if (cargada) return cargada;
  cargada = fetch("/api/publico/medicion")
    .then((r) => (r.ok ? r.json() : { ga: null, metaPixel: null }))
    .then((m: { ga: string | null; metaPixel: string | null }) => {
      const w = window as Ventana;
      if (m.ga) {
        agregarScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(m.ga)}`);
        w.dataLayer = w.dataLayer ?? [];
        w.gtag = function gtag() {
          // eslint-disable-next-line prefer-rest-params
          w.dataLayer!.push(arguments);
        };
        w.gtag("js", new Date());
        w.gtag("config", m.ga);
      }
      if (m.metaPixel && !w.fbq) {
        const fbq = ((...a: unknown[]) => {
          if (fbq.callMethod) (fbq.callMethod as (...x: unknown[]) => void)(...a);
          else fbq.queue!.push(a);
        }) as NonNullable<Ventana["fbq"]>;
        fbq.queue = [];
        w.fbq = fbq;
        agregarScript("https://connect.facebook.net/en_US/fbevents.js");
        fbq("init", m.metaPixel);
        fbq("track", "PageView");
      }
    })
    .catch(() => undefined);
  return cargada;
}

/** Se creó una cuenta: conversión para Google y Meta */
export function conversionRegistro(producto: string) {
  const w = window as Ventana;
  w.gtag?.("event", "sign_up", { method: "email", producto });
  w.fbq?.("track", "CompleteRegistration", { content_name: producto });
}
