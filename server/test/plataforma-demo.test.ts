import { afterAll, beforeAll, expect, it } from "vitest";
import { enviarDePlataforma } from "../src/lib/email/plataforma.js";
import { carteroDePrueba, crearApp, type TestApp } from "./helpers.js";

let app: TestApp;
let cerrar: () => Promise<void>;
const correo = carteroDePrueba();
beforeAll(async () => {
  ({ app, cerrar } = await crearApp({ cartero: correo.cartero }));
});
afterAll(() => cerrar());

it("los avisos automáticos no se mandan a las cuentas demo (su casilla no existe: rebotarían desde nuestro dominio)", async () => {
  const aviso = { asunto: "Vas por la mitad de la prueba", saludo: "Hola", parrafos: ["¿Cómo viene?"] };
  expect(await enviarDePlataforma(app, { ...aviso, para: "demo.consultorio@prexacode.com" })).toBe(true);
  expect(await enviarDePlataforma(app, { ...aviso, para: "ana@ferreteria.com" })).toBe(true);
  expect(correo.enviados.map((e) => e.mensaje.para)).toEqual(["ana@ferreteria.com"]);
});
