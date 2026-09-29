import forge from "node-forge";

/**
 * Certificados para los web services de ARCA.
 *
 * ARCA pide un CSR con: C=AR, O=<razón social>, CN=<alias>, serialNumber=CUIT <cuit>.
 * Con el certificado que devuelve, se firma (CMS/PKCS#7) cada pedido de acceso a WSAA.
 */

export interface ClaveYCsr {
  clavePrivadaPem: string;
  csrPem: string;
}

/** Alias válido para ARCA: letras, números y guiones (máx. 40) */
export const aliasPara = (razonSocial: string) =>
  `prexacode-${razonSocial
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`.slice(0, 40);

export function generarClaveYCsr(o: { cuit: string; razonSocial: string; alias: string }): ClaveYCsr {
  const claves = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = claves.publicKey;
  csr.setSubject([
    { name: "countryName", value: "AR" },
    // ARCA no acepta caracteres fuera de ASCII en el pedido
    { name: "organizationName", value: o.razonSocial.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "").slice(0, 64) },
    { name: "commonName", value: o.alias },
    { type: "2.5.4.5", value: `CUIT ${o.cuit}` },
  ]);
  csr.sign(claves.privateKey, forge.md.sha256.create());
  return { clavePrivadaPem: forge.pki.privateKeyToPem(claves.privateKey), csrPem: forge.pki.certificationRequestToPem(csr) };
}

export interface DatosCertificado {
  desde: Date;
  vence: Date;
  sujeto: string;
  alias: string | null;
  cuit: string | null;
  emisor: string;
}

const attr = (attrs: forge.pki.CertificateField[], clave: string) => attrs.find((a) => a.shortName === clave || a.name === clave || a.type === clave)?.value as string | undefined;

/** Lee un certificado PEM (acepta también .crt con texto antes o después del bloque) */
export function leerCertificado(pem: string): DatosCertificado {
  const bloque = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/)?.[0];
  if (!bloque) throw new Error("El archivo no es un certificado (.crt / PEM)");
  const cert = forge.pki.certificateFromPem(bloque);
  const serial = attr(cert.subject.attributes, "2.5.4.5") ?? attr(cert.subject.attributes, "serialNumber");
  return {
    desde: cert.validity.notBefore,
    vence: cert.validity.notAfter,
    sujeto: cert.subject.attributes.map((a) => `${a.shortName ?? a.type}=${a.value}`).join(", "),
    alias: attr(cert.subject.attributes, "CN") ?? null,
    cuit: serial?.replace(/\D/g, "") || null,
    emisor: attr(cert.issuer.attributes, "CN") ?? attr(cert.issuer.attributes, "O") ?? "",
  };
}

/** El certificado corresponde a esta clave privada (misma clave pública) */
export function coincidenClaveYCertificado(certPem: string, clavePem: string): boolean {
  const bloque = certPem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/)?.[0];
  if (!bloque) return false;
  const pub = forge.pki.certificateFromPem(bloque).publicKey as forge.pki.rsa.PublicKey;
  const priv = forge.pki.privateKeyFromPem(clavePem) as forge.pki.rsa.PrivateKey;
  return pub.n.equals(priv.n) && pub.e.equals(priv.e);
}

/** Firma el pedido de acceso (TRA) en CMS con el contenido incluido, en base64, como pide WSAA */
export function firmarCms(contenido: string, certPem: string, clavePem: string): string {
  const bloque = certPem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/)![0];
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(contenido, "utf8");
  const cert = forge.pki.certificateFromPem(bloque);
  p7.addCertificate(cert);
  p7.addSigner({
    key: forge.pki.privateKeyFromPem(clavePem),
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256!,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType!, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest! },
      { type: forge.pki.oids.signingTime!, value: new Date() as unknown as string },
    ],
  });
  p7.sign();
  return forge.util.encode64(forge.asn1.toDer(p7.toAsn1()).getBytes());
}
