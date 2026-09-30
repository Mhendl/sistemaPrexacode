# Prexacode — Guía de uso y de demostración

Prexacode es un sistema de gestión en la nube para PyMEs argentinas: **clientes, ventas, facturación electrónica ARCA, stock, cobranzas, agenda y reportes**, todo en un solo lugar. Se usa desde el navegador, en la compu, la tablet o el celular, sin instalar nada.

---

## 1. Antes de empezar: roles

Cada persona entra con **su propio usuario** (email y contraseña). Si alguien entra con el mismo usuario en otro dispositivo, la sesión anterior se cierra.

| Rol | Qué ve y qué hace |
|---|---|
| **Administrador** | Todo, incluida Configuración: datos de la empresa, usuarios, ARCA, plan y pagos |
| **Ventas** | Clientes, oportunidades, agenda, presupuestos, facturación, cobranzas y reportes. Ve productos y stock, pero no los modifica |
| **Operaciones** | Agenda, productos, stock, movimientos y remitos. No ve clientes ni facturación |
| **Roles propios** | El administrador crea los que necesite con casillas: por ejemplo "Cajero" (solo cobra) o "Encargado de depósito". También puede ajustar Ventas y Operaciones |

Puede haber varios administradores, y siempre queda al menos uno: el último no se puede suspender ni pasar a otro rol. Los cambios de permisos valen en el momento, sin volver a entrar.

---

## 2. Sección por sección

### Inicio
El tablero del día:
- **Ventas del mes**, comparadas con el mes anterior.
- **Por cobrar:** lo que deben los clientes.
- **Stock bajo el mínimo:** con la lista de qué reponer.
- **Remitos de hoy.**
- **Gráfico de ventas** de los últimos meses.
- **Últimos comprobantes** emitidos.
- **Agenda de hoy.**

> **Para mostrar:** es la primera pantalla después del login. Resume "cómo va el negocio" en 5 segundos.

### Clientes
- **Alta de clientes** con CUIT (se valida que sea real), condición de IVA, contacto, email, teléfono, domicilio y rubro.
- **Buscador** por nombre, CUIT o contacto, y **filtros** por condición de IVA y por estado (activo o inactivo).
- **Ficha del cliente:**
  - datos de contacto;
  - **cuenta corriente** (cuánto debe y qué facturas);
  - comprobantes, presupuestos y remitos;
  - **notas** (por ejemplo, "prefiere que lo llamen a la tarde"), que se pueden fijar arriba;
  - **productos que usa**, con cantidad y frecuencia.
- **Edición masiva:** tildar varios clientes (o "todos los de la lista") y cambiarles de una vez el rubro, la localidad o el estado.
- **Control de concurrencia:** si dos personas editan el mismo cliente a la vez, la segunda recibe un aviso en lugar de pisar el cambio.

> **Para mostrar:** abrir un cliente y señalar la cuenta corriente y las notas. Es "toda la historia del cliente en una pantalla".

### Oportunidades
El **embudo de ventas**, en columnas: *Nuevo → Contactado → Propuesta → Negociación → Ganada / Perdida*.
- Cada oportunidad lleva cliente (o un prospecto sin cargar), monto, fecha estimada de cierre y responsable.
- Se mueve de etapa con un clic. Al perderla se anota el motivo.
- Se vincula con presupuestos: cuando el presupuesto se factura, la oportunidad pasa a **Ganada** sola.
- Al asignarle un responsable, a esa persona le llega un aviso.

### Agenda
- Turnos, visitas o tareas **por recurso**: vendedores, técnicos, salas, boxes.
- Se adapta al rubro desde Configuración → Agenda: "Turno" y "Profesional" en un consultorio, "Visita" y "Técnico" en un servicio técnico.
- **Controla las superposiciones:** avisa si el recurso ya está ocupado a esa hora.
- Estados: pendiente, confirmado, realizado o cancelado.
- La persona asignada recibe un aviso cuando le agendan, mueven o cancelan algo.
- Vista del día y de la semana. Cada usuario nuevo aparece solo como recurso.

