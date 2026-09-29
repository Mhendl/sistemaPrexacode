/** Email simple y compatible con cualquier cliente de correo (tablas + estilos en línea) */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface Contenido {
  empresa: string;
  saludo: string;
  /** Párrafos de texto plano (se escapan) */
  parrafos: string[];
  boton?: { texto: string; url: string };
  pie?: string;
}

export function armarEmail(c: Contenido) {
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#f4f4f7;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#1f2330">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;overflow:hidden">
<tr><td style="background:#4338ca;color:#ffffff;padding:18px 24px;font-size:18px;font-weight:600">${esc(c.empresa)}</td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.55">
<p style="margin:0 0 14px">${esc(c.saludo)}</p>
${c.parrafos.map((p) => `<p style="margin:0 0 14px;white-space:pre-line">${esc(p)}</p>`).join("\n")}
${c.boton ? `<p style="margin:22px 0"><a href="${esc(c.boton.url)}" style="display:inline-block;background:#4338ca;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:7px;font-weight:600">${esc(c.boton.texto)}</a></p>
<p style="margin:0;font-size:12px;color:#6b7080">Si el botón no funciona, copiá este link: <br><span style="word-break:break-all">${esc(c.boton.url)}</span></p>` : ""}
</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #ececf1;font-size:11px;color:#8a8fa0">${esc(c.pie ?? "Enviado con Prexacode")}</td></tr>
</table></td></tr></table></body></html>`;
  const texto = [c.saludo, "", ...c.parrafos.flatMap((p) => [p, ""]), ...(c.boton ? [`${c.boton.texto}: ${c.boton.url}`, ""] : []), `— ${c.empresa}`].join("\n");
  return { html, texto };
}
