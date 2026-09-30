import { expect, test } from "@playwright/test";
import { cuitValido, emailUnico, entrarCon, PASSWORD, type Cuenta } from "./helpers";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

test("turnos online: el consultorio activa el link y un paciente reserva solo, desde el celular", async ({ page, request, browser }) => {
  const email = emailUnico("dra");
  const res = await request.post("/api/auth/registro", {
    data: { empresa: { razonSocial: "Consultorio Sonrisas", cuit: cuitValido("20"), condicionIva: "Monotributista" }, usuario: { nombre: "Dra. Laura Pérez", email, password: PASSWORD }, aceptaTerminos: true, producto: "dental" },
  });
  expect(res.status()).toBe(201);
  const cuenta: Cuenta = { email, razonSocial: "", token: (await res.json()).token };
  const h = { authorization: `Bearer ${cuenta.token}` };
  const cfg = await (await request.get("/api/agenda/config", { headers: h })).json();
  const dra = cfg.recursos[0];
  // Atiende todos los días de 9 a 12, turnos de una hora
  const horarios = [0, 1, 2, 3, 4, 5, 6].map((dia) => ({ dia, desde: "09:00", hasta: "12:00" }));
  expect((await request.put(`/api/agenda/recursos/${dra.id}/horarios`, { headers: h, data: { horarios, duracionTurno: 60 } })).ok()).toBe(true);

  // El consultorio activa los turnos online y obtiene su link
  await entrarCon(page, cuenta);
  await page.goto("/configuracion?tab=agenda");
  await page.getByLabel("Activar turnos online").click();
  await page.getByLabel("Mensaje para el paciente (opcional)").fill("Traé tu credencial");
  await page.getByRole("button", { name: "Guardar turnos online" }).click();
  await expect(page.getByText("Turnos online activados")).toBeVisible();
  await expect(page.getByLabel("Dra. Laura Pérez da turnos online")).toBeChecked();
  const link = (await page.getByTestId("link-turnos-online").textContent())!;
  expect(link).toMatch(/\/reservar\/[0-9a-f]{12}$/);

  // Un paciente, sin usuario y desde el celular, saca su turno
  const paciente = await browser.newPage({ viewport: { width: 375, height: 800 } });
  await paciente.goto(new URL(link).pathname);
  await expect(paciente.getByRole("heading", { name: "Consultorio Sonrisas" })).toBeVisible();
  await expect(paciente.getByText("Sacá tu turno online")).toBeVisible();
  await paciente.getByRole("button", { name: /turnos? libres?$/ }).first().click();
  await paciente.getByRole("button", { name: /^\d{2}:\d{2}$/ }).first().click();
  await expect(paciente.getByTestId("resumen-reserva")).toContainText("con Dra. Laura Pérez");
  await paciente.getByLabel("Nombre").fill("Carlos");
  await paciente.getByLabel("Apellido").fill("Rodríguez");
  await paciente.getByLabel("DNI").fill("30.123.456");
  await paciente.getByLabel("Celular").fill("11 5555-1234");
  await paciente.getByLabel("Motivo de la consulta (opcional)").fill("Me duele una muela");
  await expect(paciente.getByRole("button", { name: "Reservar turno" })).toBeDisabled();
  await paciente.getByLabel("Acepto que el consultorio use mis datos para gestionar el turno").check();
  await paciente.getByRole("button", { name: "Reservar turno" }).click();
  await expect(paciente.getByTestId("turno-reservado")).toContainText("¡Listo! Tu turno quedó reservado");
  await expect(paciente.getByTestId("turno-reservado")).toContainText("Traé tu credencial");
  expect(await paciente.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  // Desde el link del turno lo puede confirmar
  await paciente.getByRole("link", { name: "Ver, confirmar o cancelar mi turno" }).click();
  await paciente.getByRole("button", { name: "Confirmo que voy" }).click();
  await expect(paciente.getByTestId("turno-estado")).toContainText("Tu turno está confirmado");
  await paciente.close();

  // En la agenda del consultorio aparece el turno, con el paciente para completar sus datos
  const hoy = new Date();
  const hasta = new Date();
  hasta.setDate(hasta.getDate() + 31);
  const eventos = await (await request.get(`/api/agenda/eventos?desde=${iso(hoy)}&hasta=${iso(hasta)}`, { headers: h })).json();
  expect(eventos).toHaveLength(1);
  expect(eventos[0]).toMatchObject({ titulo: "Rodríguez, Carlos", tipo: "Turno online", estado: "Confirmado", reservadoOnline: true });
  await page.goto(`/agenda?fecha=${eventos[0].fecha}`);
  await expect(page.getByTestId("evento-agenda")).toContainText("Rodríguez, Carlos");
  await page.goto("/pacientes");
  await expect(page.getByText("Rodríguez, Carlos")).toBeVisible();
});
