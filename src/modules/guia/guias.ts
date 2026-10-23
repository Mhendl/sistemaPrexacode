/**
 * Textos de la guía visual de cada pantalla (el botón "Guía" de arriba).
 *
 * Cada paso: `el` = la parte de la pantalla a resaltar: el nombre de un `data-guia="…"` o un selector CSS
 * (si son varios, el primero que se vea: así funciona igual en la compu y en el celular); sin `el`, un cartel
 * centrado. Si la parte no está en la pantalla (por ejemplo, el usuario no tiene ese permiso), el paso se saltea.
 * `texto` admite <b>negrita</b> y <br>.
 */
import type { ProductoId } from "@/config/brand";

export interface PasoGuia {
  el?: string | string[];
  titulo: string;
  texto: string;
  lado?: "top" | "right" | "bottom" | "left";
}
export interface Guia {
  /** Para recordar que ya se vio (por usuario) */
  id: string;
  pasos: PasoGuia[];
}

const MENU = ["menu", '[aria-label="Abrir menú"]'];

/** La barra de arriba y el menú: se muestran en la guía del inicio */
const BARRAS: PasoGuia[] = [
  {
    el: MENU,
    lado: "right",
    titulo: "📚 El menú",
    texto: "Desde acá vas a cada parte del sistema, agrupadas por tema.<br><br>Ves solo lo que tu usuario tiene permiso de usar: si falta algo, lo habilita un administrador en <b>Configuración → Roles y permisos</b>.",
  },
  {
    el: "busqueda-global",
    titulo: "🔎 El buscador",
    texto: "Escribí lo que buscás y saltá directo: una pantalla, un cliente, un producto…<br><br>Atajo: <b>Ctrl + K</b> desde cualquier pantalla.",
  },
  {
    el: '[aria-label="Ayuda"]',
    titulo: "❓ Ayuda",
    texto: "Explicaciones paso a paso de cómo se hace cada cosa, con buscador. Se abre al costado, sin salir de lo que estás haciendo.<br><br>Atajo: <b>F1</b>.",
  },
  {
    el: "boton-guia",
    titulo: "🧭 Esta guía",
    texto: "Cada pantalla importante tiene su propio recorrido. La primera vez que entrás aparece solo, y lo podés repetir cuando quieras tocando este botón.",
  },
  {
    el: '[aria-label^="Notificaciones"]',
    titulo: "🔔 Avisos",
    texto: "Lo que conviene saber aparece acá, con un número cuando hay avisos sin leer. Tocá un aviso y te lleva a donde corresponde.",
  },
  {
    el: '[aria-label="Menú de usuario"]',
    titulo: "👤 Tu usuario",
    texto: "Tus preferencias de avisos por email, el modo claro u oscuro, tu plan y cerrar sesión.",
  },
];

const BUSCAR_Y_TABLA = (que: string, ficha: string): PasoGuia[] => [
  { el: "buscar", titulo: "🔎 Buscar y filtrar", texto: `Escribí parte del nombre o un dato y la lista se filtra al instante. Al lado tenés filtros para ver solo ${que}.` },
  { el: "tabla", lado: "top", titulo: "📋 La lista", texto: `Tocá un título de columna para ordenar. Tocá una fila para abrir ${ficha}.<br><br>Con las casillas de la izquierda elegís varios y los editás juntos.` },
];

// ---------------------------------------------------------------- Prexacode (gestión)

const INICIO_GESTION: Guia = {
  id: "inicio",
  pasos: [
    {
      titulo: "👋 Bienvenido a Prexacode",
      texto: "Te muestro en un minuto qué es cada cosa. Avanzá con <b>Siguiente</b> o con las flechas del teclado; salí cuando quieras con la <b>✕</b> o con Esc.",
    },
    ...BARRAS,
    { el: "acciones", titulo: "⚡ Lo que más vas a usar", texto: "Atajos para lo de todos los días: <b>emitir una factura</b> y <b>registrar un cobro</b>." },
    {
      el: '[data-testid="primeros-pasos"]',
      titulo: "✅ Primeros pasos",
      texto: "Lo que conviene hacer al empezar, en orden. Tocá cada paso y te lleva a la pantalla. Cuando completás todos, este cuadro desaparece.",
    },
    {
      el: '[data-testid="kpis-inicio"]',
      lado: "bottom",
      titulo: "📊 Cómo viene el negocio",
      texto: "Lo vendido en el mes (comparado con el anterior), lo que te deben y cuánto ya está vencido, los productos con poco stock y los remitos del día.",
    },
    {
      titulo: "🎉 ¡Listo!",
      texto: "Te recomiendo arrancar por <b>Primeros pasos</b>. Si tenés tus clientes o productos en Excel, los subís en un minuto desde <b>Importar y exportar</b>.<br><br>Y si te trabás, escribinos desde <b>Soporte</b>: te respondemos nosotros.",
    },
  ],
};

