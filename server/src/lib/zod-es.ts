import { z } from "zod";

/** Mensajes en español para los errores genéricos de validación (los específicos se definen en cada schema) */
z.setErrorMap((issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      if (issue.received === "undefined" || issue.received === "null") return { message: "Es obligatorio" };
      if (issue.expected === "boolean") return { message: "Tiene que ser Sí o No" };
      if (issue.expected === "number") return { message: "Tiene que ser un número" };
      if (issue.expected === "string") return { message: "Tiene que ser un texto" };
      return { message: "Valor inválido" };
    case z.ZodIssueCode.invalid_enum_value:
      return { message: `Valor inválido. Opciones: ${issue.options.join(", ")}` };
    case z.ZodIssueCode.too_small:
      return { message: issue.type === "string" ? `Mínimo ${issue.minimum} caracteres` : `Tiene que ser al menos ${issue.minimum}` };
    case z.ZodIssueCode.too_big:
      return { message: issue.type === "string" ? `Máximo ${issue.maximum} caracteres` : `Tiene que ser como máximo ${issue.maximum}` };
    default:
      return { message: ctx.defaultError };
  }
});
