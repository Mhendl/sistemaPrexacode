/**
 * Términos y Condiciones y Política de Privacidad de Prexacode.
 *
 * ⚠️ Modelo redactado para el uso previsto (software de gestión por suscripción para empresas en Argentina).
 * DEBE revisarlo un abogado antes de usarlo con clientes reales. Ningún texto evita que alguien inicie un
 * reclamo: lo que hace es fijar reglas claras para defenderse si ocurre.
 *
 * Los datos del proveedor y los plazos están en src/config/legal.ts.
 * Al modificar estos textos, actualizar TERMINOS_VERSION en server/src/lib/legal.ts.
 */
import { MARCAS, type ProductoId } from "@/config/brand";
import { condiciones as c, proveedor as pr } from "@/config/legal";

export interface Seccion {
  titulo: string;
  parrafos: string[];
}

/** Términos de cada producto: la base es la misma; CoreDental suma lo propio de los datos de salud */
export function terminosDe(producto: ProductoId): Seccion[] {
  const P = MARCAS[producto].nombre;
  const dental = producto === "dental";
  const secciones: Seccion[] = [
  {
    titulo: "1. Partes y aceptación",
    parrafos: [
      `${P} es un servicio de software de gestión en la nube (el "Servicio") provisto por ${pr.razonSocial}, CUIT ${pr.cuit}, con domicilio legal en ${pr.domicilio} (el "Proveedor").`,
      `Quien crea una cuenta lo hace en nombre de una empresa, comercio o profesional (el "Cliente") y declara tener facultades suficientes para obligarlo. Al marcar la casilla de aceptación y crear la cuenta, el Cliente acepta estos Términos y Condiciones y la Política de Privacidad. Si no está de acuerdo, no debe usar el Servicio.`,
      `El Servicio está destinado al uso en la actividad comercial o profesional del Cliente, como herramienta de gestión de su propio negocio. El Cliente declara que lo contrata con ese fin.`,
      `El registro de la aceptación (usuario, fecha, hora, dirección IP y versión de estos Términos) queda guardado y es prueba suficiente de la aceptación.`,
    ],
  },
  {
    titulo: "2. Qué es el Servicio",
    parrafos: [
      dental
        ? `El Servicio permite, entre otras funciones, gestionar pacientes, historia clínica, odontograma, turnos, obras sociales y prestaciones, presupuestos, cobros, caja, sueldos del equipo, reportes, envío de documentos y emisión de comprobantes electrónicos a través de los servicios web de ARCA. Las funciones disponibles son las que se ven en el sistema en cada momento.`
        : `El Servicio permite, entre otras funciones, gestionar clientes, oportunidades, agenda, productos y stock, presupuestos, remitos, cobranzas, reportes, envío de documentos y emisión de comprobantes electrónicos a través de los servicios web de ARCA. Las funciones disponibles son las que se ven en el sistema en cada momento.`,
      `El Proveedor puede mejorar, modificar o discontinuar funciones. Si un cambio elimina una función esencial de lo contratado, lo avisará con ${c.diasAvisoCambios} días de anticipación y el Cliente podrá dar de baja el Servicio sin cargo por el período no utilizado.`,
      dental
        ? `El Servicio es una herramienta tecnológica de registro y organización. No es un dispositivo médico, no realiza diagnósticos ni indica tratamientos, y no reemplaza el criterio clínico del profesional. El Proveedor no presta servicios odontológicos, médicos, contables, impositivos, legales ni de asesoramiento de ningún tipo.`
        : `El Servicio es una herramienta tecnológica. El Proveedor no presta servicios contables, impositivos, legales ni de asesoramiento de ningún tipo.`,
    ],
  },
  {
    titulo: "3. Disponibilidad",
    parrafos: [
      `El Proveedor hace esfuerzos razonables para que el Servicio esté disponible de forma continua, pero no garantiza que funcione sin interrupciones, demoras ni errores. Puede haber interrupciones por mantenimiento (que se procurará hacer en horarios de bajo uso), actualizaciones, fallas de proveedores de infraestructura, de internet o de servicios de terceros, ataques informáticos o causas de fuerza mayor.`,
      `Las interrupciones del Servicio no dan derecho a indemnización. Si una interrupción atribuible al Proveedor impidiera el uso del Servicio por más de 72 horas corridas, el Cliente podrá pedir que se extienda su período pago por el mismo tiempo.`,
    ],
  },
  {
    titulo: "4. Cuentas y usuarios",
    parrafos: [
      `El Cliente debe cargar datos verdaderos y mantenerlos actualizados. Es responsable de los usuarios que crea, de los permisos que les asigna, de dar de baja a quienes ya no deban tener acceso, de la confidencialidad de las contraseñas y de todo lo que se haga con sus cuentas.`,
      `Si el Cliente sospecha un acceso no autorizado debe cambiar las contraseñas y avisar al Proveedor de inmediato.`,
    ],
  },
  {
    titulo: "5. Prueba gratis",
    parrafos: [
      `Las cuentas nuevas tienen una prueba gratis de ${c.diasPrueba} días. Al terminar, para seguir cargando información hay que contratar un plan. La prueba no genera ninguna obligación de pago.`,
    ],
  },
  {
    titulo: "6. Planes, precios y pagos",
    parrafos: [
      `El Servicio se contrata por períodos (mensuales o anuales) que se pagan por adelantado según el plan y la cantidad de usuarios adicionales elegidos. Los límites de cada plan (usuarios, puntos de venta, etc.) son los que se informan en el sistema al momento de pagar.`,
      `Los precios se expresan en dólares estadounidenses como referencia y se cobran en pesos argentinos al tipo de cambio oficial que se informa al momento del pago. Los precios pueden incluir o no impuestos según se indique.`,
      `El Proveedor puede modificar los precios con ${c.diasAvisoCambios} días de aviso previo. El nuevo precio se aplica a partir del siguiente período; el período ya pagado no se modifica.`,
      `Los pagos se procesan a través de terceros (por ejemplo, Mercado Pago). El Proveedor no almacena datos de tarjetas y no es responsable por fallas, demoras, rechazos o contracargos del procesador de pagos.`,
      `Los importes pagados no son reembolsables, salvo lo previsto en la cláusula 17 (arrepentimiento) o cuando la ley lo exija.`,
    ],
  },
  {
    titulo: "7. Falta de pago",
    parrafos: [
      `Si el período pago (o la prueba) vence y no se renueva, el Cliente tendrá ${c.diasGracia} días de gracia durante los cuales el Servicio sigue funcionando normalmente.`,
      `Pasada la gracia, la cuenta queda en "modo solo lectura": el Cliente puede ingresar, consultar y exportar toda su información, pero no puede cargar ni modificar datos ni emitir comprobantes hasta regularizar el pago. Al pagar, el acceso completo se restablece de inmediato.`,
      `Si pasados ${c.diasHastaBajaPorFaltaDePago} días desde el vencimiento el Cliente no regulariza el pago, el Proveedor podrá dar de baja la cuenta y eliminar los datos, previo aviso por email con al menos 15 días de anticipación para que el Cliente pueda exportarlos.`,
      `El Cliente reconoce que estas restricciones son la consecuencia pactada de la falta de pago, que se aplican de forma automática y que no constituyen un incumplimiento del Proveedor ni dan derecho a reclamo o indemnización alguna. Durante todo ese plazo el Cliente conserva la posibilidad de consultar y exportar su información.`,
    ],
  },
  {
    titulo: "8. Responsabilidad del Cliente sobre su información y sus obligaciones",
    parrafos: [
      `El Cliente es el único responsable de los datos que carga, de las operaciones que registra, de los precios, impuestos y condiciones que aplica, y de los comprobantes que emite o envía a través del Servicio, así como del cumplimiento de sus obligaciones fiscales, impositivas, previsionales, laborales, comerciales y de defensa del consumidor frente a sus propios clientes.`,
      `El Cliente debe revisar cada comprobante antes de emitirlo y consultar con su contador cualquier duda fiscal. La configuración fiscal (condición frente al IVA, puntos de venta, alícuotas, datos de sus clientes) la define el Cliente.`,
      `El Cliente es responsable de contar con autorización para cargar los datos personales de sus propios clientes, proveedores y contactos, y de usarlos conforme a la Ley 25.326 de Protección de Datos Personales. También es responsable de los mensajes que envía a través del Servicio (email, WhatsApp u otros) y de contar con el consentimiento de los destinatarios cuando corresponda.`,
    ],
  },
  ...(dental
    ? [
        {
          titulo: "8 bis. Datos de salud e historia clínica",
          parrafos: [
            `Los datos de salud de los pacientes (historia clínica, odontograma, antecedentes, imágenes, consentimientos) son datos sensibles según la Ley 25.326. El Cliente (consultorio, clínica o profesional) es el responsable de esos datos y de su tratamiento: debe contar con las autorizaciones y consentimientos que la ley exige, informar a sus pacientes y usarlos solo para la atención y la administración del consultorio.`,
            `La historia clínica es del paciente y su custodia corresponde al Cliente, conforme a la Ley 26.529 de Derechos del Paciente. En particular, el Cliente es responsable de su contenido, de identificar a los profesionales que hacen cada registro, de no alterar registros ya hechos y de conservarla por el plazo mínimo que fija la ley (diez años desde la última atención), aun después de dar de baja el Servicio: para eso debe exportarla antes de que venza el plazo de conservación del Proveedor.`,
            `El Cliente es responsable de que cada usuario acceda solo a la información que necesita para su tarea (por ejemplo, la secretaría a turnos y cobros; los profesionales a la historia clínica), usando los roles y permisos del Servicio.`,
            `El Proveedor trata esos datos solo como encargado, para prestar el Servicio, con confidencialidad y medidas de seguridad reforzadas, y no los usa para ningún otro fin.`,
          ],
        },
      ]
    : []),
  {
    titulo: "9. Facturación electrónica y certificado digital",
    parrafos: [
      `La emisión de comprobantes electrónicos se realiza con el CUIT, el certificado digital y los puntos de venta del Cliente ante ARCA (ex AFIP). El Cliente autoriza al Proveedor a guardar su certificado y su clave privada de forma cifrada y a usarlos exclusivamente para emitir los comprobantes que el propio Cliente ordena desde el Servicio y para consultar la información necesaria para hacerlo.`,
      `El Cliente puede revocar esa autorización en cualquier momento desde ARCA (Administrador de Relaciones) o eliminando el certificado del Servicio.`,
      `El Proveedor no es responsable por: el contenido de los comprobantes; los rechazos, observaciones, demoras o caídas de los servicios de ARCA; los cambios normativos o técnicos que ARCA disponga (que el Proveedor procurará incorporar en un plazo razonable); ni por multas, intereses, recargos o sanciones que se apliquen al Cliente.`,
      `Mientras la cuenta esté en modo de prueba de facturación (simulador u homologación), los comprobantes no tienen validez fiscal y así lo indican.`,
    ],
  },
  {
    titulo: "10. Servicios de terceros",
    parrafos: [
      `El Servicio se integra con servicios de terceros (ARCA, Mercado Pago, proveedores de correo electrónico, WhatsApp, servicios de cotización, alojamiento en la nube, entre otros). Su funcionamiento, disponibilidad, costos y condiciones dependen de esos terceros, y el Proveedor no es responsable por sus fallas, cambios o interrupciones.`,
      `Si el Cliente configura su propia casilla de correo u otros servicios propios, es responsable de esas cuentas y de sus credenciales.`,
    ],
  },
  {
    titulo: "11. Uso permitido",
    parrafos: [
      `No se puede usar el Servicio para actividades ilegales o fraudulentas, para emitir comprobantes falsos o por operaciones inexistentes, para cargar contenido que infrinja derechos de terceros, para enviar mensajes no solicitados (spam), para intentar acceder a información de otras empresas, para vulnerar la seguridad del sistema, para sobrecargarlo deliberadamente ni para copiar o revender el Servicio.`,
      `Ante un uso indebido, el Proveedor puede suspender la cuenta de inmediato, sin perjuicio de las acciones legales que correspondan. En ese caso el Cliente no tendrá derecho a reintegro.`,
    ],
  },
  {
    titulo: "12. Datos del Cliente, confidencialidad y copias de seguridad",
    parrafos: [
      `La información que carga el Cliente le pertenece. El Proveedor la trata en forma confidencial, solo para prestar el Servicio, y no la vende ni la cede a terceros, salvo a los proveedores necesarios para operar el Servicio o por requerimiento de autoridad competente.`,
      `El Cliente puede exportar su información en todo momento, incluso en modo solo lectura.`,
      `El Proveedor realiza copias de seguridad periódicas. Aun así, el Cliente debe conservar sus propias copias de la información importante (los comprobantes electrónicos, además, quedan registrados en ARCA). El Proveedor no es responsable por pérdidas de información causadas por el propio Cliente o sus usuarios, o por causas ajenas a su control razonable.`,
    ],
  },
  {
    titulo: "13. Propiedad intelectual",
    parrafos: [
      `El software, el diseño, la marca ${P} y los demás elementos del Servicio son propiedad del Proveedor. Mientras la suscripción esté vigente, el Cliente recibe una licencia de uso no exclusiva, intransferible y revocable. No se puede copiar, modificar, descompilar ni hacer ingeniería inversa del Servicio.`,
    ],
  },
  {
    titulo: "14. Exclusión de garantías",
    parrafos: [
      `El Servicio se presta "tal como está" y "según disponibilidad". Salvo lo expresamente indicado en estos Términos, el Proveedor no garantiza que el Servicio sea adecuado para un fin particular del Cliente, que cumpla todas sus expectativas ni que esté libre de errores.`,
    ],
  },
  {
    titulo: "15. Limitación de responsabilidad",
    parrafos: [
      `En la máxima medida permitida por la ley, el Proveedor no será responsable por daños indirectos, lucro cesante, pérdida de ganancias, de clientes, de oportunidades comerciales o de información, ni por multas, recargos, intereses o sanciones impuestas al Cliente, cualquiera sea su causa.`,
      `En todos los casos, la responsabilidad total del Proveedor frente al Cliente, por todos los conceptos, se limita al monto efectivamente pagado por el Cliente por el Servicio durante los ${c.mesesTopeResponsabilidad} meses anteriores al hecho que origine el reclamo.`,
      `Estas limitaciones no se aplican en caso de dolo del Proveedor.`,
    ],
  },
  {
    titulo: "16. Indemnidad",
    parrafos: [
      `El Cliente mantendrá indemne al Proveedor frente a cualquier reclamo, multa, sanción o demanda de terceros (incluidos sus propios clientes, empleados, proveedores y organismos públicos) originados en la información que el Cliente carga, en los comprobantes o mensajes que emite o envía, en el incumplimiento de sus obligaciones legales o de estos Términos, o en el uso que sus usuarios hagan del Servicio, incluyendo los gastos y honorarios razonables de defensa.`,
    ],
  },
  {
    titulo: "17. Arrepentimiento",
    parrafos: [
      `Si el Cliente reviste el carácter de consumidor según la Ley 24.240, puede revocar la contratación dentro de los ${c.diasArrepentimiento} días corridos contados desde la contratación o el pago, sin costo ni necesidad de indicar el motivo, usando el "Botón de arrepentimiento" disponible en el sitio. En ese caso se reintegrará lo pagado por ese período por el mismo medio de pago.`,
    ],
  },
  {
    titulo: "18. Baja",
    parrafos: [
      `El Cliente puede dar de baja el Servicio en cualquier momento, sin costo, desde Configuración → Plan o usando el "Botón de baja" disponible en el sitio. Se le entregará un código de constancia de la solicitud.`,
      `La baja tiene efecto al finalizar el período ya pagado (salvo el supuesto de arrepentimiento). No se reintegran importes de períodos en curso.`,
      `Después de la baja, el Proveedor conservará la información durante ${c.diasConservacionTrasBaja} días para que el Cliente pueda exportarla, y luego podrá eliminarla definitivamente, salvo que una ley exija conservarla por más tiempo.${dental ? " La obligación de conservar la historia clínica es del Cliente: debe exportarla dentro de ese plazo." : ""}`,
      `El Proveedor puede dar de baja el Servicio con ${c.diasAvisoCambios} días de aviso, reintegrando la parte no utilizada del período pago, o de inmediato en los casos de uso indebido de la cláusula 11 o de falta de pago de la cláusula 7.`,
    ],
  },
  {
    titulo: "19. Fuerza mayor",
    parrafos: [
      `Ninguna de las partes será responsable por incumplimientos causados por hechos fuera de su control razonable, como catástrofes, cortes generalizados de energía o de telecomunicaciones, fallas masivas de proveedores de infraestructura, ataques informáticos, medidas de autoridad o cambios normativos.`,
    ],
  },
  {
    titulo: "20. Cambios en estos Términos",
    parrafos: [
      `El Proveedor puede modificar estos Términos avisando con al menos ${c.diasAvisoCambios} días de anticipación por email o dentro del Servicio. Para seguir usando el Servicio, un administrador del Cliente deberá aceptar la nueva versión. Si el Cliente no está de acuerdo, puede darlo de baja sin penalidad antes de que los cambios entren en vigencia.`,
    ],
  },
  {
    titulo: "21. Comunicaciones",
    parrafos: [
      `Las comunicaciones al Cliente se harán al email de los administradores registrados o mediante avisos dentro del Servicio, y se tendrán por válidas desde su envío. El Cliente debe mantener actualizados esos emails. Las comunicaciones al Proveedor deben enviarse a ${pr.email}.`,
    ],
  },
  {
    titulo: "22. Varios",
    parrafos: [
      `El Cliente no puede ceder su cuenta sin autorización del Proveedor. El Proveedor puede ceder el contrato a un sucesor en el negocio, avisándolo al Cliente.`,
      `Si alguna cláusula fuera declarada inválida, las demás seguirán vigentes. Que el Proveedor no ejerza un derecho no implica que renuncie a él.`,
    ],
  },
  {
    titulo: "23. Ley aplicable y jurisdicción",
    parrafos: [
      `Estos Términos se rigen por las leyes de la República Argentina. Para cualquier controversia, las partes se someten a los tribunales ordinarios de ${pr.jurisdiccion}, con renuncia a cualquier otro fuero o jurisdicción, salvo que una norma de orden público disponga otra cosa.`,
      `Antes de iniciar cualquier reclamo, las partes se comprometen a intentar resolverlo de buena fe escribiendo a ${pr.email}.`,
    ],
  },
  ];
  return secciones;
}