### Presupuestos
- Se arman con productos del catálogo o renglones libres, con bonificación por renglón.
- Numeración propia, fecha de validez y condiciones.
- Estados: **Pendiente → Aceptado / Rechazado → Facturado**. Si pasa la fecha de validez, figura como **Vencido**. También se pueden **duplicar**.
- **Facturar con un clic:** el presupuesto aceptado pasa a factura con todos sus datos.
- Se envían por email o WhatsApp con un **link** que el cliente abre sin usuario.

### Facturación (ARCA)
- **Facturas A, B y C, y notas de crédito**, electrónicas con CAE de ARCA.
  - La letra se elige sola según tu condición de IVA y la del cliente.
- Contado (con el medio de cobro, y el recibo se genera solo) o **cuenta corriente**.
- **Venta de mostrador:** "Consumidor final (sin identificar)" factura sin cargar al cliente ni pedir CUIT. Es de contado y cobrada en el momento; desde $ 10.000.000 ARCA pide identificar al comprador.
- **Descuenta el stock** de los productos. Una nota de crédito puede reingresarlo o no.
- La nota de crédito no puede superar el saldo de la factura: el sistema lo controla.
- Comprobante listo para **imprimir o enviar** por email o WhatsApp.
- **Modo pruebas / homologación:** se puede practicar sin facturar de verdad.

> **Para mostrar:** hacer una factura B a un consumidor final, de contado. Se ve el CAE y el comprobante listo en segundos.

### Cobranzas
- **Resumen de deuda por cliente**, con antigüedad: al día, de 1 a 30 días, de 31 a 60, de 61 a 90 y más de 90.
- **Registrar cobro:**
  - se eligen las facturas que paga y con qué: efectivo, transferencia, cheque, tarjeta de débito o crédito, Mercado Pago, retenciones u otro, y se pueden combinar;
  - admite **cobros parciales**;
  - lo que sobra queda **a favor del cliente**.
- Los recibos numerados se pueden anular, con motivo (por ejemplo, un cheque rechazado).
- Controla los dobles cobros: no se puede cobrar dos veces la misma factura.

### Remitos
- Entregas de mercadería: **al emitir se descuenta el stock y al anular se devuelve**.
- No deja emitir sin stock suficiente y marca qué renglón falla.
- Remito para imprimir en A4, con el logo de la empresa.

### Productos y stock
- Catálogo con código, descripción, categoría, unidad, **precio sin IVA**, alícuota de IVA, stock y **stock mínimo**.
- Los productos bajo el mínimo se resaltan y avisan. También hay servicios, que no llevan stock.
- **Movimientos:** ingresos (compras), egresos y **ajustes por conteo físico**. Todo queda en el historial, con quién lo hizo y cuándo.
- **Actualizar precios por porcentaje** a todo el catálogo o a una categoría, con redondeo a pesos, $ 10 o $ 100. Primero muestra cómo quedan.
- **Edición masiva:** tildar varios productos y cambiarles el precio (por porcentaje), la categoría, el IVA, el stock mínimo o el estado.

> **Para mostrar:** "Actualizar precios → 8 % → ver cómo quedan → aplicar". Con la inflación, esto lo valoran mucho.

### Reportes
- **Ventas del período:** facturado, notas de crédito, neto, IVA y total, con gráfico. Muestra también ventas **por cliente** y **por producto**.
- **Libro IVA Ventas**, listo para el contador.
- Todo se **exporta a Excel**.

### Importar y exportar
- **Importar clientes y productos** desde Excel (.xlsx, .xls) o CSV:
  - reconoce columnas de otros sistemas ("Nombre", "CUIT/CUIL", "Mail", "SKU", "Existencia"…);
  - antes de guardar muestra una **vista previa**: qué se crea, qué se actualiza y qué filas tienen errores (con el número de fila de Excel);
  - lee bien los CSV guardados por Excel en español (acentos y ñ);
  - hasta 5.000 filas por archivo.
- **Planillas parciales:**
  - un inventario con solo "Código" y "Stock" corrige el stock (queda registrado como ajuste);
  - una lista con "Código" y "Precio" actualiza solo los precios.
- **Exportar** a Excel o CSV. El archivo exportado se puede editar y volver a importar sin duplicar nada.
- **Plantilla** descargable con el formato y un ejemplo.

