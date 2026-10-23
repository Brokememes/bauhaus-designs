/* Palette switch: "Gallery at Dusk" (default) <-> "Heritage" (bauhausdesigns.in colours).
   Loaded in <head> so the saved palette applies before first paint. */
(function () {
  var KEY = "bauhaus-theme";
  var root = document.documentElement;

  function read() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function save(v) {
    try { localStorage.setItem(KEY, v); } catch (e) { /* private mode: palette just won't persist */ }
  }
  function apply(v) {
    if (v === "heritage") root.setAttribute("data-theme", "heritage");
    else root.removeAttribute("data-theme");
  }

  apply(read());

  document.addEventListener("DOMContentLoaded", function () {
    var nav = document.querySelector(".nav");
    if (!nav) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-toggle";
    btn.setAttribute("role", "switch");
    btn.setAttribute("aria-label", "Heritage colour palette");
    btn.innerHTML = '<span class="track" aria-hidden="true"></span><span class="label">Heritage</span>';
    var sync = function () {
      btn.setAttribute("aria-checked", root.getAttribute("data-theme") === "heritage" ? "true" : "false");
    };
    btn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "heritage" ? "dusk" : "heritage";
      apply(next); save(next); sync();
    });
    sync();
    var anchor = nav.querySelector(".nav-cta") || nav.querySelector(".nav-toggle");
    nav.insertBefore(btn, anchor);
  });
})();
