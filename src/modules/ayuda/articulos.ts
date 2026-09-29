/**
 * Centro de ayuda: qué hace cada cosa y cómo se hace, en palabras simples.
 * Los nombres de botones y pestañas son los que se ven en pantalla: si se cambia uno, cambiarlo también acá.
 */

/** Solo lo ven los administradores (ningún rol tiene este permiso) */
const SOLO_ADMIN = "solo.admin";

export interface Articulo {
  id: string;
  titulo: string;
  /** Sección a la que pertenece (agrupa la lista) */
  seccion: string;
  /** Pantalla donde se hace: el botón "Ir" lleva ahí, y aparece primero estando en esa pantalla */
  path: string;
  /** Se ve con alguno de estos permisos (vacío: todos) */
  permisos: string[];
  /** Otras palabras con las que alguien lo buscaría */
  palabras: string;
  texto: string;
  pasos?: string[];
  consejo?: string;
}

export const SECCIONES = [
  "Primeros pasos",
  "Clientes",
  "Oportunidades",
  "Agenda",
  "Presupuestos",
  "Facturación",
  "Cobranzas",
  "Remitos",
  "Productos y stock",
  "Empleados y sueldos",
  "Reportes",
  "Importar y exportar",
  "Configuración",
  "Plan y pagos",
  "Tu cuenta",
] as const;

