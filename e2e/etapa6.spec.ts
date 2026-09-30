import { expect, test, type APIRequestContext } from "@playwright/test";
import { cuitValido, emailUnico, entrarCon, PASSWORD, type Cuenta } from "./helpers";

/* Fechas locales "aaaa-mm-dd" */
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** El próximo día de la semana pedido (0 domingo … 6 sábado), a partir de la semana que viene */
function proximo(dia: number) {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  while (d.getDay() !== dia) d.setDate(d.getDate() + 1);
  return iso(d);
}

async function consultorio(request: APIRequestContext) {
  const email = emailUnico("dra");
  const res = await request.post("/api/auth/registro", {
    data: { empresa: { razonSocial: "Consultorio Sonrisas", cuit: cuitValido("20"), condicionIva: "Monotributista" }, usuario: { nombre: "Dra. Laura Pérez", email, password: PASSWORD }, aceptaTerminos: true, producto: "dental" },
  });
  expect(res.status(), await res.text()).toBe(201);
  const cuenta: Cuenta = { email, razonSocial: "", token: (await res.json()).token };
  const post = async (url: string, data: object = {}, token = cuenta.token) => {
    const r = await request.post(`/api${url}`, { headers: { authorization: `Bearer ${token}` }, data });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  };
  return { cuenta, post };
}