### Empleados y sueldos
Versión simple, para ordenar los pagos al personal. No reemplaza la liquidación legal del contador.
- **Legajo de cada empleado:** nombre, CUIL (se valida), puesto, fecha de ingreso, sueldo básico (mensual, quincenal, semanal o por hora), CBU o alias, obra social y notas.
- **Pagar sueldo:**
  - el básico viene precargado;
  - se suman horas extra, presentismo o bonos, y se restan faltantes;
  - **los adelantos del mes se descuentan solos**;
  - un solo sueldo por mes: si hay que corregirlo, se anula (con motivo) y se carga de nuevo.
- **Adelantos, aguinaldo** (sugiere la mitad del básico), **vacaciones, bonos**: cada pago con su **comprobante interno numerado** para imprimir y firmar.
- **Vacaciones y licencias:** muestra cuántos días le corresponden en el año según la antigüedad (14, 21, 28 o 35, como dice la ley), cuántos tomó y cuántos le quedan. No deja cargar dos novedades superpuestas.
- **Resumen:** empleados activos, total de sueldos por mes, lo pagado en el mes y los sueldos que falta pagar.
- **Baja:** queda en el historial con todos sus pagos, y se puede reactivar.
- Los sueldos son información sensible: los ve solo quien tiene el permiso "Empleados y sueldos" (por defecto, solo los administradores).

> **Para mostrar:** dar un adelanto y después pagar el sueldo: el adelanto aparece descontado solo.

### Centro de ayuda
- Botón **?** arriba de todo (o la tecla **F1**): abre la ayuda sin salir de la pantalla, con las preguntas de esa pantalla primero.
- **Buscador en palabras simples:** "anular una factura", "subir precios", "cheque rechazado", "cómo pago el sueldo"… Encuentra aunque se escriba sin tildes o en plural.
- Cada respuesta tiene los pasos con los nombres de los botones que se ven en pantalla, y un botón para ir directo a esa pantalla.
- Cada persona ve solo las ayudas de lo que su rol le permite hacer.
- Página completa en **Centro de ayuda** (menú Sistema), con todas las preguntas por sección.

### Soporte
- El cliente abre un **pedido de ayuda** (problema, consulta, facturación y pagos, sugerencia) y sigue la conversación con el equipo de Prexacode.
- Cuando se le responde, le llega un aviso en la campanita y por email.

### Emails automáticos
- **Bienvenida:** al registrarse, con los primeros pasos.
- **"¿Olvidaste tu contraseña?":** desde el login llega un link para elegir una nueva. Sirve una sola vez, vence en 1 hora y cierra las sesiones abiertas.
- **Avisos de la suscripción** a los administradores: la prueba gratis termina en 3 días, la suscripción vence en 5 días, venció, o quedó en solo lectura. Cada aviso llega una sola vez.
- **Factura al emitirla** (opcional, en Configuración → Email): sale sola al email del cliente.
- **Recordatorio de facturas** (opcional, en Configuración → Email): un email al cliente 3 días antes del vencimiento y otro cuando vence, con la factura y el saldo.
- Las respuestas de los clientes le llegan a la empresa, no a Prexacode.

### Campanita de avisos
Stock bajo o agotado, facturas por vencer o vencidas, cosas de la agenda, oportunidades asignadas y respuestas de soporte. Cada usuario elige qué avisos recibir en **Mis notificaciones**.

### Configuración
Usuarios, roles y plan: solo administradores. El resto (empresa, ARCA, email, WhatsApp, agenda) también lo ve quien tenga el permiso "Configuración".

| Pestaña | Para qué |
|---|---|
| **Empresa** | Razón social, CUIT, IVA, Ingresos Brutos, inicio de actividades, domicilio, **logo** (sale en los comprobantes) |
| **Usuarios** | Crear usuarios, asignar roles, suspender. Se ve cuántos usuarios usa del plan y se puede **sumar uno más** en el momento |
| **Roles y permisos** | Crear, editar, duplicar y borrar roles con una lista de casillas por sección (ver / cargar / anular). El rol Administrador no se toca |
| **Facturación ARCA** | Conectar ARCA paso a paso: generar el pedido de certificado, subir el certificado, puntos de venta, pasar de pruebas a producción |
| **Email** | Enviar desde el servidor de Prexacode o desde la casilla propia de la empresa |
| **WhatsApp** | Envío de comprobantes por WhatsApp |
| **Agenda** | Nombres ("Turno", "Visita"…), horarios, tipos de evento, recursos |
| **Plan y suscripción** | Plan actual, uso, pagar (Mercado Pago), cambiar de plan, historial de pagos, dar de baja |

