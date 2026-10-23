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
    var buttons = [];
    var sync = function () {
      var on = root.getAttribute("data-theme") === "heritage" ? "true" : "false";
      buttons.forEach(function (b) { b.setAttribute("aria-checked", on); });
    };
    var make = function (label) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "theme-toggle";
      btn.setAttribute("role", "switch");
      btn.setAttribute("aria-label", "Heritage colour palette");
      btn.innerHTML = '<span class="track" aria-hidden="true"></span><span class="label">' + label + "</span>";
      btn.addEventListener("click", function () {
        var next = root.getAttribute("data-theme") === "heritage" ? "dusk" : "heritage";
        apply(next); save(next); sync();
      });
      buttons.push(btn);
      return btn;
    };
    // desktop: inline in the nav bar
    nav.insertBefore(make("Heritage"), nav.querySelector(".nav-cta") || nav.querySelector(".nav-toggle"));
    // phone: inside the open menu, so it never crowds the logo
    var links = nav.querySelector(".nav-links");
    if (links) {
      var li = document.createElement("li");
      li.className = "nav-theme";
      li.appendChild(make("Heritage colours"));
      links.appendChild(li);
    }
    sync();
  });
})();
