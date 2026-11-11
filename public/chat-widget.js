/*
 * Chat de las páginas de Prexacode y CoreDental: un globito abajo a la derecha para hacer preguntas sin registrarse.
 * Uso: <script src="https://sistema.prexacode.com/chat-widget.js" data-producto="gestion|dental" defer></script>
 */
(function () {
  var script = document.currentScript;
  if (!script || window.__chatPrexa) return;
  window.__chatPrexa = true;
  var producto = script.getAttribute("data-producto") === "dental" ? "dental" : "gestion";
  var API = new URL(script.src).origin + "/api/publico/chat";
  var color = producto === "dental" ? "#0e8fae" : "#4f46e5";
  var CLAVE = "chat-prexa-" + producto;
  var token = null;
  try { token = localStorage.getItem(CLAVE); } catch (e) {}
  var email = null, abierto = false, vistos = 0, reloj = null, enviando = false;

  var css = document.createElement("style");
  css.textContent =
    ".cpx-boton{position:fixed;right:18px;bottom:18px;z-index:2147483000;width:58px;height:58px;border-radius:50%;border:0;cursor:pointer;background:" + color + ";color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center}" +
    ".cpx-boton svg{width:28px;height:28px}.cpx-punto{position:absolute;top:2px;right:2px;width:14px;height:14px;border-radius:50%;background:#ef4444;border:2px solid #fff;display:none}" +
    ".cpx-caja{position:fixed;right:18px;bottom:88px;z-index:2147483000;width:360px;max-width:calc(100vw - 24px);height:520px;max-height:calc(100vh - 110px);background:#fff;color:#111827;border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.28);display:none;flex-direction:column;overflow:hidden;font:14px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}" +
    ".cpx-cab{background:" + color + ";color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between}.cpx-cab b{font-size:15px}.cpx-cab small{display:block;opacity:.85;font-size:12px}" +
    ".cpx-x{background:transparent;border:0;color:#fff;font-size:22px;cursor:pointer;line-height:1;padding:0 4px}" +
    ".cpx-lista{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px;background:#f8fafc}" +
    ".cpx-m{max-width:85%;padding:9px 12px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word}.cpx-ellos{align-self:flex-start;background:#fff;border:1px solid #e5e7eb;border-bottom-left-radius:4px}.cpx-yo{align-self:flex-end;background:" + color + ";color:#fff;border-bottom-right-radius:4px}" +
    ".cpx-m a{color:inherit;text-decoration:underline}.cpx-quien{font-size:11px;color:#6b7280;margin:0 0 2px 2px}" +
    ".cpx-chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 10px;background:#f8fafc}.cpx-chip{border:1px solid " + color + ";color:" + color + ";background:#fff;border-radius:999px;padding:6px 11px;font:inherit;font-size:13px;cursor:pointer}" +
    ".cpx-pie{border-top:1px solid #e5e7eb;padding:10px;display:flex;gap:8px;background:#fff}.cpx-pie textarea,.cpx-mail input{flex:1;border:1px solid #d1d5db;border-radius:10px;padding:9px 10px;font:inherit;color:#111827;background:#fff;resize:none;outline:none}" +
    ".cpx-enviar{border:0;border-radius:10px;background:" + color + ";color:#fff;padding:0 14px;font:inherit;font-weight:600;cursor:pointer}.cpx-enviar:disabled{opacity:.5}" +
    ".cpx-mail{display:none;gap:8px;padding:8px 10px;border-top:1px solid #e5e7eb;background:#fffbeb}.cpx-mail span{font-size:12px;color:#92400e;align-self:center}" +
    "@media (max-width:480px){.cpx-caja{right:12px;bottom:84px}.cpx-boton{right:12px;bottom:12px}}";
  document.head.appendChild(css);

  function el(tag, clase, texto) { var e = document.createElement(tag); if (clase) e.className = clase; if (texto != null) e.textContent = texto; return e; }
  var boton = el("button", "cpx-boton");
  boton.type = "button";
  boton.setAttribute("aria-label", "Abrir el chat");
  boton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.7-.8L3 21l1.9-5.3A8.4 8.4 0 1 1 21 11.5z"/></svg><span class="cpx-punto"></span>';
  var caja = el("div", "cpx-caja");
  caja.setAttribute("role", "dialog");
  caja.setAttribute("aria-label", "Chat");
  var cab = el("div", "cpx-cab");
  var tit = el("div");
  tit.appendChild(el("b", null, producto === "dental" ? "CoreDental" : "Prexacode"));
  tit.appendChild(el("small", null, "Preguntá lo que quieras"));
  var cerrar = el("button", "cpx-x", "×");
  cerrar.type = "button";
  cerrar.setAttribute("aria-label", "Cerrar el chat");
  cab.appendChild(tit); cab.appendChild(cerrar);
  var lista = el("div", "cpx-lista");
  lista.setAttribute("aria-live", "polite");
  var chips = el("div", "cpx-chips");
  var mail = el("form", "cpx-mail");
  var mailInput = el("input");
  mailInput.type = "email"; mailInput.placeholder = "Tu email (para responderte ahí)"; mailInput.setAttribute("aria-label", "Tu email");
  var mailOk = el("button", "cpx-enviar", "Guardar");
  mailOk.type = "submit"; mailOk.style.padding = "8px 12px";
  mail.appendChild(mailInput); mail.appendChild(mailOk);
  var pie = el("form", "cpx-pie");
  var campo = el("textarea");
  campo.rows = 1; campo.placeholder = "Escribí tu consulta…"; campo.maxLength = 1000; campo.setAttribute("aria-label", "Tu consulta");
  var enviar = el("button", "cpx-enviar", "Enviar");
  enviar.type = "submit";
  pie.appendChild(campo); pie.appendChild(enviar);
  caja.appendChild(cab); caja.appendChild(lista); caja.appendChild(chips); caja.appendChild(mail); caja.appendChild(pie);
  document.body.appendChild(caja); document.body.appendChild(boton);

  function burbuja(m) {
    var b = el("div", "cpx-m " + (m.de === "visitante" ? "cpx-yo" : "cpx-ellos"));
    // Texto plano; solo los links se hacen clicables
    String(m.texto).split(/(https?:\/\/[^\s]+)/).forEach(function (parte) {
      if (/^https?:\/\//.test(parte)) { var a = el("a", null, parte); a.href = parte; a.target = "_blank"; a.rel = "noopener"; b.appendChild(a); }
      else b.appendChild(document.createTextNode(parte));
    });
    return b;
  }
  function pintar(mensajes) {
    lista.innerHTML = "";
    lista.appendChild(burbuja({ de: "auto", texto: "¡Hola! ¿En qué te ayudo? Elegí una pregunta o escribí la tuya." }));
    mensajes.forEach(function (m) { lista.appendChild(burbuja(m)); });
    lista.scrollTop = lista.scrollHeight;
    var deEllos = mensajes.filter(function (m) { return m.de !== "visitante"; }).length;
    if (!abierto && deEllos > vistos) boton.querySelector(".cpx-punto").style.display = "block";
    if (abierto) vistos = deEllos;
    // El pedido de email aparece cuando hay una pregunta esperando a una persona
    var espera = mensajes.some(function (m) { return m.de === "auto" && /dejanos tu email/.test(m.texto); });
    mail.style.display = espera && !email ? "flex" : "none";
  }
  function pedir(metodo, ruta, cuerpo) {
    return fetch(API + ruta, { method: metodo, headers: cuerpo ? { "content-type": "application/json" } : undefined, body: cuerpo ? JSON.stringify(cuerpo) : undefined }).then(function (r) {
      return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || "No se pudo enviar"); return d; });
    });
  }
  function recibir(d) {
    token = d.token; email = d.email;
    try { localStorage.setItem(CLAVE, token); } catch (e) {}
    pintar(d.mensajes);
  }
  function mandar(texto) {
    texto = String(texto || "").trim();
    if (!texto || enviando) return;
    enviando = true; enviar.disabled = true;
    pedir("POST", "/", { producto: producto, texto: texto, token: token, origen: location.href.slice(0, 500) })
      .then(function (d) { campo.value = ""; recibir(d); })
      .catch(function (e) { lista.appendChild(burbuja({ de: "auto", texto: e.message + ". Probá de nuevo en un momento." })); lista.scrollTop = lista.scrollHeight; })
      .then(function () { enviando = false; enviar.disabled = false; });
  }
  function refrescar() {
    if (!token) return;
    pedir("GET", "/" + token).then(recibir).catch(function () { token = null; try { localStorage.removeItem(CLAVE); } catch (e) {} });
  }
  function abrir(si) {
    abierto = si;
    caja.style.display = si ? "flex" : "none";
    boton.setAttribute("aria-label", si ? "Cerrar el chat" : "Abrir el chat");
    boton.querySelector(".cpx-punto").style.display = "none";
    clearInterval(reloj);
    if (si) {
      if (token) refrescar(); else pintar([]);
      // Mientras está abierto, mira cada 8 segundos si le respondieron
      reloj = setInterval(refrescar, 8000);
      setTimeout(function () { campo.focus(); }, 50);
    } else if (token) reloj = setInterval(refrescar, 45000);
  }
  boton.addEventListener("click", function () { abrir(!abierto); });
  cerrar.addEventListener("click", function () { abrir(false); });
  pie.addEventListener("submit", function (e) { e.preventDefault(); mandar(campo.value); });
  campo.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); mandar(campo.value); } });
  mail.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!token || !mailInput.value.trim()) return;
    pedir("POST", "/" + token + "/contacto", { email: mailInput.value.trim() }).then(recibir).catch(function (err) { mailInput.setCustomValidity(err.message); mailInput.reportValidity(); setTimeout(function () { mailInput.setCustomValidity(""); }, 2500); });
  });

  pedir("GET", "/preguntas?producto=" + producto).then(function (d) {
    d.preguntas.forEach(function (p) {
      var c = el("button", "cpx-chip", p.pregunta);
      c.type = "button";
      c.addEventListener("click", function () { mandar(p.pregunta); });
      chips.appendChild(c);
    });
  }).catch(function () {});
  // Si ya había una conversación, mira de fondo si le respondieron
  if (token) { refrescar(); reloj = setInterval(refrescar, 45000); }
})();
