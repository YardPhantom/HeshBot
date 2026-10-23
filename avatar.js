/* HeshBot avatar controller. No dependencies.
   Photo mode (default): var av = HeshAvatar.mount(el, { size: 44 });  // uses face-trevor.webp
   Legacy sprite: HeshAvatar.mount(el, { mode: "sprite", src: "avatar-sprite.webp" });
   av.talk(); av.idle(); av.talkFor(text); av.destroy(); */
(function () {
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  function mount(el, opt) {
    opt = opt || {};
    var sprite = opt.mode === "sprite";
    el.classList.add("hb-avatar");
    el.setAttribute("data-mode", sprite ? "sprite" : "photo");
    el.setAttribute("role", "img");
    if (!el.getAttribute("aria-label")) el.setAttribute("aria-label", "HeshBot avatar");
    if (opt.size) el.style.setProperty("--hb-av-size", opt.size + "px");
    if (opt.src) el.style.setProperty("--hb-av-src", "url(" + opt.src + ")");
    var clip = el.querySelector(".hb-av-clip") || el.appendChild(document.createElement("div"));
    clip.className = "hb-av-clip";
    var face = clip.querySelector(".hb-av-face") || clip.appendChild(document.createElement("div"));
    face.className = "hb-av-face";
    var talking = false, blinkT, talkT, stopT, last = 0;
    function frame(n) { el.setAttribute("data-frame", n); }
    function blink() {
      blinkT = setTimeout(function () {
        if (!talking) { frame(1); setTimeout(function () { if (!talking) frame(0); }, 130); }
        blink();
      }, 2200 + Math.random() * 4200);
    }
    function mouth() {
      var seq = [0, 2, 3, 2, 3, 0, 3, 2];
      var n = seq[Math.floor(Math.random() * seq.length)];
      if (n === last) n = n === 0 ? 2 : 0;
      last = n; frame(n);
      talkT = setTimeout(mouth, 80 + Math.random() * 90);
    }
    function talk() { if (talking) return; talking = true; el.classList.add("is-talking"); if (sprite && !reduce) mouth(); }
    function idle() { talking = false; clearTimeout(talkT); clearTimeout(stopT); el.classList.remove("is-talking"); frame(0); }
    function talkFor(text) { talk(); clearTimeout(stopT); var ms = Math.min(12000, Math.max(900, String(text || "").length * 45)); stopT = setTimeout(idle, ms); }
    frame(0); if (sprite && !reduce) blink();
    return { talk: talk, idle: idle, talkFor: talkFor, el: el,
      destroy: function () { idle(); clearTimeout(blinkT); } };
  }
  var all = [];
  window.HeshAvatar = {
    mount: function (el, o) { var a = mount(el, o); all.push(a); return a; },
    talk: function () { all.forEach(function (a) { a.talk(); }); },
    idle: function () { all.forEach(function (a) { a.idle(); }); },
    talkFor: function (t) { all.forEach(function (a) { a.talkFor(t); }); }
  };
})();