const CLIENTES: Guia = {
  id: "clientes",
  pasos: [
    { el: "encabezado", titulo: "👥 Clientes", texto: "Tu cartera de clientes: sus datos, su cuenta corriente y todo lo que les facturaste." },
    { el: "acciones", titulo: "➕ Nuevo cliente", texto: "Cargá uno nuevo con su CUIT, su condición de IVA y sus datos de contacto." },
    ...BUSCAR_Y_TABLA("una condición de IVA o los activos", "la ficha del cliente: datos de contacto, cuenta corriente, comprobantes, presupuestos y remitos"),
    { titulo: "📥 ¿Los tenés en Excel?", texto: "No los cargues uno por uno: subilos todos juntos desde <b>Importar y exportar</b>. El sistema reconoce las columnas solo." },
  ],
};

const PRODUCTOS: Guia = {
  id: "productos",
  pasos: [
    { el: "encabezado", titulo: "📦 Productos y stock", texto: "Tu catálogo con precios y existencias. Los que quedan por debajo del stock mínimo se resaltan para que repongas a tiempo." },
    {
      el: "acciones",
      titulo: "💲 Precios y productos nuevos",
      texto: "<b>Nuevo producto</b> para cargar uno.<br><b>Actualizar precios</b> sube (o baja) todos los precios de una vez con un porcentaje: ideal cuando hay aumentos.",
    },
    ...BUSCAR_Y_TABLA("una categoría o según cómo está el stock", "el producto y ver sus movimientos de stock"),
    { titulo: "🔄 El stock se mueve solo", texto: "Cada factura o remito descuenta stock automáticamente. Las compras y los ajustes se cargan en <b>Movimientos</b>." },
  ],
};

const FACTURACION: Guia = {
  id: "facturacion",
  pasos: [
    { el: "encabezado", titulo: "🧾 Facturación", texto: "Todos tus comprobantes electrónicos de ARCA: facturas y notas de crédito, con su CAE." },
    {
      el: '[data-testid="aviso-modo-prueba"]',
      titulo: "🧪 Modo prueba",
      texto: "Mientras no conectes tu certificado de ARCA, las facturas son de práctica: no tienen validez fiscal y no pasa nada si te equivocás. Se conecta en <b>Configuración → Facturación ARCA</b>.",
    },
    { el: "acciones", titulo: "➕ Nueva factura", texto: "Para emitir un comprobante. El tipo (A, B o C) se elige solo según tu condición de IVA y la del cliente." },
    ...BUSCAR_Y_TABLA("un tipo de comprobante, su estado en ARCA o si está cobrado", "el comprobante: lo imprimís o descargás en PDF, se lo enviás al cliente o le hacés una nota de crédito"),
  ],
};

const NUEVA_FACTURA: Guia = {
  id: "nueva-factura",
  pasos: [
    {
      el: "datos-comprobante",
      lado: "right",
      titulo: "1️⃣ Los datos",
      texto: "Elegí el <b>cliente</b> (o Consumidor final). El <b>tipo</b> de factura se elige solo; revisá el punto de venta, la fecha y la condición de venta.",
    },
    {
      el: "items",
      lado: "top",
      titulo: "2️⃣ Qué le vendés",
      texto: "Agregá los productos o servicios: el precio y el IVA se completan solos. Podés cambiar cantidades, precios y bonificaciones.<br><br>Si el producto lleva stock, se descuenta al emitir (salvo que lo destildes porque ya salió con un remito).",
    },
    { el: "vista-previa", lado: "left", titulo: "👀 Así queda", texto: "La factura tal como la va a recibir tu cliente, con tu logo. Se actualiza mientras cargás." },
    {
      el: "acciones",
      titulo: "3️⃣ Emitir",
      texto: "El sistema le pide el <b>CAE</b> a ARCA y la factura queda lista: la imprimís, la descargás en PDF o se la enviás al cliente.",
    },
  ],
};

const COBRANZAS: Guia = {
  id: "cobranzas",
  pasos: [
    { el: "encabezado", titulo: "💰 Cobranzas", texto: "Las cuentas corrientes de tus clientes: quién te debe, desde cuándo y lo que ya te pagaron." },
    { el: '[data-testid="kpis-cobranzas"]', lado: "bottom", titulo: "📊 El resumen", texto: "Cuánto te deben en total, cuánto está vencido, los saldos a favor de clientes y cuántos clientes te deben." },
    {
      el: 'main [role="tablist"]',
      titulo: "🗂️ Tres miradas",
      texto: "<b>Clientes</b>: el saldo de cada uno.<br><b>Vencidas</b>: las facturas que ya pasaron su vencimiento, para reclamarlas.<br><b>Recibos</b>: los cobros registrados.",
    },
    { el: "acciones", titulo: "➕ Registrar un cobro", texto: "Cuando un cliente te paga, hacé el recibo: elegís qué facturas cancela y el medio de pago." },
  ],
};