export function privacidadDe(producto: ProductoId): Seccion[] {
  const P = MARCAS[producto].nombre;
  const dental = producto === "dental";
  return [
  {
    titulo: "1. Responsable y alcance",
    parrafos: [
      `${pr.razonSocial}, CUIT ${pr.cuit}, con domicilio en ${pr.domicilio} (el "Proveedor"), es responsable del tratamiento de los datos de las personas que se registran y usan ${P} (usuarios) y de los datos de las empresas clientes necesarios para prestar y cobrar el servicio.`,
      dental
        ? `Respecto de los datos que cada consultorio carga sobre sus pacientes (incluidos los datos de salud, que son datos sensibles), el responsable es ese consultorio, y el Proveedor actúa como encargado del tratamiento: los procesa solo para prestar el Servicio, según sus instrucciones, con confidencialidad y sin usarlos para otros fines.`
        : `Respecto de los datos que cada empresa cliente carga sobre sus propios clientes, proveedores y contactos, el responsable es esa empresa, y el Proveedor actúa como encargado del tratamiento: los procesa solo para prestar el Servicio, según sus instrucciones, con confidencialidad y sin usarlos para otros fines.`,
    ],
  },
  {
    titulo: "2. Qué datos tratamos",
    parrafos: [
      `Datos de la empresa (razón social, CUIT, domicilio, condición frente al IVA, logo), datos de los usuarios (nombre, email, rol, contraseña cifrada), datos de facturación de la suscripción, registros técnicos (fecha y hora de acceso, dirección IP, navegador), registros de aceptación de estos textos, y la información que la empresa carga en el sistema.`,
      `No tratamos datos de tarjetas: los pagos los procesa el medio de pago (por ejemplo, Mercado Pago).`,
    ],
  },
  {
    titulo: "3. Para qué los usamos",
    parrafos: [
      `Para prestar el Servicio, identificar a los usuarios y controlar sus permisos, brindar soporte, cobrar la suscripción, enviar avisos relacionados con la cuenta, prevenir fraudes y usos indebidos, cumplir obligaciones legales, y mejorar la seguridad y el funcionamiento del sistema. No vendemos ni alquilamos datos.`,
    ],
  },
  {
    titulo: "4. Con quién los compartimos",
    parrafos: [
      `Con proveedores que nos ayudan a operar el Servicio (alojamiento en la nube, copias de seguridad, envío de emails, mensajería, medios de pago, cotización de moneda), bajo obligaciones de confidencialidad; con ARCA cuando la empresa emite comprobantes; y con autoridades ante un requerimiento legal válido.`,
      `Algunos de estos proveedores pueden alojar o procesar datos fuera de la Argentina. En esos casos se procura que ofrezcan niveles adecuados de protección, conforme a la normativa vigente.`,
    ],
  },
  {
    titulo: "5. Seguridad",
    parrafos: [
      `Aplicamos medidas técnicas y organizativas razonables: contraseñas cifradas, conexiones seguras, cifrado de credenciales y certificados guardados, separación de los datos de cada empresa, control de accesos por rol, registros de actividad y copias de seguridad periódicas. Ningún sistema es 100 % seguro; ante un incidente que afecte datos personales, avisaremos a los afectados y a la autoridad cuando corresponda.`,
    ],
  },
  {
    titulo: "6. Cookies y almacenamiento local",
    parrafos: [
      `Usamos el almacenamiento local del navegador para mantener la sesión iniciada y recordar preferencias (por ejemplo, el tema claro u oscuro).`,
      `En las páginas públicas (el sitio, el ingreso y el registro) podemos usar herramientas de medición de terceros, como Google Analytics o el píxel de Meta, para saber cómo llegan las visitas y cuántas terminan creando una cuenta. Dentro del sistema no se usan, y nunca reciben la información que cargás.`,
    ],
  },
  {
    titulo: "7. Conservación",
    parrafos: [
      `Conservamos los datos mientras la cuenta esté activa y, después de la baja, durante el plazo indicado en los Términos y Condiciones o el que exija la ley. Los registros de aceptación y de pagos se conservan el tiempo necesario para acreditar el cumplimiento de obligaciones legales.`,
    ],
  },
  {
    titulo: "8. Tus derechos",
    parrafos: [
      `El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un interés legítimo al efecto, conforme lo establecido en el artículo 14, inciso 3 de la Ley N° 25.326. También puede solicitar su rectificación, actualización o supresión escribiendo a ${pr.email}.`,
      dental
        ? `Si sos paciente de un consultorio que usa ${P}, los datos de tu historia clínica los administra ese consultorio: para acceder a ellos, pedir una copia o rectificarlos, dirigite al consultorio, que es el responsable (Ley 26.529).`
        : `Si los datos fueron cargados por una empresa cliente (por ejemplo, sos cliente de una empresa que usa ${P}), te recomendamos dirigirte primero a esa empresa, que es la responsable de esos datos.`,
      `La AGENCIA DE ACCESO A LA INFORMACIÓN PÚBLICA, en su carácter de Órgano de Control de la Ley N° 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.`,
    ],
  },
  {
    titulo: "9. Cambios",
    parrafos: [`Podemos actualizar esta política. Los cambios importantes se informarán con anticipación por email o dentro del Servicio.`],
  },
  ];
}
