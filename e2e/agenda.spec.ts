import { expect, test, type APIRequestContext } from "@playwright/test";
import { crearCuenta, cuitValido, elegir, emailUnico, entrarCon, loginUI, PASSWORD, type Cuenta } from "./helpers";

const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

async function cliente(request: APIRequestContext, cuenta: Cuenta, razonSocial: string) {
  const r = await request.post("/api/clientes", { headers: { authorization: `Bearer ${cuenta.token}` }, data: { razonSocial, cuit: cuitValido("27"), condicionIva: "Consumidor Final" } });
  return (await r.json()) as { id: string };
}

test.describe("Agenda", () => {
  test("se adapta al rubro, agenda turnos, avisa si se pisan y se cancelan", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    await cliente(request, cuenta, "Marta Gómez");
    await entrarCon(page, cuenta);

    // Plantilla de salud: turnos por profesional
    await page.goto("/configuracion?tab=agenda");
    await page.getByRole("button", { name: /Salud \/ estética/ }).click();
    await expect(page.getByLabel("Cada evento se llama")).toHaveValue("Turno");
    await page.getByLabel("Nuevo tipo").fill("Sobreturno");
    await page.getByLabel("Nuevo tipo").press("Enter");
    await expect(page.getByTestId("tipos-evento")).toContainText("Sobreturno");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByText("Agenda actualizada")).toBeVisible();

    // Un segundo profesional
    await page.getByRole("button", { name: "Agregar profesional" }).click();
    await page.getByTestId("fila-recurso").first().getByLabel("Nombre").fill("Dra. López");
    await page.getByTestId("fila-recurso").first().getByRole("button", { name: "Agregar" }).click();
    await expect(page.getByText("Dra. López agregado")).toBeVisible();
    await expect(page.getByTestId("fila-recurso")).toHaveCount(2);

    // Agendar con el botón
    await page.goto("/agenda");
    await expect(page.getByRole("button", { name: "Dra. López" })).toBeVisible();
    await page.getByRole("button", { name: "Agendar turno" }).click();
    await page.getByLabel("Título").fill("Control anual");
    await elegir(page, "Profesional", "Dra. López");
    await elegir(page, "Cliente", "Marta Gómez");
    await page.getByLabel("Desde").fill("10:00");
    await expect(page.getByLabel("Hasta")).toHaveValue("11:00"); // conserva la duración
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Quedó agendado")).toBeVisible();
    const control = page.getByRole("button", { name: /^Control anual, 10:00 a 11:00, Dra\. López/ });
    await expect(control).toBeVisible();

    // Otro turno que se pisa con el mismo profesional: avisa y se puede agendar igual
    await page.getByRole("button", { name: "Agendar turno" }).click();
    await page.getByLabel("Título").fill("Urgencia");
    await elegir(page, "Profesional", "Dra. López");
    await page.getByLabel("Desde").fill("10:30");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByTestId("aviso-superposicion")).toContainText('Dra. López ya tiene "Control anual" de 10:00 a 11:00');
    await page.getByRole("button", { name: "Agendar igual" }).click();
    await expect(page.getByRole("button", { name: /^Urgencia, 10:30 a 11:30/ })).toBeVisible();

    // Filtrar por profesional oculta sus turnos
    await page.getByRole("button", { name: "Dra. López", exact: true }).click();
    await expect(page.getByTestId("evento-agenda")).toHaveCount(0);
    await page.getByRole("button", { name: "Dra. López", exact: true }).click();
    await expect(page.getByTestId("evento-agenda")).toHaveCount(2);

    // Clic en un hueco libre: abre el alta con ese horario (desde las 08:00, 56 px por hora → 14:00)
    await page.locator(`[data-testid="columna-dia"][data-fecha="${hoy()}"]`).click({ position: { x: 10, y: 56 * 6 + 10 } });
    await expect(page.getByLabel("Desde")).toHaveValue("14:00");
    await expect(page.getByLabel("Fecha")).toHaveValue(hoy());
    await page.getByRole("button", { name: "Cerrar" }).click();

    // Editar: cancelar el turno
    await control.click();
    await expect(page.getByLabel("Título")).toHaveValue("Control anual");
    await elegir(page, "Estado", "Cancelado");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByRole("button", { name: /^Control anual, 10:00 a 11:00, Dra\. López, Cancelado/ })).toBeVisible();

    // Eliminar la urgencia
    await page.getByRole("button", { name: /^Urgencia/ }).click();
    await page.getByRole("button", { name: "Eliminar" }).click();
    await page.getByRole("button", { name: "Sí, eliminar" }).click();
    await expect(page.getByRole("button", { name: /^Urgencia/ })).toHaveCount(0);

    // Navegar semanas
    const titulo = await page.getByTestId("agenda-titulo").textContent();
    await page.getByRole("button", { name: "Siguiente" }).click();
    await expect(page.getByTestId("agenda-titulo")).not.toHaveText(titulo!);
    await expect(page.getByTestId("evento-agenda")).toHaveCount(0);
    await page.getByRole("button", { name: "Hoy" }).click();
    await expect(page.getByTestId("evento-agenda")).toHaveCount(1);
  });

  test("al técnico le llega el aviso, lo abre desde la campanita y lo ve en su inicio", async ({ page, request }) => {
    const cuenta = await crearCuenta(request);
    const h = { authorization: `Bearer ${cuenta.token}` };
    const email = emailUnico("tecnico");
    await request.post("/api/usuarios", { headers: h, data: { nombre: "Tomás Técnico", email, rol: "operaciones", password: PASSWORD } });
    await cliente(request, cuenta, "Hotel Sierra");
    await entrarCon(page, cuenta);

    // El admin le agenda una visita desde la ficha del cliente
    await page.goto("/clientes");
    await page.getByRole("cell", { name: /Hotel Sierra/ }).click();
    await expect(page.getByTestId("agenda-cliente")).toContainText("No tiene nada agendado");
    await page.getByRole("button", { name: "Agendar visita" }).click();
    await page.getByLabel("Título").fill("Revisión de cámaras");
    await elegir(page, "Responsable", "Tomás Técnico");
    await page.getByLabel("Desde").fill("23:00");
    await page.getByLabel("Hasta").fill("23:45");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByTestId("agenda-cliente")).toContainText("Revisión de cámaras");
    await expect(page.getByTestId("agenda-cliente")).toContainText("Tomás Técnico");

    // El técnico entra: aviso en la campanita que lleva al evento
    await page.evaluate(() => localStorage.clear());
    await loginUI(page, email);
    await expect(page.getByTestId("agenda-hoy")).toContainText("Revisión de cámaras");
    await expect(page.getByTestId("agenda-hoy")).toContainText("1 tuyo");
    await expect(page.getByTestId("notificaciones-contador")).toHaveText("1");
    await page.getByRole("button", { name: /Notificaciones/ }).click();
    await expect(page.getByTestId("notificacion").first()).toContainText("Te agendaron algo nuevo");
    await page.getByTestId("notificacion").first().click();
    await expect(page).toHaveURL(/\/agenda/);
    await expect(page.getByLabel("Título")).toHaveValue("Revisión de cámaras");
    // El horario fuera de la franja configurada igual se ve (la grilla se amplía)
    await page.getByRole("button", { name: "Cerrar" }).click();
    await expect(page.getByRole("button", { name: /^Revisión de cámaras, 23:00 a 23:45/ })).toBeVisible();
    // Operaciones no ve "Personalizar"
    await expect(page.getByRole("link", { name: "Personalizar", exact: true })).toHaveCount(0);
  });
});
