import { expect, test, type Browser } from "@playwright/test";
import { cuitValido, elegir, emailUnico, entrarCon, loginUI, PASSWORD, type Cuenta } from "./helpers";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const otraPersona = async (browser: Browser) => (await browser.newContext()).newPage();

/**
 * Un día real de un consultorio, con tres personas y un paciente:
 * el paciente saca turno online con el Dr. Gómez → la recepción lo ve (sin acceso a la historia clínica) →
 * el profesional lo atiende, escribe la evolución y carga la consulta → la recepción cobra en efectivo, factura y cierra la caja →
 * la dueña ve el aviso del turno, carga el porcentaje del profesional y ve sus honorarios.
 */
test("CoreDental de punta a punta: turno online, recepción, atención, cobro, factura, caja y honorarios", async ({ page, request, browser }) => {
  // ---------------------------------------------------------------- el consultorio y su equipo
  const email = emailUnico("duena");
  const res = await request.post("/api/auth/registro", {
    data: { empresa: { razonSocial: `Consultorio Integral ${Date.now()}`, cuit: cuitValido("27"), condicionIva: "Monotributista" }, usuario: { nombre: "Dra. Laura Pérez", email, password: PASSWORD }, aceptaTerminos: true, producto: "dental" },
  });
  expect(res.status(), await res.text()).toBe(201);
  const duena: Cuenta = { email, razonSocial: "", token: (await res.json()).token };
  const h = { authorization: `Bearer ${duena.token}` };
  const post = async (url: string, data: object) => {
    const r = await request.post(`/api${url}`, { headers: h, data });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  };
  const put = async (url: string, data: object) => {
    const r = await request.put(`/api${url}`, { headers: h, data });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  };
  const emailGomez = emailUnico("gomez");
  const emailSofia = emailUnico("sofia");
  const gomez = await post("/usuarios", { nombre: "Dr. Juan Gómez", email: emailGomez, password: PASSWORD, rol: "profesional" });
  await post("/usuarios", { nombre: "Sofía Recepción", email: emailSofia, password: PASSWORD, rol: "recepcion" });

  // El Dr. Gómez atiende todos los días de 9 a 12, turnos de una hora; los turnos online están activos
  const cfg = await (await request.get("/api/agenda/config", { headers: h })).json();
  const recursoGomez = cfg.recursos.find((r: { usuarioId: string }) => r.usuarioId === gomez.id);
  expect(recursoGomez, "el profesional nuevo aparece solo en la agenda").toBeTruthy();
  await put(`/agenda/recursos/${recursoGomez.id}/horarios`, { horarios: [0, 1, 2, 3, 4, 5, 6].map((dia) => ({ dia, desde: "09:00", hasta: "12:00" })), duracionTurno: 60 });
  const conLink = await put("/agenda/config", { nombreEvento: cfg.nombreEvento, nombreRecurso: cfg.nombreRecurso, horaInicio: cfg.horaInicio, horaFin: cfg.horaFin, tiposEvento: cfg.tiposEvento, reservaOnline: true });

  // ---------------------------------------------------------------- 1. el paciente saca turno solo, desde el celular
  const paciente = await (await browser.newContext({ viewport: { width: 375, height: 800 } })).newPage();
  await paciente.goto(`/reservar/${conLink.reservaCodigo}`);
  // Solo el Dr. Gómez tiene horarios: queda elegido solo
  await paciente.getByRole("button", { name: /turnos? libres?$/ }).first().click();
  await paciente.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first().click();
  await expect(paciente.getByTestId("resumen-reserva")).toContainText("con Dr. Juan Gómez");
  await paciente.getByLabel("Nombre").fill("Carlos");
  await paciente.getByLabel("Apellido").fill("Rodríguez");
  await paciente.getByLabel("DNI").fill("30.123.456");
  await paciente.getByLabel("Celular").fill("11 5555-1234");
  await paciente.getByLabel("Acepto que el consultorio use mis datos para gestionar el turno").check();
  await paciente.getByRole("button", { name: "Reservar turno" }).click();
  await expect(paciente.getByTestId("turno-reservado")).toContainText("¡Listo! Tu turno quedó reservado");
  await paciente.close();

  const hasta = new Date();
  hasta.setDate(hasta.getDate() + 31);
  const [turno] = await (await request.get(`/api/agenda/eventos?desde=${iso(new Date())}&hasta=${iso(hasta)}`, { headers: h })).json();
  expect(turno).toMatchObject({ titulo: "Rodríguez, Carlos", tipo: "Turno online", recursoId: recursoGomez.id });
  const pacienteId = turno.pacienteId as string;

  // ---------------------------------------------------------------- 2. la recepción ve el turno, pero no la historia clínica
  const sofia = await otraPersona(browser);
  await loginUI(sofia, emailSofia);
  await expect(sofia.getByRole("heading", { name: /^Hola, / })).toBeVisible();
  await sofia.goto(`/agenda?fecha=${turno.fecha}`);
  await expect(sofia.getByTestId("evento-agenda").filter({ hasText: "Rodríguez, Carlos" })).toBeVisible();
  await sofia.goto(`/pacientes/${pacienteId}`);
  await expect(sofia.getByRole("heading", { name: "Rodríguez, Carlos" })).toBeVisible();
  await expect(sofia.getByRole("tab", { name: "Historia clínica" })).toHaveCount(0);
  await expect(sofia.getByRole("tab", { name: "Cuenta" })).toBeVisible();

  // ---------------------------------------------------------------- 3. el profesional lo atiende
  const drGomez = await otraPersona(browser);
  await loginUI(drGomez, emailGomez);
  await expect(drGomez.getByRole("heading", { name: /^Hola, / })).toBeVisible();
  await drGomez.goto(`/pacientes/${pacienteId}?tab=historia`);
  await drGomez.getByLabel("Nueva evolución").fill("Control general. Sin caries activas. Se indica limpieza en 6 meses.");
  await drGomez.getByRole("button", { name: "Guardar evolución" }).click();
  await expect(drGomez.getByTestId("evolucion")).toContainText("Dr. Juan Gómez");
  await drGomez.getByRole("tab", { name: "Cuenta" }).click();
  await drGomez.getByRole("button", { name: "Cargar prestación" }).click();
  await elegir(drGomez, "Prestación", "01.01 · Consulta y examen");
  await drGomez.getByLabel("A cargo del paciente").fill("20.000");
  await drGomez.getByRole("button", { name: "Cargar", exact: true }).click();
  await expect(drGomez.getByText("Prestación cargada a la cuenta")).toBeVisible();
  await expect(drGomez.getByTestId("saldo-paciente")).toHaveText("$ 20.000,00");

  // ---------------------------------------------------------------- 4. la recepción abre la caja, cobra, factura y cierra
  await sofia.goto("/caja");
  await sofia.getByLabel("Efectivo inicial").fill("5.000");
  await sofia.getByRole("button", { name: "Abrir caja" }).click();
  await expect(sofia.getByTestId("estado-caja")).toContainText("Caja abierta");
  await sofia.goto(`/pacientes/${pacienteId}?tab=cuenta`);
  await expect(sofia.getByTestId("saldo-paciente")).toHaveText("$ 20.000,00");
  await sofia.getByRole("button", { name: "Registrar pago" }).click();
  await sofia.getByLabel("Importe").fill("20.000");
  await sofia.getByRole("dialog").getByRole("button", { name: "Registrar pago" }).click();
  await expect(sofia.getByText(/Pago registrado · recibo N° 00000001/)).toBeVisible();
  await expect(sofia.getByTestId("saldo-paciente")).toHaveText("Al día");
  await sofia.getByTestId("pago").getByRole("button", { name: "Facturar" }).click();
  await expect(sofia.getByText("Factura C 0001-00000001 emitida")).toBeVisible();
  await sofia.goto("/caja");
  await expect(sofia.getByText("$ 25.000,00").first()).toBeVisible();
  await sofia.getByRole("button", { name: "Cerrar caja" }).click();
  await sofia.getByLabel("Efectivo contado").fill("25.000");
  await sofia.getByRole("dialog").getByRole("button", { name: "Cerrar caja" }).click();
  await expect(sofia.getByTestId("diferencia-caja")).toHaveText(/Cerró justo/);
  // Con la caja cerrada no se puede mover efectivo de ese día
  const tarde = await request.post(`/api/pacientes/${pacienteId}/pagos`, { headers: h, data: { importe: 1000, medio: "Efectivo" } });
  expect(tarde.status()).toBe(409);

  // ---------------------------------------------------------------- 5. la dueña: aviso del turno, factura y honorarios
  await entrarCon(page, duena);
  await page.goto("/");
  await page.getByRole("button", { name: /Notificaciones/ }).click();
  await expect(page.getByText("Nuevo turno online").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/facturacion");
  await expect(page.getByText("Rodríguez, Carlos").first()).toBeVisible();
  await page.goto("/honorarios");
  const fila = page.getByTestId("fila-honorarios").filter({ hasText: "Dr. Juan Gómez" });
  await expect(fila).toContainText("$ 20.000,00");
  await fila.getByRole("button", { name: "Porcentaje de Dr. Juan Gómez" }).click();
  await page.getByLabel("Porcentaje", { exact: true }).fill("40");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(fila.getByTestId("saldo-honorarios")).toHaveText("$ 8.000,00");
});
