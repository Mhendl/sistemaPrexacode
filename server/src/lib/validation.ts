import { z } from "zod";
import { esCuitValido, soloDigitos } from "./cuit.js";
import { ROLES } from "./auth.js";

export const CONDICIONES_IVA = ["Responsable Inscripto", "Monotributista", "Exento", "Consumidor Final"] as const;

/** CUIT válido con dígito verificador; se guarda solo con dígitos */
export const cuitSchema = z
  .string({ required_error: "El CUIT es obligatorio" })
  .transform(soloDigitos)
  .refine(esCuitValido, "El CUIT no es válido");

const textoOpcional = z
  .string()
  .trim()
  .max(300)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

export const emailSchema = z.string().trim().toLowerCase().email("Email inválido");

export const passwordSchema = z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(200);

export const rolSchema = z.enum(ROLES, { errorMap: () => ({ message: "Rol inválido" }) });

export const condicionIvaSchema = z.enum(CONDICIONES_IVA, { errorMap: () => ({ message: "Condición de IVA inválida" }) });

export const clienteInputSchema = z.object({
  razonSocial: z.string().trim().min(2, "La razón social es obligatoria").max(200),
  cuit: cuitSchema,
  condicionIva: condicionIvaSchema,
  contacto: textoOpcional,
  email: z
    .union([emailSchema, z.literal(""), z.null()])
    .optional()
    .transform((v) => (v ? v : null)),
  telefono: textoOpcional,
  domicilio: textoOpcional,
  localidad: textoOpcional,
  rubro: textoOpcional,
  notas: z
    .string()
    .max(2000)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  estado: z.enum(["Activo", "Inactivo"]).optional(),
});

/** Topes: por encima no hay negocio real, y evitan desbordar los números de la base */
export const MAX_CANTIDAD = 10_000_000;
export const MAX_IMPORTE = 99_999_999_999;
export const MAX_TOTAL = 99_999_999_999;

/** aaaa-mm-dd que exista en el calendario (nada de 31/02) y con un año razonable */
export function fechaValida(v: string) {
  const [a, m, d] = v.split("-").map(Number) as [number, number, number];
  const f = new Date(Date.UTC(a, m - 1, d));
  return a >= 1900 && a <= 2100 && f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

/** Versión que tenía el registro cuando el usuario lo abrió (opcional: si no viene, no se controla) */
export const versionSchema = z.object({ version: z.number().int().positive().max(2_000_000_000).optional() });
