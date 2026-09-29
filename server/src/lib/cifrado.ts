import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Cifrado simétrico AES-256-GCM para guardar secretos (contraseñas de SMTP, tokens de WhatsApp).
 * Formato: v1:<iv>:<tag>:<datos>, todo en base64url.
 */
export interface Cifrador {
  cifrar(texto: string): string;
  descifrar(cifrado: string): string;
}

export function crearCifrador(secreto: string): Cifrador {
  const clave = scryptSync(secreto, "prexacode-secretos", 32);
  return {
    cifrar(texto) {
      const iv = randomBytes(12);
      const c = createCipheriv("aes-256-gcm", clave, iv);
      const datos = Buffer.concat([c.update(texto, "utf8"), c.final()]);
      return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), datos.toString("base64url")].join(":");
    },
    descifrar(cifrado) {
      const [v, iv, tag, datos] = cifrado.split(":");
      if (v !== "v1" || !iv || !tag || datos === undefined) throw new Error("Formato de secreto inválido");
      const d = createDecipheriv("aes-256-gcm", clave, Buffer.from(iv, "base64url"));
      d.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([d.update(Buffer.from(datos, "base64url")), d.final()]).toString("utf8");
    },
  };
}
