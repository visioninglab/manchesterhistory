(function () {
  "use strict";

  /* People named only in the events/relationship prose, with no People-sheet row. */
  const GHOSTS = new Set(["curtis","pearson","brittain","cash","wolstenholme","rpankhurst",
    "dickenson","pochin","brightmclaren","butler","davies","aclough","robertson"]);

  const DEC0 = 1770, DECN = 15;                       // 1770s … 1910s
  const decYear = i => DEC0 + i * 10;
  const nid = x => (x && typeof x === "object") ? x.id : x;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const cssvar = d => "var(" + (DOMAINS[d] ? DOMAINS[d].css : "--ink3") + ")";
  const lkey = (a, b) => [a, b].sort().join("~");

  /* ---------------- base data ---------------- */
  const BASE_NODES = RAW_NODES.map(r => ({
    id: r[0], name: r[1], type: r[2], domain: r[3], dates: r[4] || "",
    role: r[5] || "", note: r[6] || "", sheet: r[7] || "", flag: r[8] || ""
  }));

  const baseLinkMap = new Map();
  RAW_EDGES.forEach(e => {
    const key = lkey(e[0], e[1]);
    const rank = { documented: 3, verify: 2, interpretive: 1 };
    let L = baseLinkMap.get(key);
    if (!L) { L = { id: key, source: e[0], target: e[1], rels: [], ev: e[3], notes: [] };
      baseLinkMap.set(key, L); }
    L.rels.push(e[2]); L.notes.push(e[4]);
    if (rank[e[3]] > rank[L.ev]) L.ev = e[3];
  });
  const BASE_LINKS = [...baseLinkMap.values()].map(L => ({
    id: L.id, source: L.source, target: L.target,
    rel: [...new Set(L.rels)].join(" · "), ev: L.ev, note: L.notes.join("\n")
  }));

  function parseSpan(s, type) {
    if (!s) return null;
    const two = String(s).match(/(\d{3,4})\s*[–—-]\s*(\d{2,4})/);
    if (two) {
      let a = +two[1], b = +two[2];
      if (b < 100) b = Math.floor(a / 100) * 100 + b;
      if (b < a) b = a;
      return type === "person" ? [Math.min(a + 25, b), b] : [a, b];
    }
    const one = String(s).match(/(\d{4})/);
    if (one) { const y = +one[1]; return type === "person" ? [y + 25, y + 55] : [y, 1910]; }
    return null;
  }

  /* ---------------- overrides (db / localStorage) ---------------- */
  const LS = "wkw.overrides.v1";
  let rowOv = new Map(), edgeOv = new Map();
  let db = null, dl = null, saveMode = "checking";

  function loadLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS) || "{}");
      rowOv = new Map(Object.entries(raw.rows || {}));
      edgeOv = new Map(Object.entries(raw.edges || {}));
    } catch (e) { /* private mode or blocked storage: start clean */ }
  }
  function saveLocal() {
    try {
      localStorage.setItem(LS, JSON.stringify({
        rows: Object.fromEntries(rowOv), edges: Object.fromEntries(edgeOv)
      }));
    } catch (e) { /* nothing we can do; the in-memory model still works */ }
  }

  /* ---------------- model ---------------- */
  let nodes = [], links = [], byId = new Map(), adj = new Map();
  let isolates = [], ghostList = [], crossCount = 0, hist = [];
  const pos = new Map();

  function buildModel() {
    nodes.forEach(n => { if (n.x != null) pos.set(n.id, { x: n.x, y: n.y }); });

    const nm = new Map();
    BASE_NODES.forEach(n => nm.set(n.id, Object.assign({}, n)));
    rowOv.forEach((v, id) => {
      if (v._op === "delete") { nm.delete(id); return; }
      const base = nm.get(id) || { id: id, sheet: "", flag: "" };
      const merged = Object.assign({}, base, v, { id: id });
      delete merged._op; delete merged._at;
      nm.set(id, merged);
    });

    nodes = [...nm.values()].map(n => {
      const p = pos.get(n.id);
      const a = { id: n.id, name: n.name || "(unnamed)", type: n.type || "person",
        domain: DOMAINS[n.domain] ? n.domain : "civic", dates: n.dates || "",
        role: n.role || "", note: n.note || "", sheet: n.sheet || "", flag: n.flag || "",
        af: n.af, at: n.at, ghost: GHOSTS.has(n.id), deg: 0,
        origin: rowOv.has(n.id) ? (rowOv.get(n.id)._op === "new" ? "new" : "edited") : "base",
        x: p ? p.x : undefined, y: p ? p.y : undefined };
      if (a.af != null && a.at != null && a.af !== "" && a.at !== "") {
        a.span = [+a.af, +a.at]; a.spanWB = false; a.spanEdited = true;
      } else if (SPANS[a.id]) { a.span = SPANS[a.id]; a.spanWB = WB_SPAN.has(a.id); }
      else { a.span = parseSpan(a.dates, a.type); a.spanWB = false; }
      return a;
    });
    byId = new Map(nodes.map(n => [n.id, n]));

    const lm = new Map();
    BASE_LINKS.forEach(l => lm.set(l.id, Object.assign({}, l)));
    edgeOv.forEach((v, id) => {
      if (v._op === "delete") { lm.delete(id); return; }
      const base = lm.get(id) || { id: id };
      const merged = Object.assign({}, base, v, { id: id });
      delete merged._op; delete merged._at;
      lm.set(id, merged);
    });
    links = [...lm.values()]
      .filter(l => byId.has(nid(l.source)) && byId.has(nid(l.target))
        && nid(l.source) !== nid(l.target))
      .map(l => ({ id: l.id, source: nid(l.source), target: nid(l.target),
        rel: l.rel || "linked to", ev: EVIDENCE[l.ev] ? l.ev : "verify", note: l.note || "",
        origin: edgeOv.has(l.id) ? (edgeOv.get(l.id)._op === "new" ? "new" : "edited") : "base" }));

    nodes.forEach(n => { n.deg = 0; n.fields = new Set([n.domain]); });
    adj = new Map(nodes.map(n => [n.id, []]));
    links.forEach(l => {
      const a = byId.get(l.source), b = byId.get(l.target);
      a.deg++; b.deg++; a.fields.add(b.domain); b.fields.add(a.domain);
      adj.get(a.id).push(l); adj.get(b.id).push(l);
    });

    crossCount = links.filter(l => byId.get(nid(l.source)).domain !== byId.get(nid(l.target)).domain).length;
    isolates = nodes.filter(n => n.type === "person" && n.deg === 0);
    ghostList = nodes.filter(n => n.ghost);

    hist = [];
    for (let i = 0; i < DECN; i++) {
      const a = decYear(i), b = a + 9;
      hist.push(nodes.filter(n => n.span && n.span[0] <= b && n.span[1] >= a).length);
    }
  }

  /* ---------------- palette ---------------- */
  const PAL = {};
  function readPalette() {
    const cs = getComputedStyle(document.documentElement);
    Object.keys(DOMAINS).forEach(k => { PAL[k] = cs.getPropertyValue(DOMAINS[k].css).trim(); });
    PAL.ink3 = cs.getPropertyValue("--ink3").trim();
    PAL.link = cs.getPropertyValue("--link").trim();
    PAL.canvas = cs.getPropertyValue("--canvas").trim();
  }
  readPalette();
  const col = n => PAL[n.domain] || PAL.ink3;

  /* ---------------- state ---------------- */
  const state = {
    domains: new Set(Object.keys(DOMAINS)),
    types: new Set(Object.keys(TYPES)),
    evs: new Set(Object.keys(EVIDENCE)),
    from: 0, to: DECN - 1, undated: true,
    isoOnly: false, ghostOnly: false,
    selected: null, hovered: null, tab: "net", sheetTab: "people", sheetQ: ""
  };

  function inWindow(n) {
    if (!n.span) return state.undated;
    return n.span[0] <= decYear(state.to) + 9 && n.span[1] >= decYear(state.from);
  }
  function visibleNode(n) {
    if (!n) return false;
    if (state.isoOnly) return n.type === "person" && n.deg === 0;
    if (state.ghostOnly) return n.ghost;
    return state.domains.has(n.domain) && state.types.has(n.type) && inWindow(n);
  }
  function visibleLink(l) {
    return state.evs.has(l.ev)
      && visibleNode(byId.get(nid(l.source)))
      && visibleNode(byId.get(nid(l.target)));
  }

  /* ---------------- graph ---------------- */
  const svg = d3.select("#net");
  const plot = document.querySelector(".plot");
  const root = svg.append("g");
  const gLink = root.append("g").attr("fill", "none");
  const gNode = root.append("g");
  const gText = root.append("g");

  const keys = Object.keys(DOMAINS), anchors = {};
  keys.forEach((k, i) => {
    const a = (i / keys.length) * Math.PI * 2 - Math.PI / 2;
    anchors[k] = { x: Math.cos(a) * 300, y: Math.sin(a) * 235 };
  });
  const anchorOf = d => anchors[d.domain] || { x: 0, y: 0 };
  const rad = d => 3.6 + Math.sqrt(d.deg) * 2.5;

  const sim = d3.forceSimulation()
    .force("link", d3.forceLink().id(d => d.id)
      .distance(l => l.ev === "documented" ? 46 : 62).strength(0.55))
    .force("charge", d3.forceManyBody().strength(d => -110 - d.deg * 22))
    .force("collide", d3.forceCollide(d => rad(d) + 7))
    .force("x", d3.forceX(d => anchorOf(d).x).strength(0.075))
    .force("y", d3.forceY(d => anchorOf(d).y).strength(0.075))
    .stop();

  const symbol = d3.symbol();
  function shapeFor(d) {
    const r = rad(d);
    symbol.size(Math.PI * r * r * (d.type === "person" ? 1 : 1.25));
    symbol.type(d.type === "person" ? d3.symbolCircle
      : d.type === "org" ? d3.symbolSquare : d3.symbolDiamond);
    return symbol();
  }

  let linkSel, nodeSel, textSel, settled = false, lastShape = [-1, -1];

  function bindGraph(firstRun) {
    nodes.forEach(n => {
      if (n.x == null) {
        const a = anchorOf(n);
        n.x = a.x + (Math.random() - 0.5) * 60;
        n.y = a.y + (Math.random() - 0.5) * 60;
      }
    });
    sim.nodes(nodes);
    sim.force("link").links(links);

    if (firstRun) {
      for (let i = 0; i < 420; i++) sim.tick();
      settled = true;
    } else if (nodes.length !== lastShape[0] || links.length !== lastShape[1]) {
      sim.alpha(0.22).restart();
    }
    lastShape = [nodes.length, links.length];

    linkSel = gLink.selectAll("path").data(links, d => d.id).join("path")
      .attr("stroke-linecap", "round")
      .attr("vector-effect", "non-scaling-stroke")
      .style("cursor", "pointer")
      .on("click", (ev, d) => { ev.stopPropagation(); showLink(d); })
      .on("mouseenter", (ev, d) => { state.hovered = nid(d.source); paint(); })
      .on("mouseleave", () => { state.hovered = null; paint(); });

    nodeSel = gNode.selectAll("path").data(nodes, d => d.id).join(
      enter => enter.append("path").attr("class", "node")
        .on("click", (ev, d) => { ev.stopPropagation(); select(d.id); })
        .on("mouseenter", (ev, d) => { state.hovered = d.id; paint(); })
        .on("mouseleave", () => { state.hovered = null; paint(); })
        .call(d3.drag()
          .on("start", (ev, d) => { if (!ev.active) sim.alphaTarget(0.2).restart(); d.fx = d.x; d.fy = d.y; })
          .on("drag", (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
          .on("end", (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })),
      update => update, exit => exit.remove())
      .attr("d", shapeFor)
      .attr("stroke-width", 1.4)
      .attr("vector-effect", "non-scaling-stroke");

    textSel = gText.selectAll("text").data(nodes, d => d.id).join("text")
      .attr("class", "node-label").attr("text-anchor", "middle")
      .text(d => d.name);

    position();
  }

  sim.on("tick", position);

  function position() {
    if (!linkSel) return;
    linkSel.attr("d", d => "M" + d.source.x + "," + d.source.y + "L" + d.target.x + "," + d.target.y);
    nodeSel.attr("transform", d => "translate(" + d.x + "," + d.y + ")");
    textSel.attr("x", d => d.x).attr("y", d => d.y - rad(d) - 4.5);
  }

  let k = 1;
  const zoom = d3.zoom().scaleExtent([0.25, 4]).on("zoom", ev => {
    k = ev.transform.k; root.attr("transform", ev.transform); paintLabels();
  });
  svg.call(zoom).on("click", () => select(null))
    .on("mousedown.cur", function () { this.classList.add("grabbing"); })
    .on("mouseup.cur", function () { this.classList.remove("grabbing"); });

  function fit() {
    const W = plot.clientWidth, H = plot.clientHeight;
    if (!W || !H) return;
    const vis = nodes.filter(visibleNode);
    const set = vis.length ? vis : nodes;
    const xs = set.map(n => n.x), ys = set.map(n => n.y);
    const x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    const y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    const s = Math.min(W / (x1 - x0 + 140), H / (y1 - y0 + 140), 1.6) || 1;
    svg.transition().duration(400).call(zoom.transform, d3.zoomIdentity
      .translate(W / 2, H / 2).scale(s).translate(-(x0 + x1) / 2, -(y0 + y1) / 2));
  }
  document.getElementById("zin").onclick = () => svg.transition().duration(200).call(zoom.scaleBy, 1.4);
  document.getElementById("zout").onclick = () => svg.transition().duration(200).call(zoom.scaleBy, 0.7);
  document.getElementById("zfit").onclick = fit;

  function focus(id) {
    const n = byId.get(id); if (!n) return;
    const W = plot.clientWidth, H = plot.clientHeight;
    svg.transition().duration(450).call(zoom.transform,
      d3.zoomIdentity.translate(W / 2, H / 2).scale(Math.max(k, 1.5)).translate(-n.x, -n.y));
  }

  function neighbourhood() {
    const f = state.hovered || state.selected;
    if (!f) return null;
    const near = new Set([f]);
    (adj.get(f) || []).forEach(l => {
      if (!visibleLink(l)) return;
      near.add(nid(l.source)); near.add(nid(l.target));
    });
    return { f: f, near: near };
  }

  function paint() {
    if (!nodeSel) return;
    const nb = neighbourhood();
    const near = nb ? nb.near : null;

    nodeSel
      .attr("display", d => visibleNode(d) ? null : "none")
      .attr("fill", d => d.ghost ? PAL.canvas : col(d))
      .attr("stroke", d => col(d))
      .attr("stroke-dasharray", d => d.ghost ? "2 2" : null)
      .attr("opacity", d => !near ? 1 : (near.has(d.id) ? 1 : 0.12));

    linkSel
      .attr("display", d => visibleLink(d) ? null : "none")
      .attr("stroke", d => (near && near.has(nid(d.source)) && near.has(nid(d.target)))
        ? col(byId.get(nid(d.source))) : PAL.link)
      .attr("stroke-dasharray", d => EVIDENCE[d.ev].dash)
      .attr("stroke-width", d => (near && near.has(nid(d.source)) && near.has(nid(d.target))) ? 2.2 : 1.25)
      .attr("opacity", d => {
        if (!near) return d.ev === "documented" ? 0.8 : 0.68;
        return (near.has(nid(d.source)) && near.has(nid(d.target))) ? 1 : 0.07;
      });

    paintLabels();
    tally();
  }

  function paintLabels() {
    if (!textSel) return;
    const nb = neighbourhood();
    const near = nb ? nb.near : null;
    const showAll = k > 1.65 || state.isoOnly || state.ghostOnly;
    textSel
      .attr("display", d => {
        if (!visibleNode(d)) return "none";
        if (near) return near.has(d.id) ? null : "none";
        if (showAll) return null;
        return (d.deg >= 4 || (d.type !== "person" && d.deg >= 2)) ? null : "none";
      })
      .attr("class", d => "node-label" + (d.deg >= 6 || (nb && d.id === nb.f) ? " big" : ""))
      .attr("fill", d => (nb && d.id === nb.f) ? col(d) : null);
  }

  function tally() {
    const vn = nodes.filter(visibleNode), vl = links.filter(visibleLink);
    document.getElementById("t-nodes").textContent = vn.length;
    document.getElementById("t-edges").textContent = vl.length;
    document.getElementById("t-cross").textContent =
      vl.filter(l => byId.get(nid(l.source)).domain !== byId.get(nid(l.target)).domain).length;
    document.getElementById("t-iso").textContent =
      vn.filter(n => n.type === "person" && n.deg === 0).length;
    document.getElementById("isoN").textContent = isolates.length;
    document.getElementById("ghostN").textContent = ghostList.length;
  }

  /* ---------------- detail panel ---------------- */
  const detail = document.getElementById("detail");

  function select(id) {
    state.selected = id;
    if (id && byId.has(id)) { renderNode(byId.get(id)); focus(id); } else { state.selected = null; renderSummary(); }
    paint();
  }

  function spanText(n) {
    if (!n.span) return "not recorded";
    const a = Math.floor(n.span[0] / 10) * 10, b = Math.floor(n.span[1] / 10) * 10;
    const s = a === b ? a + "s" : a + "s – " + b + "s";
    return s + (n.spanEdited ? " (edited)" : n.spanWB ? " (workbook)" : " (inferred)");
  }

  function renderSummary() {
    const brokers = nodes.filter(n => n.type === "person" && n.deg > 0)
      .map(n => ({ n: n, f: n.fields.size }))
      .sort((a, b) => b.f - a.f || b.n.deg - a.n.deg).slice(0, 8);
    const evRows = Object.keys(EVIDENCE).map(kk => {
      const c = links.filter(l => l.ev === kk).length;
      return '<div style="display:flex;gap:8px;align-items:baseline;font-size:12.5px">' +
        '<b style="font-family:\'IBM Plex Mono\',monospace;font-weight:500;min-width:26px;' +
        'text-align:right">' + c + '</b><span>' + esc(EVIDENCE[kk].label) + '</span></div>';
    }).join("");

    detail.innerHTML = '<div class="panel">' +
      '<div class="sect"><h2>The network at a glance</h2>' +
        '<p class="pnote">Every link is something the workbook already says. The shape is the ' +
        'argument: a dense natural-history cluster, a dense Guardian cluster, and very little ' +
        'holding the rest together.</p></div>' +
      '<div class="sect"><h2>Evidence</h2>' + evRows + '</div>' +
      '<div class="sect"><h2>Who bridges the most fields</h2>' +
        '<p class="hint">People whose links reach across the most fields of activity &mdash; ' +
        'the candidates for how knowledge actually travelled.</p><ul class="brokers">' +
        brokers.map(b => '<li><button data-go="' + b.n.id + '"><span class="bars">' +
          [...b.n.fields].map(f => '<i style="background:' + cssvar(f) + '"></i>').join("") +
          '</span><span>' + esc(b.n.name) + '</span><span class="n">' + b.f +
          '</span></button></li>').join("") + '</ul></div>' +
      '<div class="sect"><h2>Open questions</h2><p class="pnote">' + isolates.length + ' of the ' +
        nodes.filter(n => n.type === "person").length + ' people have no recorded link. ' +
        ghostList.length + ' more are named in the events and relationship text but have no ' +
        'record of their own. Both lists are on the left; fix either in the Spreadsheet tab.' +
      '</p></div></div>';
  }

  function renderNode(n) {
    const es = (adj.get(n.id) || []).slice().sort((a, b) => {
      const r = { documented: 0, verify: 1, interpretive: 2 };
      return r[a.ev] - r[b.ev];
    });
    const rows = es.map(l => {
      const o = byId.get(nid(l.source) === n.id ? nid(l.target) : nid(l.source));
      return '<li><button data-go="' + o.id + '">' +
        '<span class="mark" style="background:' + cssvar(o.domain) + '"></span>' +
        '<span class="rel">' + esc(l.rel) + '</span>' +
        '<span class="who">' + esc(o.name) + '</span>' +
        '<span class="ev">' + esc(EVIDENCE[l.ev].label.toLowerCase()) + '</span></button></li>';
    }).join("");

    detail.innerHTML = '<div class="panel">' +
      '<button class="backbtn" data-go="">&larr; Whole network</button><div>' +
      '<div class="eyebrow"><span class="dot" style="background:' + cssvar(n.domain) + '"></span>' +
        esc(DOMAINS[n.domain].label) + ' &middot; ' + esc(TYPES[n.type].label.replace(/s$/, "")) +
      '</div><h2 class="pname">' + esc(n.name) + '</h2>' +
      (n.dates ? '<p class="pdates">' + esc(n.dates) + '</p>' : "") + '</div>' +
      (n.role && n.role !== "—" ? '<p class="prole">' + esc(n.role) + '</p>' : "") +
      (n.note ? '<p class="pnote">' + esc(n.note) + '</p>' : "") +
      (n.flag ? '<p class="flag"><b>Data note</b><br>' + esc(n.flag) + '</p>' : "") +
      '<dl class="meta">' +
        '<dt>Record</dt><dd>' + (n.sheet && n.sheet !== "—"
          ? '<span style="font-family:\'IBM Plex Mono\',monospace">' + esc(n.sheet) + '</span>'
          : '<em>no row of its own</em>') + '</dd>' +
        '<dt>Active</dt><dd>' + esc(spanText(n)) + '</dd>' +
        '<dt>Links</dt><dd>' + es.length + (es.length ? "" : " &mdash; an open task") + '</dd>' +
        '<dt>Fields</dt><dd>' + [...n.fields].map(f => DOMAINS[f].label).join(", ") + '</dd>' +
      '</dl>' +
      (es.length ? '<div class="sect"><h2>Recorded links</h2><ul class="edges">' + rows + '</ul></div>' : "") +
      '</div>';
  }

  function showLink(l) {
    const a = byId.get(nid(l.source)), b = byId.get(nid(l.target));
    detail.innerHTML = '<div class="panel">' +
      '<button class="backbtn" data-go="">&larr; Whole network</button><div>' +
      '<div class="eyebrow">' + esc(EVIDENCE[l.ev].label) + '</div>' +
      '<h2 class="pname">' + esc(a.name) + '<br><span style="color:var(--ink3);font-size:15px;' +
      'font-family:Archivo,sans-serif;font-weight:400">' + esc(l.rel) + '</span><br>' +
      esc(b.name) + '</h2></div>' +
      '<p class="pnote">' + esc(EVIDENCE[l.ev].note) + '</p>' +
      '<div class="sect"><h2>What the workbook says</h2>' +
        l.note.split("\n").filter(Boolean).map(t => '<p class="pnote">' + esc(t) + '</p>').join("") +
      '</div><div class="sect"><h2>Both ends</h2><ul class="edges">' +
        [a, b].map(o => '<li><button data-go="' + o.id + '">' +
          '<span class="mark" style="background:' + cssvar(o.domain) + '"></span>' +
          '<span class="rel">' + esc(DOMAINS[o.domain].label) + '</span>' +
          '<span class="who">' + esc(o.name) + '</span>' +
          '<span class="ev">' + esc(o.dates || "dates unrecorded") + '</span></button></li>').join("") +
      '</ul></div></div>';
    state.selected = a.id;
    paint();
  }

  detail.addEventListener("click", e => {
    const b = e.target.closest("[data-go]"); if (!b) return;
    select(b.getAttribute("data-go") || null);
  });

  /* ---------------- left rail controls ---------------- */
  function buildChips() {
    document.getElementById("domainChips").innerHTML = Object.keys(DOMAINS).map(kk => {
      const c = nodes.filter(n => n.domain === kk).length;
      return '<button class="chip' + (state.domains.has(kk) ? "" : " off") + '" data-dom="' + kk + '">' +
        '<span class="swatch" style="background:' + cssvar(kk) + '"></span><span>' +
        esc(DOMAINS[kk].label) + '</span><span class="n">' + c + '</span></button>';
    }).join("");
    document.getElementById("typeToggles").innerHTML = Object.keys(TYPES).map(kk => {
      const c = nodes.filter(n => n.type === kk).length;
      return '<button class="tg' + (state.types.has(kk) ? "" : " off") + '" data-type="' + kk +
        '"><span class="glyph">' + GLYPH[kk] + '</span><span>' + esc(TYPES[kk].label) +
        '</span><span class="n">' + c + '</span></button>';
    }).join("");
    document.getElementById("evToggles").innerHTML = Object.keys(EVIDENCE).map(kk => {
      const c = links.filter(l => l.ev === kk).length;
      const dash = EVIDENCE[kk].dash ? ' stroke-dasharray="' + EVIDENCE[kk].dash + '"' : "";
      return '<button class="tg' + (state.evs.has(kk) ? "" : " off") + '" data-ev="' + kk +
        '"><span class="glyph"><svg width="24" height="12" aria-hidden="true"><line x1="1" y1="6" ' +
        'x2="23" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"' + dash +
        '/></svg></span><span>' + esc(EVIDENCE[kk].label) + '</span><span class="n">' + c +
        '</span></button>';
    }).join("");
  }
  const GLYPH = {
    person: '<svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="currentColor"/></svg>',
    org: '<svg width="12" height="12" aria-hidden="true"><rect x="1" y="1" width="10" height="10" rx="2" fill="currentColor"/></svg>',
    place: '<svg width="12" height="12" aria-hidden="true"><path d="M6 0.5 L11.5 6 L6 11.5 L0.5 6 Z" fill="currentColor"/></svg>'
  };

  document.getElementById("domainChips").addEventListener("click", e => {
    const b = e.target.closest("[data-dom]"); if (!b) return;
    const d = b.getAttribute("data-dom");
    state.domains.has(d) ? state.domains.delete(d) : state.domains.add(d);
    b.classList.toggle("off", !state.domains.has(d)); clearGaps(); paint();
  });
  document.getElementById("typeToggles").addEventListener("click", e => {
    const b = e.target.closest("[data-type]"); if (!b) return;
    const t = b.getAttribute("data-type");
    state.types.has(t) ? state.types.delete(t) : state.types.add(t);
    b.classList.toggle("off", !state.types.has(t)); clearGaps(); paint();
  });
  document.getElementById("evToggles").addEventListener("click", e => {
    const b = e.target.closest("[data-ev]"); if (!b) return;
    const v = b.getAttribute("data-ev");
    state.evs.has(v) ? state.evs.delete(v) : state.evs.add(v);
    b.classList.toggle("off", !state.evs.has(v)); paint();
  });

  const isoBtn = document.getElementById("isoBtn"), ghostBtn = document.getElementById("ghostBtn");
  function clearGaps() {
    state.isoOnly = false; state.ghostOnly = false;
    isoBtn.classList.remove("on"); ghostBtn.classList.remove("on");
  }
  isoBtn.onclick = () => { const on = !state.isoOnly; clearGaps(); state.isoOnly = on;
    isoBtn.classList.toggle("on", on); paint(); if (on) fit(); };
  ghostBtn.onclick = () => { const on = !state.ghostOnly; clearGaps(); state.ghostOnly = on;
    ghostBtn.classList.toggle("on", on); paint(); if (on) fit(); };

  /* ---------------- decade slider ---------------- */
  const fromEl = document.getElementById("decFrom"), toEl = document.getElementById("decTo");
  const histEl = document.getElementById("hist"), fillEl = document.getElementById("fill");
  const decLabel = document.getElementById("decLabel"), decMeta = document.getElementById("decMeta");
  const undatedBtn = document.getElementById("undatedBtn");

  document.getElementById("ticks").innerHTML = Array.from({ length: DECN }, (_, i) =>
    '<span>' + (i % 2 === 0 ? decYear(i) : "") + '</span>').join("");

  function drawHist() {
    const max = Math.max.apply(null, hist) || 1;
    histEl.innerHTML = hist.map((c, i) =>
      '<i style="height:' + Math.round(4 + (c / max) * 100) + '%" title="' + decYear(i) +
      's: ' + c + ' active"></i>').join("");
    paintHist();
  }
  function paintHist() {
    const bars = histEl.children;
    for (let i = 0; i < bars.length; i++)
      bars[i].classList.toggle("on", i >= state.from && i <= state.to);
    const a = state.from / (DECN - 1), b = state.to / (DECN - 1);
    fillEl.style.left = "calc((100% - 15px) * " + a + " + 7.5px)";
    fillEl.style.width = "calc((100% - 15px) * " + (b - a) + ")";
    decLabel.textContent = state.from === state.to
      ? decYear(state.from) + "s"
      : decYear(state.from) + "s – " + decYear(state.to) + "s";
    const dated = nodes.filter(n => n.span).length;
    const shown = nodes.filter(n => n.span && inWindow(n)).length;
    decMeta.textContent = shown + " of " + dated + " dated nodes · " +
      (nodes.length - dated) + " undated";
  }
  function decChange(which) {
    let a = +fromEl.value, b = +toEl.value;
    if (a > b) { if (which === "from") b = a; else a = b; fromEl.value = a; toEl.value = b; }
    state.from = a; state.to = b;
    paintHist(); paint();
  }
  fromEl.addEventListener("input", () => decChange("from"));
  toEl.addEventListener("input", () => decChange("to"));
  document.getElementById("decReset").onclick = () => {
    fromEl.value = 0; toEl.value = DECN - 1; state.from = 0; state.to = DECN - 1;
    paintHist(); paint();
  };
  undatedBtn.onclick = () => {
    state.undated = !state.undated;
    undatedBtn.setAttribute("aria-pressed", String(state.undated));
    undatedBtn.textContent = state.undated ? "Keep undated" : "Hide undated";
    paintHist(); paint();
  };

  /* ---------------- search ---------------- */
  const q = document.getElementById("q"), results = document.getElementById("results");
  q.addEventListener("input", () => {
    const v = q.value.trim().toLowerCase();
    if (v.length < 2) { results.classList.remove("on"); results.innerHTML = ""; return; }
    const hits = nodes.filter(n => n.name.toLowerCase().includes(v)
      || (n.role || "").toLowerCase().includes(v)).slice(0, 24);
    results.innerHTML = hits.length ? hits.map(n => '<li><button data-go="' + n.id + '">' +
      '<span class="dot" style="background:' + cssvar(n.domain) + '"></span><span>' +
      esc(n.name) + '</span></button></li>').join("")
      : '<li><button disabled style="color:var(--ink3);cursor:default">No match</button></li>';
    results.classList.add("on");
  });
  results.addEventListener("click", e => {
    const b = e.target.closest("[data-go]"); if (!b) return;
    results.classList.remove("on"); q.value = ""; select(b.getAttribute("data-go"));
  });

  /* ---------------- tabs ---------------- */
  const bodyEl = document.getElementById("body");
  const tabNet = document.getElementById("tabNet"), tabSheet = document.getElementById("tabSheet");
  function setTab(t) {
    state.tab = t;
    tabNet.setAttribute("aria-selected", String(t === "net"));
    tabSheet.setAttribute("aria-selected", String(t === "sheet"));
    bodyEl.classList.toggle("mode-sheet", t === "sheet");
    if (t === "sheet") renderSheet(); else { fit(); paint(); }
  }
  tabNet.onclick = () => setTab("net");
  tabSheet.onclick = () => setTab("sheet");

  /* ---------------- the sheet ---------------- */
  const grid = document.getElementById("grid");
  const segPeople = document.getElementById("segPeople"), segLinks = document.getElementById("segLinks");
  const sheetq = document.getElementById("sheetq");
  const saveFlag = document.getElementById("saveFlag"), saveText = document.getElementById("saveText");
  const notice = document.getElementById("sheetNotice");
  let typingInGrid = false, needsRerender = false;

  function setSave(mode, text) {
    saveMode = mode;
    saveFlag.className = "saveflag " + (mode === "db" ? "live" : mode === "busy" ? "busy" : "off");
    saveText.textContent = text;
  }

  segPeople.onclick = () => { state.sheetTab = "people";
    segPeople.setAttribute("aria-selected", "true"); segLinks.setAttribute("aria-selected", "false");
    renderSheet(); };
  segLinks.onclick = () => { state.sheetTab = "links";
    segLinks.setAttribute("aria-selected", "true"); segPeople.setAttribute("aria-selected", "false");
    renderSheet(); };
  sheetq.addEventListener("input", () => { state.sheetQ = sheetq.value.trim().toLowerCase(); renderSheet(); });

  const P_COLS = [
    ["name", "Name", "mid", "text"], ["type", "Kind", "narrow", "select"],
    ["domain", "Field", "narrow", "select"], ["dates", "Dates", "narrow", "text"],
    ["af", "Active from", "tiny", "num"], ["at", "to", "tiny", "num"],
    ["role", "Role", "mid", "text"], ["note", "Note", "wide", "area"],
    ["flag", "Data note", "wide", "area"]
  ];
  const L_COLS = [
    ["source", "From", "mid", "node"], ["rel", "Relationship", "mid", "text"],
    ["target", "To", "mid", "node"], ["ev", "Evidence", "narrow", "select"],
    ["note", "Note", "wide", "area"]
  ];

  let optCache = "";
  function buildOptCache() {
    optCache = nodes.slice().sort((a, b) => a.name.localeCompare(b.name))
      .map(n => '<option value="' + esc(n.id) + '">' + esc(n.name) + '</option>').join("");
  }

  function cellHtml(row, c) {
    const [field, , , kind] = c;
    const raw = kind === "node" ? nid(row[field]) : row[field];
    const v = raw == null ? "" : raw;
    const ro = "";
    if (kind === "select") {
      const opts = field === "type" ? TYPES : field === "domain" ? DOMAINS : EVIDENCE;
      return '<select class="cell" data-f="' + field + '">' + Object.keys(opts).map(o =>
        '<option value="' + o + '"' + (o === v ? " selected" : "") + '>' +
        esc(opts[o].label) + '</option>').join("") + '</select>';
    }
    if (kind === "node") {
      return '<select class="cell" data-f="' + field + '">' +
        optCache.replace('value="' + esc(v) + '"', 'value="' + esc(v) + '" selected') +
        '</select>';
    }
    if (kind === "area")
      return '<textarea class="cell" rows="1" data-f="' + field + '"' + ro + '>' + esc(v) + '</textarea>';
    if (kind === "num")
      return '<input class="cell" type="number" min="1700" max="2020" step="1" data-f="' +
        field + '" value="' + esc(v) + '"' + ro + '>';
    return '<input class="cell" type="text" data-f="' + field + '" value="' + esc(v) + '"' + ro + '>';
  }

  function renderSheet() {
    if (state.tab !== "sheet") return;
    const isPeople = state.sheetTab === "people";
    if (!isPeople) buildOptCache();
    const cols = isPeople ? P_COLS : L_COLS;
    const qv = state.sheetQ;

    let rows = isPeople ? nodes.slice().sort((a, b) => a.name.localeCompare(b.name))
      : links.slice().sort((a, b) =>
          byId.get(nid(a.source)).name.localeCompare(byId.get(nid(b.source)).name));

    if (qv) rows = rows.filter(r => {
      const hay = isPeople ? [r.name, r.role, r.note, r.flag, r.sheet, r.id]
        : [byId.get(nid(r.source)).name, byId.get(nid(r.target)).name, r.rel, r.note];
      return hay.join(" ").toLowerCase().includes(qv);
    });

    const head = '<thead><tr><th></th>' + cols.map(c => '<th>' + esc(c[1]) + '</th>').join("") +
      (isPeople ? '<th>Record</th>' : "") + '<th></th></tr></thead>';

    const body = '<tbody>' + rows.map(r => {
      const cls = r.origin === "new" ? "added" : r.origin === "edited" ? "edited" : "";
      const mark = r.origin === "new" ? "+" : r.origin === "edited" ? "•" : "";
      return '<tr class="' + cls + '" data-id="' + esc(r.id) + '" data-kind="' +
        (isPeople ? "row" : "edge") + '">' +
        '<td class="rowmark">' + mark + '</td>' +
        cols.map(c => '<td class="' + c[2] + '">' + cellHtml(r, c) + '</td>').join("") +
        (isPeople ? '<td class="idcell">' + esc(r.sheet || "—") + '</td>' : "") +
        '<td><button class="killbtn" data-kill="1" title="Remove this row" ' +
        'aria-label="Remove row">&times;</button></td></tr>';
    }).join("") + '</tbody>';

    grid.innerHTML = head + body;
    grid.querySelectorAll("textarea.cell").forEach(autoGrow);
    needsRerender = false;
  }

  function autoGrow(t) {
    t.style.height = "auto";
    t.style.height = Math.min(t.scrollHeight, 120) + "px";
  }

  const debounced = new Map();
  function queueSave(kind, id, patch) {
    const key = kind + "/" + id;
    clearTimeout(debounced.get(key));
    debounced.set(key, setTimeout(() => commit(kind, id, patch()), 420));
  }

  function commit(kind, id, body) {
    const map = kind === "row" ? rowOv : edgeOv;
    map.set(id, body);
    buildModel(); bindGraph(false); buildChips(); drawHist(); paint();
    if (state.selected && byId.has(state.selected)) renderNode(byId.get(state.selected));
    if (typingInGrid) needsRerender = true; else renderSheet();

    if (db) {
      setSave("busy", "Saving…");
      const coll = kind === "row" ? "rows" : "edges";
      db.doc(coll + "/" + id).set(body)
        .then(() => setSave("db", "Saved for everyone"))
        .catch(err => setSave("none", "Not saved: " + (err && err.code ? err.code : "error")));
    } else { saveLocal(); }
  }

  grid.addEventListener("focusin", e => { if (e.target.closest(".cell")) typingInGrid = true; });
  grid.addEventListener("focusout", () => {
    typingInGrid = false;
    setTimeout(() => { if (needsRerender && !typingInGrid) renderSheet(); }, 60);
  });

  grid.addEventListener("input", e => {
    const cell = e.target.closest(".cell"); if (!cell) return;
    const tr = cell.closest("tr"); if (!tr) return;
    if (cell.tagName === "TEXTAREA") autoGrow(cell);
    const id = tr.getAttribute("data-id"), kind = tr.getAttribute("data-kind");
    queueSave(kind, id, () => {
      const src = kind === "row" ? byId.get(id) : links.find(l => l.id === id);
      const body = kind === "row"
        ? { _op: (rowOv.get(id) || {})._op === "new" ? "new" : "edit",
            name: src.name, type: src.type, domain: src.domain, dates: src.dates,
            role: src.role, note: src.note, flag: src.flag, sheet: src.sheet,
            af: src.af == null ? "" : src.af, at: src.at == null ? "" : src.at }
        : { _op: (edgeOv.get(id) || {})._op === "new" ? "new" : "edit",
            source: nid(src.source), target: nid(src.target), rel: src.rel,
            ev: src.ev, note: src.note };
      tr.querySelectorAll(".cell").forEach(c => {
        const f = c.getAttribute("data-f"); if (!f) return;
        body[f] = (f === "af" || f === "at")
          ? (c.value === "" ? "" : +c.value) : c.value;
      });
      body._at = new Date().toISOString();
      return body;
    });
  });

  grid.addEventListener("click", e => {
    const kill = e.target.closest("[data-kill]"); if (!kill) return;
    const tr = kill.closest("tr");
    const id = tr.getAttribute("data-id"), kind = tr.getAttribute("data-kind");
    commit(kind, id, { _op: "delete", _at: new Date().toISOString() });
  });

  document.getElementById("addRow").onclick = () => {
    const stamp = Date.now().toString(36);
    if (state.sheetTab === "people") {
      const id = "new-" + stamp;
      commit("row", id, { _op: "new", name: "New person", type: "person", domain: "nat",
        dates: "", role: "", note: "", flag: "Added in the workshop — needs a source.",
        sheet: "", af: "", at: "", _at: new Date().toISOString() });
    } else {
      const a = nodes[0], b = nodes[1];
      const id = "new~" + stamp;
      commit("edge", id, { _op: "new", source: a.id, target: b.id,
        rel: "linked to", ev: "verify", note: "Added in the workshop — needs a source.",
        _at: new Date().toISOString() });
    }
    grid.parentElement.scrollTop = 0;
  };

  /* ---------------- export ---------------- */
  function csv(rows) {
    const q2 = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    return rows.map(r => r.map(q2).join(",")).join("\r\n");
  }
  function peopleCsv() {
    return csv([["id","name","type","field","dates","active_from","active_to","role","note",
      "data_note","record_id","links","origin"]].concat(
      nodes.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(n => [n.id, n.name, n.type,
        n.domain, n.dates, n.span ? n.span[0] : "", n.span ? n.span[1] : "", n.role, n.note,
        n.flag, n.sheet, n.deg, n.origin])));
  }
  function linksCsv() {
    return csv([["id","source_id","source","relationship","target_id","target","evidence",
      "note","origin"]].concat(
      links.map(l => [l.id, nid(l.source), byId.get(nid(l.source)).name, l.rel,
        nid(l.target), byId.get(nid(l.target)).name, l.ev, l.note, l.origin])));
  }

  document.getElementById("expCsv").onclick = function () {
    const isPeople = state.sheetTab === "people";
    const data = isPeople ? peopleCsv() : linksCsv();
    const filename = isPeople ? "manchester-people.csv" : "manchester-links.csv";
    if (!dl) { copy(data, this); return; }
    dl.save({ filename: filename, data: data })
      .then(() => flash(this, "Downloaded"))
      .catch(err => {
        if (err && err.code === "declined") return;
        copy(data, this);
      });
  };
  document.getElementById("expJson").onclick = function () {
    copy(JSON.stringify({ nodes: nodes.map(n => ({ id: n.id, name: n.name, type: n.type,
      domain: n.domain, dates: n.dates, span: n.span, role: n.role, note: n.note,
      flag: n.flag, sheet: n.sheet, origin: n.origin })),
      links: links.map(l => ({ source: nid(l.source), target: nid(l.target), rel: l.rel,
        ev: l.ev, note: l.note, origin: l.origin })) }, null, 2), this);
  };
  function copy(text, btn) {
    const done = ok => flash(btn, ok ? "Copied" : "Press Ctrl+C");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => done(true), () => done(false));
    } else {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(true); } catch (e) { done(false); }
      ta.remove();
    }
  }
  function flash(btn, msg) {
    const old = btn.textContent; btn.textContent = msg;
    setTimeout(() => { btn.textContent = old; }, 1600);
  }

  /* ---------------- boot ---------------- */
  loadLocal();
  buildModel();
  bindGraph(true);
  buildChips();
  drawHist();
  renderSummary();
  paint();
  fit();

  let rt;
  window.addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => { if (state.tab === "net") fit(); }, 200);
  });
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onScheme = () => { readPalette(); paint(); };
  if (mq.addEventListener) mq.addEventListener("change", onScheme); else mq.addListener(onScheme);

  setSave("none", "Local to this browser");
  notice.textContent = "Edits are saved in this browser. Use Download CSV to keep a copy — " +
    "that file is what goes back to the repo.";

  /* Shared storage lights up when the viewer answers; the page already works without it. */
  if (window.claude && window.claude.use) {
    window.claude.use("db").then(store => {
      if (!store) {
        setSave("none", "Local to this browser");
        notice.textContent = "Shared editing is off in this version, so edits stay in this " +
          "browser and are lost if site data is cleared. Download the CSV to keep them.";
        return;
      }
      db = store;
      setSave("db", "Saved for everyone");
      notice.classList.add("hide");
      const apply = (map, kind) => snap => {
        snap.docs.forEach(d => { const v = d.data(); if (v) map.set(d.id, v); });
        snap.docChanges().forEach(ch => { if (ch.type === "removed") map.delete(ch.doc.id); });
        buildModel(); bindGraph(false); buildChips(); drawHist(); paint();
        if (state.tab === "sheet") { if (typingInGrid) needsRerender = true; else renderSheet(); }
      };
      const onErr = e => setSave("none", "Sync stopped: " + (e && e.code ? e.code : "error"));
      store.collection("rows").onSnapshot(apply(rowOv, "row"), onErr);
      store.collection("edges").onSnapshot(apply(edgeOv, "edge"), onErr);
    }).catch(() => setSave("none", "Local to this browser"));

    window.claude.use("downloads").then(d => {
      dl = d;
      if (!d) document.getElementById("expCsv").textContent = "Copy CSV";
    }).catch(() => { document.getElementById("expCsv").textContent = "Copy CSV"; });
  }
})();
