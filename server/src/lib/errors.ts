import { ZodError, type ZodTypeAny, type z } from "zod";

/** Error con código HTTP y mensaje para mostrar al usuario */
export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public details?: Record<string, string>,
    /** Código estable para que el frontend reconozca el caso (ej. EDICION_CONCURRENTE) */
    public code?: string,
  ) {
    super(message);
  }
}

/** Otro usuario guardó el registro después de que lo abriste */
export const edicionConcurrente = (que: string) =>
  new HttpError(409, `Otro usuario modificó ${que} mientras lo editabas. Recargá para ver los cambios y volvé a intentar.`, undefined, "EDICION_CONCURRENTE");

export const badRequest = (msg: string, details?: Record<string, string>) => new HttpError(400, msg, details);
export const unauthorized = (msg = "Tenés que iniciar sesión") => new HttpError(401, msg);
export const forbidden = (msg = "No tenés permisos para esta acción") => new HttpError(403, msg);
export const notFound = (msg = "No encontrado") => new HttpError(404, msg);
export const conflict = (msg: string, details?: Record<string, string>) => new HttpError(409, msg, details);

/** Valida con zod y convierte los errores en un 400 con detalle por campo */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  try {
    return schema.parse(data);
  } catch (e) {
    if (e instanceof ZodError) {
      const details: Record<string, string> = {};
      for (const issue of e.issues) details[issue.path.join(".")] ??= issue.message;
      throw badRequest("Revisá los datos ingresados", details);
    }
    throw e;
  }
}

/** Postgres: el registro está referenciado por otro (23503 clave foránea, 23001 ON DELETE RESTRICT) */
export const esReferenciado = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  const codigo = err?.cause?.code ?? err?.code;
  return codigo === "23503" || codigo === "23001";
};