// ---------------------------------------------------------------- CoreDental

const INICIO_DENTAL: Guia = {
  id: "inicio",
  pasos: [
    {
      titulo: "👋 Bienvenido a CoreDental",
      texto: "Te muestro en un minuto qué es cada cosa. Avanzá con <b>Siguiente</b> o con las flechas del teclado; salí cuando quieras con la <b>✕</b> o con Esc.",
    },
    ...BARRAS,
    { el: "acciones", titulo: "⚡ Lo de todos los días", texto: "Atajos para <b>dar un turno</b> y para ir a los <b>pacientes</b>." },
    {
      el: '[data-testid="primeros-pasos"]',
      titulo: "✅ Primeros pasos",
      texto: "Lo que conviene hacer al empezar, en orden. Tocá cada paso y te lleva a la pantalla. Cuando completás todos, este cuadro desaparece.",
    },
    { el: '[data-testid="kpis-consultorio"]', lado: "bottom", titulo: "📊 El consultorio de un vistazo", texto: "Los números principales del día y del mes." },
    {
      el: '[data-testid="turnos-hoy"]',
      lado: "top",
      titulo: "📅 Turnos de hoy",
      texto: "Los pacientes del día, en orden. Tocá un nombre para abrir su ficha.",
    },
    {
      titulo: "🎉 ¡Listo!",
      texto: "Te recomiendo arrancar por <b>Primeros pasos</b>. Si tenés tus pacientes en Excel, los subís en un minuto desde <b>Importar y exportar</b>.<br><br>Y si te trabás, escribinos desde <b>Soporte</b>: te respondemos nosotros.",
    },
  ],
};

const PACIENTES: Guia = {
  id: "pacientes",
  pasos: [
    { el: "encabezado", titulo: "🦷 Pacientes", texto: "Todos tus pacientes, con su ficha, historia clínica, odontograma y cuenta." },
    { el: "acciones", titulo: "➕ Nuevo paciente", texto: "Cargá uno nuevo: datos, obra social y antecedentes de salud. Las alergias quedan a la vista cada vez que abrís su ficha." },
    ...BUSCAR_Y_TABLA("una cobertura o los activos", "la ficha completa del paciente"),
  ],
};

const PACIENTE: Guia = {
  id: "paciente",
  pasos: [
    { el: "encabezado", titulo: "🦷 La ficha del paciente", texto: "Todo lo del paciente en un solo lugar. Arriba, sus datos y los botones para editarlo." },
    {
      el: '[data-testid="alerta-alergias"]',
      titulo: "⚠️ Alergias y antecedentes",
      texto: "Si el paciente tiene alergias o antecedentes importantes, se muestran siempre arriba de todo, para que nadie los pase por alto.",
    },
    {
      el: 'main [role="tablist"]',
      lado: "bottom",
      titulo: "🗂️ Las solapas",
      texto: "<b>Historia clínica</b>: cada atención, con lo que se hizo.<br><b>Odontograma</b> y <b>periodontograma</b>: el estado de cada pieza.<br><b>Consentimientos</b> e <b>imágenes</b>: firmados y radiografías.<br><b>Presupuestos</b> y <b>cuenta</b>: lo que se le cotizó, lo que pagó y lo que debe.<br><b>Turnos</b>: los anteriores y los próximos.",
    },
  ],
};

const AGENDA: Guia = {
  id: "agenda",
  pasos: [
    { el: "encabezado", titulo: "📅 La agenda", texto: "Los turnos del consultorio, de cada profesional. Arriba, los botones para agendar un turno, bloquear un horario y los recordatorios." },
    {
      el: "agenda-barra",
      lado: "bottom",
      titulo: "🧭 Moverse por la agenda",
      texto: "Las flechas cambian de día o de semana y <b>Hoy</b> vuelve al día actual.<br><br>Tocá el nombre de un profesional para mostrar u ocultar sus turnos, y elegí ver por <b>día</b> o por <b>semana</b>.",
    },
    {
      el: "agenda",
      lado: "top",
      titulo: "🕘 Dar un turno",
      texto: "Tocá un horario libre (o el botón <b>Agendar</b> de arriba) para dar un turno. Tocá un turno para ver el detalle, confirmarlo, marcarlo como realizado o ausente, o cancelarlo.<br><br>El paciente recibe un recordatorio para confirmar, y si cancela el horario queda libre.",
    },
  ],
};