export const ARTICULOS: Articulo[] = [
  // ------------------------------------------------------------------ Primeros pasos
  {
    id: "primeros-pasos",
    titulo: "Por dónde empezar",
    seccion: "Primeros pasos",
    path: "/",
    permisos: [],
    palabras: "empezar comenzar inicio arrancar configurar primer dia tutorial guia",
    texto: "El orden recomendado para dejar el sistema listo para trabajar.",
    pasos: [
      "Configuración → Empresa: cargá la razón social, el CUIT, la condición de IVA y el logo (sale en los comprobantes).",
      "Productos y stock → Nuevo producto: cargá lo que vendés, o traelo de un Excel desde Importar y exportar.",
      "Clientes → Nuevo cliente: cargá tus clientes, o importalos también desde Excel.",
      "Configuración → Usuarios: creá un usuario para cada persona del equipo.",
      "Configuración → Facturación ARCA: conectá ARCA para facturar de verdad. Mientras tanto podés practicar en modo pruebas.",
    ],
  },
  {
    id: "inicio",
    titulo: "Qué muestra la pantalla de Inicio",
    seccion: "Primeros pasos",
    path: "/",
    permisos: [],
    palabras: "tablero resumen dashboard ventas del mes por cobrar stock bajo grafico",
    texto:
      "Es el resumen del negocio: ventas del mes comparadas con el mes anterior, cuánto te deben los clientes, los productos bajo el stock mínimo, los remitos y la agenda de hoy, el gráfico de ventas y los últimos comprobantes. Cada persona ve solo las partes de las secciones a las que tiene acceso.",
  },
  {
    id: "buscador",
    titulo: "Buscar un cliente, producto o comprobante",
    seccion: "Primeros pasos",
    path: "/",
    permisos: [],
    palabras: "buscar encontrar buscador ctrl k lupa",
    texto:
      "Usá el buscador de arriba de todo (o apretá Ctrl + K). Busca clientes por nombre o CUIT, productos por descripción o código, y comprobantes por número. Con Enter vas al primer resultado.",
  },
  {
    id: "campanita",
    titulo: "Los avisos de la campanita",
    seccion: "Primeros pasos",
    path: "/cuenta/notificaciones",
    permisos: [],
    palabras: "notificaciones avisos alertas campana",
    texto:
      "La campanita avisa de stock bajo o agotado, facturas por vencer o vencidas, cosas de la agenda, oportunidades que te asignaron y respuestas de soporte. Cada persona elige qué avisos recibir en Mis notificaciones (menú de tu usuario, arriba a la derecha).",
  },
  {
    id: "celular",
    titulo: "Usarlo desde el celular o la tablet",
    seccion: "Primeros pasos",
    path: "/",
    permisos: [],
    palabras: "celular telefono movil tablet android iphone instalar app",
    texto:
      "No hay que instalar nada: entrá a la misma dirección desde el navegador del celular. El menú se abre con el botón de las tres rayas, arriba a la izquierda.",
  },
  {
    id: "soporte",
    titulo: "Pedir ayuda al equipo de Prexacode",
    seccion: "Primeros pasos",
    path: "/soporte",
    permisos: [],
    palabras: "soporte ayuda consulta problema error reclamo contacto hablar escribir ticket",
    texto: "Si algo no funciona o no encontrás cómo hacerlo, escribinos. Te respondemos ahí mismo y te llega un aviso en la campanita y por email.",
    pasos: ["Entrá a Soporte.", "Tocá Nuevo pedido de ayuda.", "Elegí el tipo (problema, consulta, facturación y pagos, sugerencia) y contanos qué pasa."],
  },

  // ------------------------------------------------------------------ Clientes
  {
    id: "cliente-nuevo",
    titulo: "Cargar un cliente",
    seccion: "Clientes",
    path: "/clientes",
    permisos: ["clientes.ver"],
    palabras: "alta cliente nuevo agregar crear cuit razon social",
    texto: "El CUIT se controla: si tiene un error de tipeo, el sistema lo avisa. La condición de IVA define qué letra de factura le corresponde.",
    pasos: ["Entrá a Clientes.", "Tocá Nuevo cliente.", "Completá razón social, CUIT, condición de IVA y los datos de contacto.", "Guardá."],
  },
  {
    id: "cliente-ficha",
    titulo: "Ver toda la historia de un cliente",
    seccion: "Clientes",
    path: "/clientes",
    permisos: ["clientes.ver"],
    palabras: "ficha detalle historial cuenta corriente deuda notas cliente",
    texto:
      "Tocá el nombre del cliente en la lista. En la ficha están sus datos, la cuenta corriente (cuánto debe y de qué facturas), sus comprobantes, presupuestos, remitos, oportunidades, notas y los productos que suele comprar. Desde ahí mismo podés facturarle, cobrarle o armarle un presupuesto.",
  },
  {
    id: "cliente-notas",
    titulo: "Anotar algo sobre un cliente",
    seccion: "Clientes",
    path: "/clientes",
    permisos: ["clientes.ver"],
    palabras: "nota comentario observacion recordatorio fijar",
    texto: "En la ficha del cliente, en Notas, tocá Nueva nota. Por ejemplo: \"prefiere que lo llamen a la tarde\". Las notas importantes se pueden fijar para que queden arriba.",
  },
  {
    id: "clientes-masivo",
    titulo: "Cambiar varios clientes de una vez",
    seccion: "Clientes",
    path: "/clientes",
    permisos: ["clientes.editar"],
    palabras: "edicion masiva varios muchos todos seleccionar rubro localidad estado inactivo",
    texto: "Sirve para cambiarles a muchos el rubro, la localidad o el estado (activo o inactivo).",
    pasos: ["En Clientes, tildá los clientes (o la casilla de arriba para elegir todos los de la lista).", "Tocá Editar datos en la barra que aparece.", "Elegí qué cambiar y confirmá."],
  },
  {
    id: "cliente-inactivo",
    titulo: "Dar de baja a un cliente",
    seccion: "Clientes",
    path: "/clientes",
    permisos: ["clientes.editar"],
    palabras: "baja borrar eliminar cliente inactivo desactivar",
    texto:
      "Los clientes no se borran, así no se pierde su historia ni sus facturas: se pasan a Inactivo editando el cliente. Los inactivos no aparecen para facturar, pero se pueden ver filtrando por estado.",
  },

  // ------------------------------------------------------------------ Oportunidades
  {
    id: "oportunidades",
    titulo: "Seguir una venta con Oportunidades",
    seccion: "Oportunidades",
    path: "/oportunidades",
    permisos: ["oportunidades.ver"],
    palabras: "embudo pipeline crm venta prospecto negocio etapa ganada perdida",
    texto:
      "Cada oportunidad es una venta posible, con monto, fecha estimada de cierre y responsable. Las columnas son las etapas: Nuevo, Contactado, Propuesta, Negociación, Ganada y Perdida.",
    pasos: [
      "Tocá Nueva oportunidad y elegí un cliente (o escribí el nombre de un prospecto que todavía no cargaste).",
      "Arrastrá la tarjeta a la etapa en la que está.",
      "Si se pierde, se anota el motivo. Si le hacés un presupuesto y se factura, pasa a Ganada sola.",
    ],
  },

  // ------------------------------------------------------------------ Agenda
  {
    id: "agenda-agendar",
    titulo: "Agendar un turno, visita o tarea",
    seccion: "Agenda",
    path: "/agenda",
    permisos: ["agenda.ver"],
    palabras: "turno cita visita tarea reunion calendario agendar reservar",
    texto: "Si el horario ya está ocupado para esa persona o recurso, el sistema avisa. A quien le asignás el evento le llega un aviso.",
    pasos: ["Entrá a Agenda.", "Tocá un horario libre, o el botón Agendar.", "Elegí el recurso, el cliente, el horario y guardá."],
  },
  {
    id: "agenda-personalizar",
    titulo: "Adaptar la agenda a tu rubro",
    seccion: "Agenda",
    path: "/configuracion?tab=agenda",
    permisos: ["configuracion"],
    palabras: "personalizar agenda recursos profesionales tecnicos salas horario nombre turno visita",
    texto:
      "En Configuración → Agenda (o el botón Personalizar de la agenda) elegís cómo se llaman las cosas (\"Turno\" y \"Profesional\" en un consultorio, \"Visita\" y \"Técnico\" en un servicio técnico), el horario de atención, los tipos de evento y los recursos, como salas o boxes. Cada usuario nuevo aparece solo como recurso.",
  },

  // ------------------------------------------------------------------ Presupuestos
  {
    id: "presupuesto-nuevo",
    titulo: "Hacer un presupuesto",
    seccion: "Presupuestos",
    path: "/presupuestos",
    permisos: ["presupuestos.ver"],
    palabras: "presupuesto cotizacion cotizar propuesta nuevo",
    texto: "Los renglones pueden ser productos del catálogo o texto libre, con bonificación por renglón. Tiene fecha de validez: pasada esa fecha figura como Vencido.",
    pasos: ["Entrá a Presupuestos.", "Tocá Nuevo presupuesto.", "Elegí el cliente, agregá los renglones y guardá.", "Tocá Enviar para mandarlo por email o WhatsApp, o Imprimir / PDF."],
  },
  {
    id: "presupuesto-facturar",
    titulo: "Pasar un presupuesto a factura",
    seccion: "Presupuestos",
    path: "/presupuestos",
    permisos: ["presupuestos.ver"],
    palabras: "facturar presupuesto aceptado convertir",
    texto: "Cuando el cliente acepta, abrí el presupuesto, marcalo como Aceptado y tocá Facturar. La factura se arma sola con todos los renglones; solo revisás y emitís.",
    consejo: "Para hacer otro parecido, abrí uno viejo y tocá Duplicar.",
  },

  // ------------------------------------------------------------------ Facturación
  {
    id: "factura-nueva",
    titulo: "Hacer una factura",
    seccion: "Facturación",
    path: "/facturacion",
    permisos: ["facturacion.ver"],
    palabras: "factura facturar emitir vender venta comprobante cae arca afip ticket",
    texto: "La letra (A, B o C) se elige sola según tu condición de IVA y la del cliente. Al emitir, se descuenta el stock de los productos.",
    pasos: [
      "Entrá a Facturación y tocá Nueva factura.",
      "Elegí el cliente.",
      "Agregá los productos o servicios.",
      "Elegí la condición de venta: Contado (tildando Cobrada en el momento, el recibo se genera solo) o Cuenta corriente.",
      "Emití: ARCA devuelve el CAE y el comprobante queda listo para imprimir o enviar.",
    ],
  },
  {
    id: "factura-letra",
    titulo: "¿Factura A, B o C?",
    seccion: "Facturación",
    path: "/facturacion",
    permisos: ["facturacion.ver"],
    palabras: "letra tipo a b c responsable inscripto monotributo consumidor final exento",
    texto:
      "Si sos Responsable Inscripto: factura A a otro Responsable Inscripto, y B a monotributistas, exentos y consumidores finales. Si sos Monotributista, siempre C. El sistema lo elige solo, según lo que cargaste en Configuración → Empresa y en el cliente.",
  },
  {
    id: "nota-credito",
    titulo: "Anular o corregir una factura (nota de crédito)",
    seccion: "Facturación",
    path: "/facturacion",
    permisos: ["facturacion.ver"],
    palabras: "anular factura corregir error devolucion nota de credito nc descontar",
    texto:
      "Una factura electrónica no se borra: se anula con una nota de crédito. Puede ser por el total o por una parte, y no puede superar lo que queda de la factura.",
    pasos: ["Abrí la factura.", "Tocá Nota de crédito.", "Elegí qué renglones o qué importe, y si la mercadería vuelve al stock.", "Emití."],
  },
  {
    id: "factura-enviar",
    titulo: "Mandar una factura al cliente",
    seccion: "Facturación",
    path: "/facturacion",
    permisos: ["facturacion.ver"],
    palabras: "enviar mandar mail email whatsapp pdf imprimir link compartir",
    texto:
      "Abrí la factura y tocá Enviar: sale por email o WhatsApp con un link que el cliente abre sin usuario. Con Imprimir / PDF la guardás o la imprimís. También se puede mandar sola al emitirla (Configuración → Email).",
  },
  {
    id: "factura-pruebas",
    titulo: "Practicar sin facturar de verdad",
    seccion: "Facturación",
    path: "/configuracion?tab=arca",
    permisos: ["facturacion.ver"],
    palabras: "modo pruebas homologacion practicar test demo simular",
    texto:
      "Mientras ARCA no está conectado, o si elegís el modo pruebas en Configuración → Facturación ARCA, las facturas no tienen validez fiscal: sirven para aprender. Cuando conectás ARCA en producción, pasan a ser reales.",
  },

  // ------------------------------------------------------------------ Cobranzas
  {
    id: "cobro",
    titulo: "Registrar un cobro",
    seccion: "Cobranzas",
    path: "/cobranzas",
    permisos: ["cobranzas.ver"],
    palabras: "cobrar cobro pago recibo pagar cliente transferencia efectivo cheque",
    texto: "Se pueden combinar medios (parte en efectivo y parte con transferencia) y hacer cobros parciales. Lo que sobra queda a favor del cliente.",
    pasos: [
      "Entrá a Cobranzas y tocá Registrar cobro (o desde la factura o la ficha del cliente).",
      "Elegí el cliente y qué facturas paga.",
      "Cargá con qué pagó: efectivo, transferencia, cheque, tarjeta, Mercado Pago, retenciones.",
      "Guardá: se genera el recibo numerado.",
    ],
  },
  {
    id: "deuda",
    titulo: "Ver quién me debe y desde cuándo",
    seccion: "Cobranzas",
    path: "/cobranzas",
    permisos: ["cobranzas.ver"],
    palabras: "deuda deudores morosos saldo vencidas cuenta corriente antiguedad",
    texto: "En Cobranzas está la deuda de cada cliente separada por antigüedad: al día, de 1 a 30 días, de 31 a 60, de 61 a 90 y más de 90. Abajo, las facturas vencidas y los últimos recibos.",
    consejo: "En Configuración → Email podés activar que a los clientes les llegue un recordatorio antes de que venza la factura y otro cuando vence.",
  },
  {
    id: "recibo-anular",
    titulo: "Anular un recibo (por ejemplo, un cheque rechazado)",
    seccion: "Cobranzas",
    path: "/cobranzas",
    permisos: ["cobranzas.ver"],
    palabras: "anular recibo cheque rechazado error cobro",
    texto: "Abrí el recibo y tocá Anular, con el motivo. Las facturas que pagaba vuelven a quedar pendientes.",
  },

  // ------------------------------------------------------------------ Remitos
  {
    id: "remito",
    titulo: "Hacer un remito de entrega",
    seccion: "Remitos",
    path: "/remitos",
    permisos: ["remitos.ver"],
    palabras: "remito entrega envio despacho mercaderia",
    texto:
      "Al emitir el remito se descuenta el stock; si lo anulás, vuelve. No deja emitirlo si no alcanza el stock, y marca qué renglón falla. Se imprime en A4 con el logo de la empresa.",
    pasos: ["Entrá a Remitos y tocá Nuevo remito.", "Elegí el cliente y los productos.", "Emití e imprimí."],
  },

  // ------------------------------------------------------------------ Productos y stock
  {
    id: "producto-nuevo",
    titulo: "Cargar un producto o servicio",
    seccion: "Productos y stock",
    path: "/productos",
    permisos: ["productos.ver"],
    palabras: "producto articulo item servicio alta nuevo codigo sku precio",
    texto: "El precio se carga sin IVA; el IVA se suma al facturar según la alícuota. Los servicios (horas, abonos, envíos) no llevan stock.",
    pasos: ["Entrá a Productos y stock.", "Tocá Nuevo producto.", "Completá código, descripción, precio sin IVA, alícuota, stock y stock mínimo.", "Guardá."],
  },
  {
    id: "precios-aumento",
    titulo: "Aumentar los precios por porcentaje",
    seccion: "Productos y stock",
    path: "/productos",
    permisos: ["productos.editar"],
    palabras: "aumento subir precios porcentaje inflacion lista de precios actualizar redondeo",
    texto: "Antes de aplicar, te muestra cómo quedan todos los precios.",
    pasos: [
      "En Productos y stock tocá Actualizar precios.",
      "Elegí si es para todo el catálogo o una categoría, y el porcentaje (por ejemplo 8).",
      "Elegí el redondeo: a pesos, a $ 10 o a $ 100.",
      "Tocá Ver cómo quedan y, si está bien, aplicá.",
    ],
    consejo: "Para cambiar solo algunos: tildalos en la lista y tocá Cambiar precios.",
  },
  {
    id: "productos-masivo",
    titulo: "Cambiar varios productos de una vez",
    seccion: "Productos y stock",
    path: "/productos",
    permisos: ["productos.editar"],
    palabras: "edicion masiva varios muchos seleccionar categoria iva stock minimo estado",
    texto: "Tildá los productos en la lista. En la barra que aparece: Cambiar precios (por porcentaje) o Editar datos (categoría, IVA, stock mínimo o estado).",
  },
  {
    id: "stock-ingreso",
    titulo: "Cargar mercadería que entró (sumar stock)",
    seccion: "Productos y stock",
    path: "/productos",
    permisos: ["stock.movimientos"],
    palabras: "ingreso compra entrada mercaderia reponer sumar stock proveedor",
    texto: "Todo movimiento queda registrado con quién lo hizo y cuándo, en Movimientos.",
    pasos: ["Abrí el producto.", "Tocá Movimiento de stock.", "Elegí Ingreso, la cantidad y un comentario (por ejemplo, el número de factura del proveedor).", "Tocá Registrar."],
  },
  {
    id: "stock-conteo",
    titulo: "Corregir el stock después de contar",
    seccion: "Productos y stock",
    path: "/productos",
    permisos: ["stock.movimientos"],
    palabras: "ajuste conteo inventario fisico corregir stock diferencia",
    texto:
      "Abrí el producto y tocá Corregir stock: cargás lo que contaste y el sistema registra la diferencia como ajuste. Para muchos productos juntos, importá una planilla con las columnas Código y Stock (ver Importar y exportar).",
  },
  {
    id: "stock-bajo",
    titulo: "Saber qué hay que reponer (stock mínimo)",
    seccion: "Productos y stock",
    path: "/productos",
    permisos: ["productos.ver"],
    palabras: "stock bajo minimo faltante reponer agotado",
    texto: "Los productos por debajo del stock mínimo se resaltan en la lista, aparecen en Inicio y avisan en la campanita. El mínimo se define en cada producto.",
  },

  // ------------------------------------------------------------------ Empleados
  {
    id: "empleado-nuevo",
    titulo: "Cargar un empleado",
    seccion: "Empleados y sueldos",
    path: "/empleados",
    permisos: ["empleados.ver"],
    palabras: "empleado personal legajo alta cuil sueldo basico",
    texto: "Es una versión simple para ordenar los pagos al personal: no reemplaza la liquidación legal de tu contador.",
    pasos: ["Entrá a Empleados y sueldos.", "Tocá Nuevo empleado.", "Cargá nombre, CUIL, puesto, fecha de ingreso, sueldo básico y CBU o alias.", "Guardá."],
  },
  {
    id: "sueldo-pagar",
    titulo: "Pagar un sueldo o dar un adelanto",
    seccion: "Empleados y sueldos",
    path: "/empleados",
    permisos: ["empleados.ver"],
    palabras: "pagar sueldo adelanto vale aguinaldo bono horas extra presentismo recibo",
    texto: "Los adelantos del mes se descuentan solos del sueldo. Cada pago tiene su comprobante numerado para imprimir y firmar.",
    pasos: [
      "Abrí el empleado.",
      "Tocá Adelanto para darle plata a cuenta, o Pagar sueldo a fin de mes.",
      "En el sueldo el básico viene cargado: sumá extras o restá faltantes.",
      "Guardá e imprimí el comprobante.",
    ],
    consejo: "Si te equivocaste, anulá el pago (con el motivo) y cargalo de nuevo.",
  },
  {
    id: "vacaciones",
    titulo: "Vacaciones y licencias",
    seccion: "Empleados y sueldos",
    path: "/empleados",
    permisos: ["empleados.ver"],
    palabras: "vacaciones licencia dias enfermedad ausencia",
    texto:
      "En el empleado, tocá Vacaciones o licencia. El sistema muestra cuántos días le corresponden en el año según la antigüedad (14, 21, 28 o 35), cuántos tomó y cuántos le quedan.",
  },

  // ------------------------------------------------------------------ Reportes
  {
    id: "reportes",
    titulo: "Ver cuánto vendí (reporte de ventas)",
    seccion: "Reportes",
    path: "/reportes",
    permisos: ["reportes.ver"],
    palabras: "reporte ventas cuanto vendi periodo mes estadisticas por cliente por producto",
    texto: "En Reportes elegís el período y ves lo facturado, las notas de crédito, el neto, el IVA y el total, con gráfico, y las ventas por cliente y por producto.",
  },
  {
    id: "libro-iva",
    titulo: "Libro IVA Ventas para el contador",
    seccion: "Reportes",
    path: "/reportes",
    permisos: ["reportes.ver"],
    palabras: "libro iva contador ventas impuestos excel declaracion",
    texto: "En Reportes, elegí el período y abrí la pestaña Libro IVA Ventas. Con Exportar a Excel le mandás el archivo al contador.",
  },

  // ------------------------------------------------------------------ Importar y exportar
  {
    id: "importar",
    titulo: "Traer clientes o productos desde Excel",
    seccion: "Importar y exportar",
    path: "/importar-exportar",
    permisos: ["clientes.ver", "productos.ver"],
    palabras: "importar excel csv planilla migrar pasar datos otro sistema cargar muchos",
    texto:
      "Reconoce columnas de otros sistemas (\"Nombre\", \"CUIT/CUIL\", \"Mail\", \"SKU\", \"Existencia\"…). Antes de guardar muestra qué se crea, qué se actualiza y qué filas tienen errores, con el número de fila de Excel. Hasta 5.000 filas por archivo.",
    pasos: ["Entrá a Importar y exportar.", "Si querés, tocá Descargar plantilla para ver el formato.", "Tocá Importar clientes o Importar productos y elegí el archivo.", "Revisá la vista previa y confirmá."],
  },
  {
    id: "planilla-precios",
    titulo: "Actualizar precios o stock con una planilla",
    seccion: "Importar y exportar",
    path: "/importar-exportar",
    permisos: ["productos.editar"],
    palabras: "lista precios proveedor planilla stock inventario codigo excel",
    texto: "Una planilla con solo las columnas Código y Precio actualiza solo los precios. Con Código y Stock corrige el stock (queda como ajuste). Lo demás de cada producto no se toca.",
  },
  {
    id: "exportar",
    titulo: "Bajar mis datos a Excel",
    seccion: "Importar y exportar",
    path: "/importar-exportar",
    permisos: ["clientes.ver", "productos.ver"],
    palabras: "exportar descargar excel csv backup copia datos",
    texto: "En Importar y exportar tocá Exportar a Excel o Exportar a CSV. Ese mismo archivo se puede editar y volver a importar sin duplicar nada.",
  },

  // ------------------------------------------------------------------ Configuración
  {
    id: "empresa-datos",
    titulo: "Cambiar los datos de la empresa o el logo",
    seccion: "Configuración",
    path: "/configuracion?tab=empresa",
    permisos: ["configuracion"],
    palabras: "empresa datos razon social cuit logo domicilio ingresos brutos iva",
    texto: "En Configuración → Empresa. El logo sale en facturas, presupuestos y remitos.",
  },
  {
    id: "usuario-nuevo",
    titulo: "Crear un usuario para alguien del equipo",
    seccion: "Configuración",
    path: "/configuracion?tab=usuarios",
    permisos: [SOLO_ADMIN],
    palabras: "usuario empleado vendedor acceso crear invitar clave contraseña equipo",
    texto:
      "Cada persona tiene que tener su propio usuario: si dos entran con el mismo, se cierra la sesión del otro. Si llegaste al límite del plan, podés sumar un usuario en el momento.",
    pasos: ["Configuración → Usuarios.", "Tocá Nuevo usuario.", "Cargá nombre, email, rol y una contraseña inicial.", "Tocá Crear usuario y pasale los datos a la persona."],
  },
  {
    id: "roles",
    titulo: "Elegir qué puede hacer cada persona (roles y permisos)",
    seccion: "Configuración",
    path: "/configuracion?tab=roles",
    permisos: [SOLO_ADMIN],
    palabras: "rol roles permisos acceso restringir cajero vendedor deposito ver cargar anular",
    texto:
      "Vienen armados Administrador (todo), Ventas y Operaciones. Podés crear los tuyos con Nuevo rol, tildando qué puede ver, cargar o anular en cada sección, o duplicar uno y ajustarlo. Los cambios valen en el momento. Siempre queda al menos un administrador.",
  },
  {
    id: "usuario-suspender",
    titulo: "Quitarle el acceso a alguien",
    seccion: "Configuración",
    path: "/configuracion?tab=usuarios",
    permisos: [SOLO_ADMIN],
    palabras: "suspender bloquear quitar acceso usuario se fue despido",
    texto: "En Configuración → Usuarios, en el menú del usuario, tocá Suspender. No puede entrar más, pero todo lo que hizo queda registrado. El último administrador no se puede suspender.",
  },
  {
    id: "arca",
    titulo: "Conectar ARCA para facturar de verdad",
    seccion: "Configuración",
    path: "/configuracion?tab=arca",
    permisos: ["configuracion"],
    palabras: "arca afip certificado conectar factura electronica punto de venta produccion clave fiscal",
    texto: "Se hace una sola vez, paso a paso desde Configuración → Facturación ARCA.",
    pasos: [
      "Tocá Generar pedido (.csr) y descargá el archivo.",
      "En la web de ARCA, con tu clave fiscal, subilo en Administración de Certificados Digitales con el alias que te indica la pantalla, y bajá el certificado.",
      "Volvé a Prexacode, tocá Subir certificado y cargá tu punto de venta.",
      "Tocá Probar conexión y elegí Producción.",
    ],
    consejo: "Si se te complica, pedí ayuda en Soporte o pasáselo a tu contador.",
  },
  {
    id: "email-config",
    titulo: "Emails automáticos a los clientes",
    seccion: "Configuración",
    path: "/configuracion?tab=email",
    permisos: ["configuracion"],
    palabras: "email mail correo automatico enviar factura recordatorio vencimiento casilla smtp",
    texto:
      "En Configuración → Email elegís si los emails salen del servidor de Prexacode o de la casilla de tu empresa, y activás que la factura se mande sola al emitirla y los recordatorios de vencimiento (3 días antes y el día que vence). Las respuestas de los clientes te llegan a vos.",
  },
  {
    id: "whatsapp",
    titulo: "Enviar comprobantes por WhatsApp",
    seccion: "Configuración",
    path: "/configuracion?tab=whatsapp",
    permisos: ["configuracion"],
    palabras: "whatsapp wsp mensaje enviar celular",
    texto: "No hace falta configurar nada: en una factura o un presupuesto tocá Enviar → Enviar por WhatsApp y se abre el chat del cliente con el mensaje y el link ya escritos. En Configuración → WhatsApp está explicado cómo automatizarlo más adelante.",
  },

  // ------------------------------------------------------------------ Plan y pagos
  {
    id: "plan-pagar",
    titulo: "Pagar la suscripción",
    seccion: "Plan y pagos",
    path: "/configuracion?tab=plan",
    permisos: [SOLO_ADMIN],
    palabras: "pagar suscripcion abono mensual anual vencimiento plan precio sistema prexacode cuota",
    texto:
      "En Configuración → Plan y suscripción. Se paga en pesos al dólar oficial del día. Pagando el año se pagan 10 meses. Solo los administradores pueden pagar: los demás ven el aviso y se lo piden a un administrador.",
  },
  {
    id: "plan-cambiar",
    titulo: "Cambiar de plan o sumar usuarios",
    seccion: "Plan y pagos",
    path: "/configuracion?tab=plan",
    permisos: [SOLO_ADMIN],
    palabras: "cambiar plan subir bajar usuario adicional mas usuarios limite",
    texto:
      "En Configuración → Plan y suscripción. Subir de plan o sumar un usuario cobra solo la parte proporcional de los días que faltan. Bajar de plan queda para la próxima renovación, así no perdés lo pagado.",
  },
  {
    id: "solo-lectura",
    titulo: "¿Por qué no me deja cargar nada? (solo lectura)",
    seccion: "Plan y pagos",
    path: "/configuracion?tab=plan",
    permisos: [],
    palabras: "solo lectura bloqueado no deja cargar vencido prueba termino no puedo",
    texto:
      "Si la suscripción venció hace más de 7 días, el sistema queda en solo lectura: se ve y se exporta todo, pero no se carga nada. Se destraba en el momento en que un administrador paga. Tus datos no se pierden.",
  },
  {
    id: "no-veo",
    titulo: "No veo una sección o un botón",
    seccion: "Plan y pagos",
    path: "/",
    permisos: [],
    palabras: "no veo no aparece falta boton seccion permiso acceso no tengo",
    texto: "Cada persona ve lo que le permite su rol. Si necesitás algo que no ves, pedíselo a un administrador de tu empresa: lo cambia en Configuración → Roles y permisos.",
  },

  // ------------------------------------------------------------------ Tu cuenta
  {
    id: "clave",
    titulo: "Cambiar o recuperar la contraseña",
    seccion: "Tu cuenta",
    path: "/",
    permisos: [],
    palabras: "contraseña clave password olvide recuperar cambiar",
    texto:
      "Si te la olvidaste, en la pantalla de ingreso tocá ¿Olvidaste tu contraseña? y te llega un link por email (vence en 1 hora).",
  },
  {
    id: "tema",
    titulo: "Modo oscuro",
    seccion: "Tu cuenta",
    path: "/",
    permisos: [],
    palabras: "tema oscuro claro colores noche",
    texto: "En el menú de tu usuario (arriba a la derecha) → Tema: Claro, Oscuro o Según el sistema.",
  },
  {
    id: "sesion",
    titulo: "Me cerró la sesión solo",
    seccion: "Tu cuenta",
    path: "/",
    permisos: [],
    palabras: "sesion cerrada echo salio otro dispositivo compartir usuario",
    texto: "Cada usuario puede estar abierto en un solo dispositivo a la vez: si entrás desde otro lado (o alguien entra con tu usuario), la sesión anterior se cierra. Si pasa sin que vos entres en otro lado, cambiá la contraseña.",
  },
];

