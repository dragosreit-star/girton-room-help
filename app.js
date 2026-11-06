/* Room help - a one-page guide per room, rendered from config.json + rooms/<id>.json.
   Vanilla JS, no build step. The code names no room, person, colour or phone number:
   every word and value comes from the JSON. Nothing is stored on the device. */
(function () {
  "use strict";

  var SCREENS = ["home", "connect", "help", "fix", "room", "info"];
  var app = document.getElementById("app");
  var cfg = null, room = null, ui = null;
  var inAppNav = false; // true once the guest has moved between screens in this visit

  /* ---------- small helpers ---------- */
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k === "html") n.innerHTML = v;
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    }
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return n;
  }
  function fill(tpl, vals) {
    return String(tpl || "").replace(/\{(\w+)\}/g, function (m, k) { return vals[k] !== undefined ? vals[k] : m; });
  }
  function get(obj, path, dflt) {
    var parts = path.split("."), o = obj;
    for (var i = 0; i < parts.length; i++) { if (o == null) return dflt; o = o[parts[i]]; }
    return o == null ? dflt : o;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  /* Step text: escape, then turn "Win + K" style shortcuts into keycaps and "quoted names" into bold. */
  function richText(s) {
    var h = esc(s);
    h = h.replace(/\b(Win|Ctrl|Alt|Shift|Cmd|Fn) \+ ([A-Z0-9])\b/g, "<kbd>$1</kbd> + <kbd>$2</kbd>");
    h = h.replace(/&quot;([^&]{1,60}?)&quot;/g, "<strong>$1</strong>");
    return h;
  }

  /* ---------- icons (stroke = currentColor, so colour comes from CSS) ---------- */
  var ICON = {
    laptop: '<path d="M8 4.5a6 6 0 0 1 8 0M6 7a9 9 0 0 1 12 0"/><circle cx="12" cy="9.5" r="0.8"/><rect x="4" y="12" width="16" height="7" rx="1.5"/><path d="M2 21h20"/>',
    tool: '<path d="M14.5 6.5a4 4 0 0 0-5 5L3 18l3 3 6.5-6.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z"/>',
    display: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    camera: '<rect x="2" y="8" width="20" height="8" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h1M17 12h1"/>',
    wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1"/>',
    usb: '<rect x="8" y="2" width="8" height="9" rx="2"/><path d="M10 5h4M12 11v5a4 4 0 0 1-4 4H6"/>',
    loop: '<path d="M6 9a6 6 0 1 1 12 0c0 3-2 4-3 6s-1 5-4 5a3 3 0 0 1-3-3"/><path d="M9 9a3 3 0 0 1 6 0"/>',
    remote: '<rect x="8" y="2" width="8" height="20" rx="2"/><circle cx="12" cy="7" r="1"/><path d="M10.5 12h3M10.5 15.5h3"/>',
    adapter: '<path d="M9 2v4M15 2v4"/><rect x="6" y="6" width="12" height="7" rx="2"/><path d="M12 13v4a3 3 0 0 0 3 3h2"/>',
    layout: '<path d="M4 20V4h4v12h8V4h4v16z"/>',
    left: '<path d="M15 6l-6 6 6 6"/>',
    right: '<path d="M9 6l6 6-6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>'
  };
  function icon(name, size) {
    var s = size || 24;
    var span = document.createElement("span");
    span.innerHTML = '<svg aria-hidden="true" focusable="false" width="' + s + '" height="' + s +
      '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      (ICON[name] || ICON.display) + "</svg>";
    return span.firstChild;
  }

  /* ---------- photos: every slot hides itself if the file is missing ---------- */
  function photoSrc(key) {
    var file = get(room, "photos." + key);
    return file ? "assets/" + room.id + "/" + file : null;
  }
  function figure(key, opts) {
    opts = opts || {};
    var src = photoSrc(key);
    if (!src) return null;
    var cap = get(room, "photos_captions." + key, {});
    var img = el("img", { alt: cap.alt || "", loading: opts.eager ? "eager" : "lazy", decoding: "async" });
    var fig = el("figure", { class: opts.cls || null }, [img, cap.caption && !opts.noCaption ? el("figcaption", { text: cap.caption }) : null]);
    img.addEventListener("error", function () {
      var parent = fig.parentNode;
      fig.remove();
      // collapse an empty photo row too
      if (parent && parent.classList && parent.classList.contains("photos") && !parent.querySelector("figure")) parent.remove();
      else if (parent && parent.classList && parent.classList.contains("photos") && parent.querySelectorAll("figure").length === 1) parent.classList.add("one");
    });
    img.src = src;
    return fig;
  }
  function photoRow(keys) {
    var figs = (keys || []).map(function (k) { return figure(k); }).filter(Boolean);
    if (!figs.length) return null;
    return el("div", { class: "photos" + (figs.length === 1 ? " one" : "") }, figs);
  }

  /* ---------- colours, favicon, title ---------- */
  function applyTheme() {
    var c = cfg.college || {}, root = document.documentElement.style;
    Object.keys(c).forEach(function (k) {
      if (typeof c[k] === "string" && /^#[0-9a-f]{3,8}$/i.test(c[k])) root.setProperty("--" + k.replace(/_/g, "-"), c[k]);
    });
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="' +
      (c.green || "currentColor") + '"/><text x="16" y="23" text-anchor="middle" font-family="Arial,sans-serif" font-size="21" font-weight="700" fill="' +
      (c.background || "white") + '">?</text></svg>';
    var link = document.querySelector("link[rel=icon]") || el("link", { rel: "icon" });
    link.setAttribute("type", "image/svg+xml");
    link.setAttribute("href", "data:image/svg+xml," + encodeURIComponent(svg));
    document.head.appendChild(link);
  }

  /* ---------- screen chrome ---------- */
  function bar(title, withHelp) {
    var back = el("a", { class: "back", href: "#home", onclick: function (e) {
      if (inAppNav && history.length > 1) { e.preventDefault(); history.back(); }
    } }, [icon("left", 20), ui.back]);
    var help = withHelp ? el("a", { class: "helplink", href: "#help" }, [ui.help]) : el("span");
    return el("header", { class: "bar" }, [back, el("h1", { tabindex: "-1", text: title }), help]);
  }
  function screen(id, kids) {
    return el("section", { class: "screen", id: "s-" + id, "data-screen": id, hidden: true }, kids);
  }

  /* ---------- Home ---------- */
  function buildHome() {
    var w = room.welcome || {}, h = ui.home;
    var heroImg = (function () {
      var src = photoSrc("hero");
      if (!src) return null;
      var img = el("img", { alt: get(room, "photos_captions.hero.alt", ""), decoding: "async" });
      img.addEventListener("error", function () { img.remove(); });
      img.src = src;
      return img;
    })();
    var hero = el("header", { class: "hero" }, [
      heroImg,
      el("div", { class: "shade", "aria-hidden": "true" }),
      el("div", { class: "eyebrow", text: (cfg.college.name ? cfg.college.name + " · " : "") + room.name }),
      el("h1", { tabindex: "-1", text: w.headline || room.name }),
      w.sub ? el("div", { class: "sub", text: w.sub }) : null
    ]);
    var main = el("main", { class: "home-main" }, [
      el("a", { class: "home-connect", href: "#connect" }, [icon("laptop", 48),
        el("span", { class: "t" }, [el("span", { class: "big", text: h.connect_title }),
          w.connect_hint ? el("span", { class: "small", text: w.connect_hint }) : null])]),
      el("a", { class: "home-help", href: "#help" }, [el("span", { class: "t" }, [
        el("span", { class: "big", text: h.help_title }), el("span", { class: "small", text: h.help_sub })])]),
      el("div", { class: "home-tiles" }, [
        el("a", { class: "home-tile", href: "#fix" }, [icon("tool", 28), h.fix]),
        el("a", { class: "home-tile", href: "#room" }, [icon("display", 28), h.room])
      ]),
      el("a", { class: "home-info", href: "#info" }, [h.info, icon("right", 20)])
    ]);
    return screen("home", [hero, main]);
  }

  /* ---------- Connect ---------- */
  function buildConnect() {
    var cards = (room.quick_connect || []).map(function (c) {
      var sub = [];
      if (c.works_for && c.works_for.length) sub.push(fill(ui.connect.works_for, { list: c.works_for.join(", ") }));
      if (c.recommended_for) sub.push(fill(ui.connect.recommended_for, { text: c.recommended_for }));
      var steps = (c.steps || []).map(function (s, i) {
        var text = el("span", { class: "step-text", html: richText(s) });
        var row = photoRow(get(c, "step_photos." + i));
        if (row) text.appendChild(row);
        return el("li", null, [el("span", { class: "num", "aria-hidden": "true", text: String(i + 1) }), text]);
      });
      return el("article", { class: "card" }, [
        el("div", { class: "card-head" }, [el("h2", { text: c.title }), sub.length ? el("p", { text: sub.join(" ") }) : null]),
        el("ol", { class: "steps" }, steps),
        photoRow(c.photos)
      ]);
    });
    var body = el("div", { class: "body" }, cards.concat([
      room.quick_connect_footer ? el("p", { class: "footnote", text: room.quick_connect_footer }) : null
    ]));
    return screen("connect", [bar(ui.titles.connect, true), body]);
  }

  /* ---------- Fix ---------- */
  function buildFix() {
    var items = (room.howto || []).map(function (h) {
      var sum = el("summary", null, [h.title, icon("down", 20)]);
      var pics = null;
      if (h.photos && h.photos.length) {
        if (h.photo_size === "small") {
          pics = el("div", null, h.photos.map(function (k) { return figure(k, { cls: "small-photo" }); }).filter(Boolean));
        } else pics = photoRow(h.photos);
      }
      return el("details", { open: !!h.open }, [sum, pics,
        el("ol", null, (h.steps || []).map(function (s) { return el("li", { html: richText(s) }); }))]);
    });
    var body = el("div", { class: "body", style: "gap:10px" }, items.concat([
      el("a", { class: "btn-outline-red", href: "#help" }, [ui.fix.still_stuck])
    ]));
    return screen("fix", [bar(ui.titles.fix, true), body]);
  }

  /* ---------- Room ---------- */
  function buildRoom() {
    var tiles = (room.av || []).map(function (a) {
      return el("div", { class: "tile" }, [icon(a.icon, 26), el("strong", { text: a.item }),
        el("span", { class: "d", text: a.short_detail || a.detail }),
        (a.short_note || a.note) ? el("span", { class: "n", text: a.short_note || a.note }) : null]);
    });
    var body = el("div", { class: "body" }, [
      figure("screen_idle", { cls: "wide", eager: true }),
      el("div", { class: "tiles" }, tiles)
    ]);
    return screen("room", [bar(ui.titles.room, true), body]);
  }

  /* ---------- Info ---------- */
  function section(id, title, kids, cls) {
    return el("section", { class: cls || "info-sec", "aria-labelledby": id }, [el("h2", { id: id, text: title })].concat(kids));
  }
  function buildInfo() {
    var t = ui.info, parts = [];
    var contacts = (room.contacts || []).map(function (c) {
      var link = null;
      if (c.email) link = el("a", { href: "mailto:" + c.email, text: c.email });
      else if (c.phone) link = el("a", { href: "tel:" + c.phone.replace(/[^\d+]/g, ""), text: c.phone });
      return el("div", { class: "contact" }, [el("strong", { text: c.label }), link, c.detail ? el("span", { text: c.detail }) : null]);
    });
    if (contacts.length) parts.push(section("contacts-h", t.contacts, [el("div", { class: "box contacts" }, contacts)]));
    if (room.wifi) {
      var wp = ["visitors", "members"].filter(function (k) { return room.wifi[k]; })
        .map(function (k) { return el("p", { text: room.wifi[k] }); });
      if (wp.length) parts.push(section("wifi-h", t.wifi, [el("div", { class: "box" }, wp)]));
    }
    if (room.toilets) parts.push(section("toilets-h", t.toilets, [el("div", { class: "box" }, [el("p", { text: room.toilets })])]));
    if (get(room, "access.note")) parts.push(section("access-h", t.access, [el("div", { class: "box" }, [el("p", { text: room.access.note })])]));
    var f = room.fire;
    if (f) {
      var map = null;
      if (f.map) {
        var img = el("img", { alt: f.map_alt || "", loading: "lazy" });
        map = el("figure", null, [img, f.map_caption ? el("figcaption", { text: f.map_caption }) : null]);
        img.addEventListener("error", function () { map.remove(); });
        img.src = f.map;
      }
      parts.push(section("fire-h", t.fire, [
        f.nearest_exit ? el("p", null, [el("strong", { text: t.nearest_exit + " " }), f.nearest_exit]) : null,
        f.route ? el("p", { class: "route", text: f.route }) : null,
        f.assembly_point ? el("p", null, [el("strong", { text: (f.assembly_label || t.assembly) + " " }), f.assembly_point]) : null,
        map,
        f.note ? el("p", { class: "muted", text: f.note }) : null
      ].filter(Boolean), "fire"));
    }
    return screen("info", [bar(ui.titles.info, true), el("div", { class: "body info-body" }, parts)]);
  }

  /* ---------- Help ---------- */
  function hm(s) { var p = String(s || "0:0").split(":"); return (+p[0]) * 60 + (+p[1] || 0); }
  function insideStaffHours() {
    var sh = cfg.staff_hours;
    if (!sh) return true;
    try {
      var parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: sh.timezone || "Europe/London", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
      }).formatToParts(new Date());
      var p = {}; parts.forEach(function (x) { p[x.type] = x.value; });
      var weekend = p.weekday === "Sat" || p.weekday === "Sun";
      var span = weekend ? sh.weekend : sh.weekdays;
      if (!span) return false;
      var now = (+p.hour) * 60 + (+p.minute);
      return now >= hm(span.from) && now < hm(span.to);
    } catch (e) { return true; }
  }
  function londonStamp() {
    try {
      return new Intl.DateTimeFormat("en-GB", { timeZone: get(cfg, "staff_hours.timezone", "Europe/London"),
        dateStyle: "medium", timeStyle: "short" }).format(new Date());
    } catch (e) { return new Date().toString(); }
  }

  function buildHelp() {
    var f = ui.help_form, hp = room.help || {};
    var teamsUrl = get(cfg, "routes.teams_channel.workflow_url", "");
    var teamsOn = get(cfg, "routes.teams_channel.enabled", false) && !!teamsUrl;
    var emailTo = get(cfg, "routes.email.enabled", true) ? get(cfg, "routes.email.to", "") : "";
    var inHours = insideStaffHours();

    var urg = el("fieldset", null, [el("legend", { text: f.urgency_legend })].concat((hp.urgency || []).map(function (u, i) {
      return el("label", { class: "radio" }, [el("input", { type: "radio", name: "urgency", value: u.id, checked: i === 0 }), u.label]);
    })));
    var problem = el("select", { id: "problem", name: "problem" }, (hp.problems || []).map(function (p) { return el("option", { text: p }); }));
    var comment = el("textarea", { id: "comment", name: "comment", rows: "3", placeholder: hp.comment_placeholder || "", maxlength: "1000" });
    var phone = get(hp, "callback.ask") ? el("input", { id: "phone", name: "phone", type: "tel", autocomplete: "tel", inputmode: "tel", maxlength: "30" }) : null;
    var honey = el("div", { class: "hp", "aria-hidden": "true" }, [
      el("label", { for: "website", text: f.honeypot_label }),
      el("input", { type: "text", id: "website", name: "website", tabindex: "-1", autocomplete: "off" })
    ]);
    var status = el("p", { class: "status", role: "status", "aria-live": "polite" });
    var teamsBtn = el("button", { type: "button", class: "btn btn-green" , text: f.send_teams });
    var emailBtn = el("button", { type: "button", class: "btn btn-white", text: f.send_email });
    var notes = [];
    if (!teamsOn) notes.push(el("p", { class: "note", text: f.teams_not_set_up }));
    else if (!inHours) notes.push(el("p", { class: "note warn", text: hp.out_of_hours_text || "" }));
    else {
      var sh = cfg.staff_hours || {};
      notes.push(el("p", { class: "note", text: fill(f.teams_hours, {
        weekdays: get(sh, "weekdays.from", "") + "–" + get(sh, "weekdays.to", ""),
        weekend: get(sh, "weekend.from", "") + "–" + get(sh, "weekend.to", "") }) }));
    }
    var showTeams = teamsOn && inHours;

    var form = el("form", { novalidate: true, onsubmit: function (e) { e.preventDefault(); } }, [
      el("input", { type: "hidden", name: "room", value: room.short || room.id }),
      urg,
      el("div", { class: "field" }, [el("label", { for: "problem", text: f.problem_label }), problem]),
      el("div", { class: "field" }, [el("label", { for: "comment", text: f.comment_label }), comment]),
      phone ? el("div", { class: "field" }, [el("label", { for: "phone", text: get(hp, "callback.label", "") }), phone]) : null,
      honey,
      el("div", { class: "buttons" }, [showTeams ? teamsBtn : null, emailTo ? emailBtn : null]),
      status
    ].concat(notes));


    // The Teams "Post to a channel when a webhook request is received" template posts every
    // Adaptive Card found in body.attachments, so the page sends a finished card (v1.3, the
    // highest the template renders) and the Workflow needs no editing.
    function teamsEnvelope(v) {
      var facts = [
        { title: "Room", value: v.room },
        { title: "Urgency", value: v.urgency },
        { title: "Problem", value: v.problem },
        { title: "Details", value: v.comment || "—" },
        { title: "Call back", value: v.phone || "not requested" },
        { title: "Sent", value: londonStamp() }
      ];
      return {
        type: "message",
        attachments: [{
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            type: "AdaptiveCard", version: "1.3",
            body: [
              { type: "TextBlock", size: "Large", weight: "Bolder",
                text: "Room help · " + v.room, wrap: true },
              { type: "TextBlock", text: v.urgency, color: /now/i.test(v.urgency) ? "Attention" : "Default",
                weight: "Bolder", wrap: true },
              { type: "FactSet", facts: facts }
            ]
          }
        }]
      };
    }
    function values() {
      var u = form.querySelector("input[name=urgency]:checked");
      var uObj = (hp.urgency || []).filter(function (x) { return u && x.id === u.value; })[0] || {};
      return {
        room: room.short || room.id,
        urgency: uObj.label || (u ? u.value : ""),
        problem: problem.value,
        comment: comment.value.trim(),
        phone: phone ? phone.value.trim() : "",
        sent_at: new Date().toISOString()
      };
    }
    var confirmBox = el("div", { class: "confirm", hidden: true, tabindex: "-1" }, [
      el("p", { role: "status", text: hp.confirmation || "" }),
      el("button", { type: "button", class: "btn btn-white", text: f.send_another, onclick: function () {
        form.reset(); confirmBox.hidden = true; form.hidden = false; status.textContent = "";
        var first = form.querySelector("input[name=urgency]"); if (first) first.focus();
      } })
    ]);
    function done() {
      form.hidden = true; confirmBox.hidden = false; confirmBox.focus();
    }

    teamsBtn.addEventListener("click", function () {
      if (form.website.value) { done(); return; } // honeypot filled: quietly drop it
      var body = JSON.stringify(teamsEnvelope(values()));
      teamsBtn.disabled = true; status.textContent = f.sending;
      fetch(teamsUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: body })
        .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); done(); })
        .catch(function (err) {
          if (err && err.name === "TypeError") {
            // Blocked by CORS (the workflow host does not answer the browser's pre-flight):
            // send as a simple request; the response is opaque, so treat delivery as best effort.
            return fetch(teamsUrl, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain" }, body: body })
              .then(done, function () { status.textContent = f.send_failed; });
          }
          status.textContent = f.send_failed;
        })
        .then(function () { teamsBtn.disabled = false; if (status.textContent === f.sending) status.textContent = ""; });
    });

    emailBtn.addEventListener("click", function () {
      if (form.website.value) return;
      var v = values(), L = f.email_labels;
      v.sent_at = londonStamp();
      var lines = ["room", "urgency", "problem", "comment", "phone", "sent_at"]
        .filter(function (k) { return v[k]; })
        .map(function (k) { return L[k] + ": " + v[k]; });
      var subject = fill(f.email_subject, { room: v.room, urgency: v.urgency });
      location.href = "mailto:" + encodeURIComponent(emailTo).replace(/%40/g, "@") +
        "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(lines.join("\n"));
    });

    var body = el("div", { class: "body help-body" }, [
      el("p", { class: "help-intro", text: fill(f.intro, { room_name: room.name }) }), form, confirmBox]);
    return screen("help", [bar(ui.titles.help, false), body]);
  }

  /* ---------- router ---------- */
  function show(id, focus) {
    if (SCREENS.indexOf(id) < 0) id = "home";
    SCREENS.forEach(function (s) { var n = document.getElementById("s-" + s); if (n) n.hidden = s !== id; });
    window.scrollTo(0, 0);
    if (focus) { var h = document.querySelector("#s-" + id + " h1"); if (h) h.focus({ preventScroll: true }); }
  }
  function route() { inAppNav = true; show((location.hash || "#home").slice(1), true); }

  function noRoom() {
    var t = get(cfg, "ui.no_room", { title: "Room help", text: "Please scan the QR code in the room to open its guide." });
    document.title = t.title;
    app.innerHTML = "";
    app.appendChild(el("main", { class: "noroom" }, [el("h1", { text: t.title }), el("p", { text: t.text })]));
  }

  function debugReadout() {
    if (!/[?&]debug\b/.test(location.search)) return;
    setTimeout(function () {
      var d = el("div", { id: "debug", style: "position:fixed;right:4px;bottom:4px;font:12px monospace;background:var(--text);color:var(--background);padding:2px 6px;z-index:9;border-radius:4px" });
      d.textContent = "scrollH " + document.documentElement.scrollHeight + " / innerH " + window.innerHeight + " / innerW " + window.innerWidth;
      document.body.appendChild(d);
    }, 600);
  }

  function getJSON(url) {
    return fetch(url, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(url + " " + r.status); return r.json(); });
  }

  function start() {
    app.innerHTML = '<p class="loading">…</p>';
    var id = (new URLSearchParams(location.search).get("room") || "").toLowerCase();
    getJSON("config.json").then(function (c) {
      cfg = c; ui = c.ui; applyTheme();
      app.querySelector(".loading").textContent = ui.loading;
      if (!/^[a-z0-9-]{1,40}$/.test(id)) throw "noroom";
      return getJSON("rooms/" + id + ".json");
    }).then(function (r) {
      room = r;
      document.title = (room.short || room.name) + " · " + ui.app_name;
      app.innerHTML = "";
      [buildHome(), buildConnect(), buildHelp(), buildFix(), buildRoom(), buildInfo()].forEach(function (s) { app.appendChild(s); });
      show((location.hash || "#home").slice(1), false);
      window.addEventListener("hashchange", route);
      debugReadout();
    }).catch(function () { noRoom(); });
  }

  start();
})();