const AGENDA_GESTION: Guia = {
  id: "agenda",
  pasos: [
    { el: "encabezado", titulo: "📅 La agenda", texto: "Las visitas, reuniones y tareas de tu equipo. Arriba, los botones para agendar y para bloquear un horario." },
    {
      el: "agenda-barra",
      lado: "bottom",
      titulo: "🧭 Moverse por la agenda",
      texto: "Las flechas cambian de día o de semana y <b>Hoy</b> vuelve al día actual.<br><br>Tocá el nombre de una persona para mostrar u ocultar su agenda, y elegí ver por <b>día</b> o por <b>semana</b>.",
    },
    {
      el: "agenda",
      lado: "top",
      titulo: "🕘 Agendar",
      texto: "Tocá un horario libre (o el botón <b>Agendar</b> de arriba). Tocá algo ya agendado para ver el detalle, confirmarlo, marcarlo como realizado o cancelarlo.",
    },
  ],
};

const CAJA: Guia = {
  id: "caja",
  pasos: [
    { el: "encabezado", titulo: "🏦 Caja diaria", texto: "Lo que entra y sale cada día, separado por medio de pago, y el arqueo al cerrar." },
    { el: "caja-dia", titulo: "📅 El día", texto: "Con las flechas o la fecha mirás la caja de otro día." },
    {
      el: "caja-estado",
      titulo: "🔓 Abrir y cerrar",
      texto: "A la mañana abrís la caja con el efectivo inicial. Al cerrar contás el efectivo y el sistema te muestra si hay <b>diferencia</b>.",
    },
    { el: "caja-medios", lado: "top", titulo: "💳 Por medio de pago", texto: "Cuánto entró en efectivo, transferencia, tarjeta… Los cobros a pacientes se suman solos." },
    { el: "acciones", titulo: "➕ Gastos y otros ingresos", texto: "Lo que no es un cobro a un paciente: un gasto que pagaste de la caja o un ingreso extra." },
  ],
};

const LIQUIDACION: Guia = {
  id: "liquidacion",
  pasos: [
    { el: "encabezado", titulo: "📑 Liquidación a obras sociales", texto: "Lo que hay que facturarle a cada obra social en el mes: las prestaciones hechas a sus afiliados." },
    { el: "liq-filtros", titulo: "🔍 Obra social y mes", texto: "Elegí la obra social y el mes: la liquidación se arma sola con lo cargado en las historias clínicas." },
    { el: "acciones", titulo: "📤 Exportar a Excel", texto: "Descargala lista para presentar." },
  ],
};

// ---------------------------------------------------------------- las dos

const CONFIGURACION = (producto: ProductoId): Guia => ({
  id: "configuracion",
  pasos: [
    { el: "encabezado", titulo: "⚙️ Configuración", texto: "Todo lo que se configura una vez y queda andando." },
    {
      el: 'main [role="tablist"]',
      lado: "bottom",
      titulo: "🗂️ Las solapas",
      texto: [
        "<b>Empresa</b>: datos, logo y condición de IVA.",
        "<b>Usuarios</b> y <b>Roles y permisos</b>: tu equipo y qué puede hacer cada uno.",
        "<b>Facturación ARCA</b>: el certificado para facturar de verdad.",
        "<b>Email</b> y <b>WhatsApp</b>: desde dónde salen los envíos.",
        producto === "dental" ? "<b>Agenda</b>: profesionales, horarios y turnos online." : "<b>Agenda</b>: horarios y recursos.",
        "<b>Plan y suscripción</b>: tu plan y los pagos.",
      ].join("<br>"),
    },
  ],
});

/** La guía de la pantalla en la que está (o null si esa pantalla no tiene) */
export function guiaDe(pathname: string, producto: ProductoId): Guia | null {
  const p = pathname.replace(/\/+$/, "") || "/";
  const dental = producto === "dental";
  if (p === "/") return dental ? INICIO_DENTAL : INICIO_GESTION;
  if (p === "/configuracion") return CONFIGURACION(producto);
  if (p === "/agenda") return dental ? AGENDA : AGENDA_GESTION;
  if (dental) {
    if (p === "/pacientes") return PACIENTES;
    if (/^\/pacientes\/[^/]+$/.test(p)) return PACIENTE;
    if (p === "/caja") return CAJA;
    if (p === "/liquidacion") return LIQUIDACION;
    return null;
  }
  if (p === "/clientes") return CLIENTES;
  if (p === "/productos") return PRODUCTOS;
  if (p === "/facturacion") return FACTURACION;
  if (p === "/facturacion/nueva") return NUEVA_FACTURA;
  if (p === "/cobranzas") return COBRANZAS;
  return null;
}