test("horarios por profesional, bloqueos y turnos libres en la agenda", async ({ page, request }) => {
  const c = await consultorio(request);
  await c.post("/pacientes", { nombre: "María", apellido: "González", dni: "28456789" });
  await entrarCon(page, c.cuenta);

  // Horarios de la Dra.: lunes a viernes de 9 a 13, turnos de 30 minutos
  await page.goto("/configuracion?tab=agenda");
  await page.getByRole("button", { name: "Horarios de Dra. Laura Pérez" }).click();
  await page.getByLabel("Atiende los lunes").check();
  await page.getByRole("button", { name: /Copiar a martes/ }).click();
  await page.getByLabel("Duración habitual del turno (minutos)").fill("30");
  await page.getByRole("button", { name: "Guardar horarios" }).click();
  await expect(page.getByText("Horarios de Dra. Laura Pérez guardados")).toBeVisible();
  await expect(page.getByTestId("resumen-horario").first()).toHaveText("Lun, Mar, Mié, Jue, Vie 09:00–13:00 · turnos de 30 min");

  // El sábado no atiende: avisa, y se puede agendar igual (sobreturno)
  const sabado = proximo(6);
  await page.goto(`/agenda?fecha=${sabado}`);
  await expect(page.getByTestId("fuera-de-horario").first()).toBeVisible();
  await page.getByRole("button", { name: /Agendar turno/ }).click();
  await expect(page.getByTestId("horarios-libres")).toContainText("No quedan horarios libres ese día (los sábados no atiende)");
  await page.getByPlaceholder("Buscar por nombre, DNI o teléfono…").fill("gonz");
  await page.getByRole("option", { name: /González, María/ }).click();
  await page.getByLabel("Desde").fill("10:00");
  await page.getByLabel("Hasta").fill("10:30");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByTestId("aviso-superposicion")).toContainText("Fuera de horario. Está fuera del horario de Dra. Laura Pérez: los sábados no atiende.");
  await page.getByRole("button", { name: "Agendar igual" }).click();
  await expect(page.getByText("Quedó agendado")).toBeVisible();

  // El lunes: se elige un horario libre con un toque
  const lunes = proximo(1);
  await page.goto(`/agenda?fecha=${lunes}`);
  await page.getByRole("button", { name: /Agendar turno/ }).click();
  await expect(page.getByTestId("horarios-libres")).toContainText("Horarios libres (los lunes atiende de 09:00 a 13:00)");
  await page.getByRole("button", { name: "Turno libre 09:30" }).click();
  await expect(page.getByLabel("Desde")).toHaveValue("09:30");
  await expect(page.getByLabel("Hasta")).toHaveValue("10:00");
  await page.getByPlaceholder("Buscar por nombre, DNI o teléfono…").fill("gonz");
  await page.getByRole("option", { name: /González, María/ }).click();
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Quedó agendado")).toBeVisible();

  // Congreso el lunes de 11 a 13: queda en la agenda y no deja dar turnos
  await page.getByRole("button", { name: "Bloquear horario" }).click();
  await page.getByLabel("Todo el día").click();
  await page.getByLabel("De", { exact: true }).fill("11:00");
  await page.getByLabel("A", { exact: true }).fill("13:00");
  await page.getByLabel("Motivo").fill("Congreso");
  await page.getByRole("button", { name: "Bloquear", exact: true }).click();
  await expect(page.getByText("Horario bloqueado", { exact: true })).toBeVisible();
  await expect(page.getByTestId("bloqueo-agenda")).toContainText("Congreso");

  await page.getByRole("button", { name: /Agendar turno/ }).click();
  await expect(page.getByRole("button", { name: "Turno libre 10:30" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Turno libre 11:30" })).toHaveCount(0);
  await page.getByPlaceholder("Buscar por nombre, DNI o teléfono…").fill("gonz");
  await page.getByRole("option", { name: /González, María/ }).click();
  await page.getByLabel("Desde").fill("11:30");
  await page.getByLabel("Hasta").fill("12:00");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByTestId("aviso-superposicion")).toContainText("Horario bloqueado. Dra. Laura Pérez tiene bloqueado");
  await expect(page.getByTestId("aviso-superposicion")).toContainText("Congreso");
  await page.keyboard.press("Escape");

  // Se quita el bloqueo
  await page.getByTestId("bloqueo-agenda").click();
  await page.getByRole("button", { name: "Quitar bloqueo" }).click();
  await expect(page.getByText("Bloqueo quitado")).toBeVisible();
  await expect(page.getByTestId("bloqueo-agenda")).toHaveCount(0);
});

test("honorarios por porcentaje: se carga el porcentaje, se calcula lo que le corresponde y se le paga", async ({ page, request }) => {
  const c = await consultorio(request);
  const email = emailUnico("odo");
  await c.post("/usuarios", { nombre: "Dr. Juan Gómez", email, password: PASSWORD, rol: "profesional" });
  const login = await request.post("/api/auth/login", { data: { email, password: PASSWORD } });
  const token = (await login.json()).token as string;
  const pac = await c.post("/pacientes", { nombre: "María", apellido: "González" });
  const prest = (await (await request.get("/api/prestaciones", { headers: { authorization: `Bearer ${c.cuenta.token}` } })).json()) as { id: string; codigo: string }[];
  const id = (cod: string) => prest.find((x) => x.codigo === cod)!.id;
  await c.post(`/pacientes/${pac.id}/cargos`, { prestacionId: id("01.01"), importePaciente: 20000 }, token);
  await c.post(`/pacientes/${pac.id}/cargos`, { prestacionId: id("02.08"), importePaciente: 80000 }, token);
  const lab = await c.post("/laboratorios", { nombre: "Lab Sur" });
  await c.post(`/laboratorios/${lab.id}/trabajos`, { descripcion: "Corona", importe: 30000 }, token);

  await entrarCon(page, c.cuenta);
  await page.goto("/");
  await page.getByRole("navigation").first().getByRole("link", { name: "Honorarios" }).click();
  const fila = page.getByTestId("fila-honorarios").filter({ hasText: "Dr. Juan Gómez" });
  await expect(fila).toContainText("Sin cargar");
  await expect(fila).toContainText("$ 100.000,00");

  // 40 % descontando el laboratorio: (100.000 − 30.000) × 40 % = 28.000
  await fila.getByRole("button", { name: "Porcentaje de Dr. Juan Gómez" }).click();
  await page.getByLabel("Porcentaje", { exact: true }).fill("40");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Porcentaje de Dr. Juan Gómez: 40 %")).toBeVisible();
  await expect(fila.getByTestId("saldo-honorarios")).toHaveText("$ 28.000,00");

  // Pago parcial
  await fila.getByRole("button", { name: "Pagar a Dr. Juan Gómez" }).click();
  await expect(page.getByLabel("Importe")).toHaveValue("28.000");
  await page.getByLabel("Importe").fill("10.000");
  await page.getByRole("button", { name: "Registrar pago" }).click();
  await expect(page.getByText("Pago a Dr. Juan Gómez registrado")).toBeVisible();
  await expect(fila.getByTestId("saldo-honorarios")).toHaveText("$ 18.000,00");

  // El detalle muestra cada prestación y el cálculo
  await fila.getByText("Dr. Juan Gómez").click();
  await expect(page.getByTestId("detalle-honorarios")).toContainText("González, María");
  await expect(page.getByTestId("detalle-honorarios")).toContainText("× 40 % = $ 28.000,00");
  await page.keyboard.press("Escape");

  // El pago quedó en Gastos
  await page.goto("/gastos");
  await expect(page.getByTestId("gasto")).toContainText("Honorarios de Dr. Juan Gómez");
});
