/*! HeshBot widget — MIT — https://github.com/YardPhantom/HeshBot */
(function () {
  "use strict";
  if (window.HeshBot && window.HeshBot._ready) return;
  var script = document.currentScript || document.querySelector('script[src*="heshbot.js"]');
  var base = script ? script.src.replace(/[^\/]*$/, "") : "/heshbot/";
  var API = (script && script.getAttribute("data-api")) || base + "api/chat.php";
  var KEY = "heshbot.v1";
  var MAX = 1000;
  var ICON = "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2032%2032'%3E%3Cdefs%3E%3ClinearGradient%20id='g'%20x1='0'%20y1='0'%20x2='1'%20y2='1'%3E%3Cstop%20offset='0%25'%20stop-color='%238B5CF6'/%3E%3Cstop%20offset='100%25'%20stop-color='%2367E8F9'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect%20width='32'%20height='32'%20rx='9'%20fill='url(%23g)'/%3E%3Ctext%20x='16'%20y='22'%20font-family='Georgia,serif'%20font-size='15'%20font-weight='bold'%20text-anchor='middle'%20fill='%23000'%3ETH%3C/text%3E%3C/svg%3E";
  var GREETING = "Hi! I'm **HeshBot**. Ask me about Trevor's services, AI work or projects.";
  var CHIPS = ["What does Trevor do?", "Show me AI projects", "IT support in Nanaimo?", "How do I contact Trevor?"];

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function safeUrl(u) {
    u = u.replace(/&amp;/g, "&");
    if (/^mailto:[^\s]+$/i.test(u) || /^https?:\/\/[^\s]+$/i.test(u) || /^\/[^\s]*$/.test(u)) return esc(u);
    return null;
  }
  function inline(s) { // s is ALREADY escaped
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, t, u) {
      var safe = safeUrl(u);
      if (!safe) return t;
      var ext = /^https?:/i.test(u) && u.indexOf(location.host) === -1;
      return '<a href="' + safe + '"' + (ext ? ' target="_blank" rel="noopener noreferrer"' : "") + ">" + t + "</a>";
    });
    s = s.replace(/(^|[\s(])((?:https?:\/\/|mailto:)[^\s<)]+|[\w.+-]+@[\w-]+\.[\w.]+)/g, function (m, pre, u) {
      var href = /@/.test(u) && !/^(mailto|https?):/i.test(u) ? "mailto:" + u : u;
      var safe = safeUrl(href);
      return safe ? pre + '<a href="' + safe + '">' + u + "</a>" : m;
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
    return s;
  }
  // Markdown-lite: escape everything first, then add a small whitelist of tags.
  function md(src) {
    var lines = esc(src).split(/\r?\n/), out = [], list = null, para = [];
    function flushP() { if (para.length) { out.push("<p>" + inline(para.join("<br>")) + "</p>"); para = []; } }
    function flushL() { if (list) { out.push("</" + list + ">"); list = null; } }
    lines.forEach(function (ln) {
      var ul = /^\s*[-*•]\s+(.*)$/.exec(ln), ol = /^\s*\d+[.)]\s+(.*)$/.exec(ln), h = /^\s*#{1,6}\s+(.*)$/.exec(ln);
      if (ul || ol) {
        flushP(); var t = ul ? "ul" : "ol";
        if (list !== t) { flushL(); out.push("<" + t + ">"); list = t; }
        out.push("<li>" + inline((ul || ol)[1]) + "</li>");
      } else if (!ln.trim()) { flushP(); flushL(); }
      else if (h) { flushP(); flushL(); out.push("<p><strong>" + inline(h[1]) + "</strong></p>"); }
      else { flushL(); para.push(ln); }
    });
    flushP(); flushL();
    return out.join("");
  }

  var state = { msgs: [], busy: false };
  try { state.msgs = JSON.parse(sessionStorage.getItem(KEY) || "[]") || []; } catch (e) { state.msgs = []; }
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(state.msgs.slice(-30))); } catch (e) {} }

  var root, panel, log, form, input, sendBtn, launch, chips, live, built = false, lastFocus;

  function ensureCss() {
    if (document.querySelector('link[data-heshbot]')) return;
    var l = el("link", { rel: "stylesheet", href: base + "heshbot.css", "data-heshbot": "" });
    document.head.appendChild(l);
  }
  function addMsg(role, text, cls) {
    var d = el("div", { class: "hb-msg " + (role === "user" ? "hb-user" : "hb-bot") + (cls ? " " + cls : "") });
    if (role === "user") d.textContent = text; else d.innerHTML = md(text);
    var who = el("span", { class: "hb-sr" }, role === "user" ? "You: " : "HeshBot: ");
    d.insertBefore(who, d.firstChild);
    log.appendChild(d); log.scrollTop = log.scrollHeight;
    return d;
  }
  function build() {
    if (built) return; built = true; ensureCss();
    root = el("div", { class: "hb-root" });
    launch = document.getElementById("heshbot-launch") || document.getElementById("th-chat-launch");
    if (launch) { launch.disabled = false; launch.style.opacity = ""; launch.removeAttribute("style"); launch.className = "hb-launch"; }
    else { launch = el("button", { type: "button", class: "hb-launch" }); launch.innerHTML = '<img src="' + ICON + '" alt="" width="34" height="34">'; }
    launch.setAttribute("aria-label", "Open HeshBot chat");
    launch.setAttribute("aria-expanded", "false");
    launch.setAttribute("aria-controls", "hb-panel");
    root.appendChild(launch);
    panel = el("div", { id: "hb-panel", class: "hb-panel", role: "dialog", "aria-modal": "false", "aria-labelledby": "hb-title" });
    panel.hidden = true;
    var head = el("div", { class: "hb-head" });
    head.innerHTML = '<img src="' + ICON + '" alt="">';
    var t = el("div", { class: "hb-title" });
    t.appendChild(el("strong", { id: "hb-title" }, "HeshBot"));
    t.appendChild(el("span", null, "Trevor Heshka · Nanaimo, BC"));
    head.appendChild(t);
    var clr = el("button", { type: "button", class: "hb-icon", "aria-label": "Clear conversation", title: "Clear conversation" }, "Clear");
    var cls = el("button", { type: "button", class: "hb-icon", "aria-label": "Close chat", title: "Close" }, "\u2715");
    head.appendChild(clr); head.appendChild(cls);
    log = el("div", { class: "hb-log", role: "log", "aria-live": "polite", "aria-relevant": "additions", tabindex: "0", "aria-label": "Conversation" });
    chips = el("div", { class: "hb-chips" });
    CHIPS.forEach(function (c) { var b = el("button", { type: "button", class: "hb-chip" }, c); b.onclick = function () { send(c); }; chips.appendChild(b); });
    form = el("form", { class: "hb-form" });
    var lab = el("label", { for: "hb-input", class: "hb-sr" }, "Message HeshBot");
    input = el("textarea", { id: "hb-input", rows: "1", maxlength: String(MAX), placeholder: "Ask about Trevor\u2019s work\u2026", autocomplete: "off" });
    sendBtn = el("button", { type: "submit", class: "hb-send" }, "Send");
    form.appendChild(lab); form.appendChild(input); form.appendChild(sendBtn);
    var foot = el("div", { class: "hb-foot" });
    foot.innerHTML = 'AI answers can be wrong \u00b7 <a href="mailto:trevor@trevorheshka.com">trevor@trevorheshka.com</a>';
    panel.appendChild(head); panel.appendChild(log); panel.appendChild(chips); panel.appendChild(form); panel.appendChild(foot);
    root.appendChild(panel);
    document.body.appendChild(root);

    render();
    launch.onclick = function () { panel.hidden ? open() : close(); };
    cls.onclick = close;
    clr.onclick = function () { state.msgs = []; save(); render(); input.focus(); };
    form.onsubmit = function (e) { e.preventDefault(); send(input.value); };
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); }
    });
    input.addEventListener("input", function () { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 120) + "px"; });
    panel.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.stopPropagation(); close(); } });
  }
  function render() {
    log.textContent = "";
    addMsg("model", GREETING);
    state.msgs.forEach(function (m) { addMsg(m.role, m.content); });
    chips.hidden = state.msgs.length > 0;
  }
  function open() {
    build(); lastFocus = document.activeElement;
    panel.hidden = false; root.classList.add("hb-open");
    launch.setAttribute("aria-expanded", "true"); launch.setAttribute("aria-label", "Close HeshBot chat");
    log.scrollTop = log.scrollHeight;
    setTimeout(function () { input.focus(); }, 30);
  }
  function close() {
    if (!panel) return;
    panel.hidden = true; root.classList.remove("hb-open");
    launch.setAttribute("aria-expanded", "false"); launch.setAttribute("aria-label", "Open HeshBot chat");
    (lastFocus && lastFocus.focus ? lastFocus : launch).focus();
  }
  function send(text) {
    text = String(text || "").trim().slice(0, MAX);
    if (!text || state.busy) return;
    state.busy = true; sendBtn.disabled = true; chips.hidden = true;
    input.value = ""; input.style.height = "";
    state.msgs.push({ role: "user", content: text }); save();
    addMsg("user", text);
    var typing = el("div", { class: "hb-msg hb-bot hb-typing", "aria-label": "HeshBot is typing" });
    typing.innerHTML = "<span></span><span></span><span></span>";
    log.appendChild(typing); log.scrollTop = log.scrollHeight;
    var ctrl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 45000);
    fetch(API, {
      method: "POST", credentials: "same-origin", signal: ctrl ? ctrl.signal : undefined,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: state.msgs.slice(-12) })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; });
    }).then(function (res) {
      var reply = res.j && typeof res.j.reply === "string" ? res.j.reply : "";
      if (res.ok && reply) { state.msgs.push({ role: "model", content: reply }); save(); addMsg("model", reply); }
      else { state.msgs.pop(); save(); addMsg("model", reply || "Sorry, something went wrong. Please email trevor@trevorheshka.com.", "hb-err"); }
    }).catch(function () {
      state.msgs.pop(); save();
      addMsg("model", "I couldn't reach the server. Please try again, or email trevor@trevorheshka.com.", "hb-err");
    }).then(function () {
      clearTimeout(timer); typing.remove(); state.busy = false; sendBtn.disabled = false; input.focus();
    });
  }

  window.HeshBot = { _ready: true, open: open, close: close, send: function (t) { open(); send(t); } };
  var auto = script && script.getAttribute("data-open") === "1";
  function boot() { build(); if (auto) open(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