---

## 2 bis. CoreDental (consultorios odontológicos)

El mismo sistema, con la marca, los colores y el menú de CoreDental. Se entra por **https://coredental.prexacode.com**: quien se registra desde ahí queda como consultorio. Comparte con Prexacode el registro, la prueba gratis, los planes (Consultorio, Clínica y Centro odontológico, a los mismos precios), el cobro por Mercado Pago, la facturación ARCA, presupuestos, cobranzas, sueldos y reportes.

| Rol | Qué ve y qué hace |
|---|---|
| **Administrador** | Todo |
| **Profesional** | Pacientes, historia clínica, odontograma, imágenes, turnos y presupuestos |
| **Recepción** | Pacientes (contacto y cobertura), turnos, cobros y facturación. **No ve la historia clínica** ni los antecedentes de salud |

### Pacientes
- Ficha con DNI, fecha de nacimiento (calcula la edad), contacto, **obra social, plan y número de afiliado**. Si la obra social no está en la lista, se agrega en el momento.
- **Antecedentes de salud:** alergias, medicación, enfermedades e intervenciones. Si tiene alergias, aparece un aviso rojo arriba de la ficha.
- Buscador por nombre y apellido en cualquier orden, DNI o teléfono, y filtro por obra social.
- Un paciente con historia clínica o turnos no se puede borrar (la ley obliga a conservarla): se pasa a inactivo.

### Historia clínica
- **Evoluciones** por consulta, con fecha, profesional y hora de carga. **No se modifican ni se borran** (Ley 26.529): un error se aclara con otra evolución.
- **Imágenes:** radiografías, fotos, estudios y PDF de hasta 8 MB. Solo las ve quien tiene permiso de historia clínica, y nunca quedan guardadas en el navegador.

### Odontograma
- Numeración FDI (11 a 48 y las temporarias 51 a 85), cada pieza con sus 5 caras.
- **Rojo:** lo que hay que hacer. **Azul:** lo realizado o lo que el paciente ya tenía.
- Símbolos: caras pintadas (caries, obturaciones, selladores), **cruz** (extracción), **círculo** (corona), **pieza gris** (ausente), letras (TC conducto, IMP implante, PR prótesis).
- Se marca una prestación en varias piezas a la vez. Lo pendiente pasa a "Realizado" con un clic. Lo cargado por error se **anula con el motivo** y queda en el historial.
- El nomenclador (prestaciones y códigos) viene cargado y cada consultorio lo puede ajustar.

### Turnos
- La agenda con **una columna por profesional**. El turno se da a un paciente: se lo busca por nombre, DNI o teléfono, y si es nuevo se lo da de alta en el momento (queda marcado "faltan datos").
- Estado **Ausente** cuando el paciente no viene: queda en su ficha y en el Inicio, y el horario queda libre.
- Desde la ficha del paciente, **Dar turno** abre la agenda con el paciente elegido.

### Inicio del consultorio
Turnos del día (cada profesional puede ver solo los suyos), pacientes activos y nuevos del mes, lo cobrado en el mes y lo que falta cobrar, y los ausentes del mes.

> **Próximamente en CoreDental:** precios por obra social en cada prestación, caja diaria, gastos, laboratorios, periodontograma, consentimientos firmados y portal del paciente.

---

## 3. Planes y cobro

| Plan | Precio | Usuarios | Puntos de venta |
|---|---|---|---|
| Básico | USD 45 / mes | 2 | 1 |
| Profesional | USD 89 / mes | 5 | 3 |
| Empresa | USD 169 / mes | 10 | ilimitados |
| Usuario adicional | USD 15 / mes | +1 | — |

- **Todos los planes incluyen todos los módulos.** Lo que cambia es la cantidad de usuarios y de puntos de venta.
- Se cobra **en pesos, al dólar oficial del Banco Central del día**, con Mercado Pago.
- **Pagando el año: 12 meses por el precio de 10.**
- **14 días de prueba gratis** sin tarjeta. Después hay 7 días de gracia en los que se puede seguir usando todo. Luego pasa a **solo lectura**: puede ver y exportar sus datos, pero no cargar nada, hasta que pague. Todo es automático.
- **Cambios de plan a mitad de mes:**
  - subir de plan o sumar un usuario cobra **solo la parte proporcional**;
  - bajar de plan queda para la próxima renovación, así no se pierde lo pagado.