// ---------------------------------------------------------------- búsqueda

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Palabras que no ayudan a buscar ("cómo hago una factura" → "factura") */
const VACIAS = new Set(
  "como hago hacer hace puedo se que un una uno unos unas el la los las lo le les de del al a en con por para mi mis me y o es son esta hay quiero donde cual cuando".split(" "),
);

/** Raíz de la palabra: "facturas" encuentra "factura", "anulo" encuentra "anular", "cheques" encuentra "cheque" */
const raiz = (p: string) => (p.length <= 4 ? p : p.slice(0, Math.max(4, p.length - 2)));

export function buscarAyuda(consulta: string, articulos: Articulo[]): Articulo[] {
  const palabras = normalizar(consulta)
    .split(/[^a-z0-9ñ]+/)
    .filter((p) => p && !VACIAS.has(p))
    .map(raiz);
  if (!palabras.length) return [];
  const conPuntaje = articulos.map((a) => {
    const titulo = normalizar(a.titulo);
    const claves = normalizar(`${a.seccion} ${a.palabras}`);
    const cuerpo = normalizar(`${a.texto} ${(a.pasos ?? []).join(" ")} ${a.consejo ?? ""}`);
    let puntos = 0;
    let encontradas = 0;
    for (const p of palabras) {
      const t = titulo.includes(p) ? 3 : 0;
      const c = claves.includes(p) ? 2 : 0;
      const b = cuerpo.includes(p) ? 1 : 0;
      if (t || c || b) encontradas++;
      puntos += t + c + b;
    }
    return { a, puntos, encontradas };
  });
  // Primero los que tienen todas las palabras; si ninguno, los que tienen la mayoría
  const max = Math.max(...conPuntaje.map((x) => x.encontradas));
  if (max === 0) return [];
  const minimo = max === palabras.length ? max : Math.max(1, Math.ceil(palabras.length / 2));
  return conPuntaje
    .filter((x) => x.encontradas >= minimo)
    // A igual puntaje, el título más corto es el más específico ("Hacer una factura" antes que "Pasar un presupuesto a factura")
    .sort((x, y) => y.encontradas - x.encontradas || y.puntos - x.puntos || x.a.titulo.length - y.a.titulo.length)
    .map((x) => x.a);
}

/** Las ayudas de la pantalla donde está el usuario */
export function ayudasDePantalla(pathname: string, articulos: Articulo[]): Articulo[] {
  const base = pathname === "/" ? "/" : `/${pathname.split("/")[1]}`;
  return articulos.filter((a) => {
    const ruta = a.path.split("?")[0]!;
    return base === "/" ? ruta === "/" : ruta.startsWith(base);
  });
}