---

## 4. Tu panel de administración (`/admin`)

Entrás con tu usuario del panel, separado de las empresas.

- **Resumen:** ingreso mensual en dólares, lo cobrado este mes y desde el inicio, cobros y altas por mes, empresas por plan y por estado, las que vencen pronto y los últimos pagos. Además, alertas de pedidos de soporte, de baja y de empresas vencidas.
- **Empresas:** buscador y filtros. De cada una ves los usuarios usados sobre el límite (y "¿compartido?" si alguien comparte usuario), cuándo vence, cuánto facturó y cuánto te pagó.
- **Ficha de la empresa:** su actividad de los últimos 12 meses, usuarios, pagos, aceptación de términos y pedidos de soporte. Acciones: **extender días**, **registrar un pago por transferencia**, **cambiar el plan**, **suspender o reactivar**.
- **Soporte:** los pedidos de ayuda. Los respondés desde ahí.
- **Pagos:** todos los cobros.
- **Baja y arrepentimiento:** pedidos que por ley hay que atender, con constancia.
- **Auditoría:** todo lo que se hizo desde el panel, quién lo hizo y cuándo.
- **Administradores:** sumar a otra persona y cambiar tu contraseña.

---

## 5. Guion de demostración (15 minutos)

1. **Inicio** (1 min): "Esto es lo primero que ves cada mañana."
2. **Clientes** (2 min): buscar uno y abrir la ficha. Mostrar la cuenta corriente, una nota y los productos que usa.
3. **Oportunidad → Presupuesto → Factura** (4 min):
   - crear una oportunidad y moverla a "Propuesta";
   - armar el presupuesto y enviarlo por WhatsApp (mostrar el link);
   - marcarlo aceptado y **facturarlo con un clic**: aparece el CAE;
   - volver al embudo: la oportunidad quedó **Ganada**.
4. **Stock** (2 min): el producto se descontó. Mostrar el historial y el aviso de stock bajo. **Actualizar precios 8 %.**
5. **Cobranzas** (2 min): registrar un cobro parcial y ver cómo baja la deuda.
6. **Reportes** (1 min): ventas del mes y Libro IVA. **Exportar a Excel.**
7. **Importar** (1 min): subir un Excel de clientes de "otro sistema" y ver la vista previa con errores.
8. **Celular** (1 min): abrir lo mismo en el teléfono.
9. **Cierre** (1 min): "14 días gratis, sin tarjeta; tus datos son tuyos y los exportás cuando quieras."

**Consejo:** prepará antes una empresa demo con 10 o 15 clientes, 20 productos y algunas facturas, para que las pantallas no se vean vacías.

---

## 6. Preguntas que te van a hacer

- **¿Mis datos están seguros?**
  - Cada empresa ve solo lo suyo.
  - Conexión cifrada (HTTPS) y copias de seguridad diarias.
  - Cada persona tiene su usuario, y queda registrado quién hizo cada cosa.
- **¿Puedo usarlo en el celular?** Sí, todas las pantallas están adaptadas.
- **¿Sirve para mi rubro?** Clientes, facturación, stock y cobranzas sirven para cualquiera. La agenda se adapta al vocabulario de cada rubro: turnos, visitas, reparaciones.
- **¿Qué necesito para facturar?**
  - Tu clave fiscal para generar el certificado en ARCA; el sistema te guía.
  - Mientras tanto podés practicar en modo pruebas.
- **¿Puedo traer mis datos de otro sistema?** Sí, desde Excel o CSV, con vista previa antes de guardar.
- **¿Y si dejo de pagar?** No se borra nada: queda en solo lectura, podés ver y exportar todo, y al pagar vuelve en el momento.
- **¿Me puedo dar de baja?** Sí, desde Configuración → Plan, o con el botón de baja. Queda un código de constancia.
- **¿Cuántos usuarios puedo tener?** Los de tu plan. Si necesitás uno más, lo sumás en el momento y pagás solo la parte proporcional del mes.
