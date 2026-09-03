(function () {
  "use strict";

  const DEC0 = 1770, DECN = 15;                       /* 1770s … 1910s */
  const decYear = i => DEC0 + i * 10;
  const nid = x => (x && typeof x === "object") ? x.id : x;
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const cssvar = d => "var(" + (DOMAINS[d] ? DOMAINS[d].css : "--ink3") + ")";
  const has = (o, k) => o && o[k] != null && o[k] !== "";

  /* ---------------- base data ---------------- */
  const BASE_NODES = NODES.map(n => Object.assign({}, n));
  const BASE_LINKS = LINKS.map(l => Object.assign({}, l));

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

  /* ---------------- overrides ---------------- */
  const LS = "wkw.overrides.v2";
  let rowOv = new Map(), edgeOv = new Map();
  let db = null, dl = null;

  function loadLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem(LS) || "{}");
      rowOv = new Map(Object.entries(raw.rows || {}));
      edgeOv = new Map(Object.entries(raw.edges || {}));
    } catch (e) { /* blocked storage: start clean */ }
  }
  function saveLocal() {
    try {
      localStorage.setItem(LS, JSON.stringify({
        rows: Object.fromEntries(rowOv), edges: Object.fromEntries(edgeOv)
      }));
    } catch (e) { /* the in-memory model still works */ }
  }

  /* ---------------- model ---------------- */
  let nodes = [], links = [], byId = new Map(), adj = new Map();
  let isolates = [], ghostList = [], mergedList = [], qcList = [];
  let hist = [];
  const pos = new Map();

  function buildModel() {
    nodes.forEach(n => { if (n.x != null) pos.set(n.id, { x: n.x, y: n.y }); });

    const nm = new Map();
    BASE_NODES.forEach(n => nm.set(n.id, Object.assign({}, n)));
    rowOv.forEach((v, id) => {
      if (v._op === "delete") { nm.delete(id); return; }
      const base = nm.get(id) || { id: id, type: "person", domain: "nat", kindOf: "record" };
      const merged = Object.assign({}, base, v, { id: id });
      delete merged._op; delete merged._at;
      nm.set(id, merged);
    });

    nodes = [...nm.values()].map(n => {
      const p = pos.get(n.id);
      const a = Object.assign({}, n, {
        name: n.name || "(unnamed)",
        label: n.label || n.name || "(unnamed)",
        type: TYPES[n.type] ? n.type : "person",
        domain: DOMAINS[n.domain] ? n.domain : "civic",
        status: STATUS[n.status] ? n.status : "existing",
        priority: PRIORITY[n.priority] ? n.priority : "existing",
        kindOf: n.kindOf || "record",
        deg: 0,
        origin: rowOv.has(n.id) ? (rowOv.get(n.id)._op === "new" ? "new" : "edited") : "base",
        x: p ? p.x : undefined, y: p ? p.y : undefined
      });
      if (has(a, "af") && has(a, "at")) {
        a.span = [+a.af, +a.at]; a.spanSource = "edited";
      } else if (!a.span) {
        a.span = parseSpan(a.dates || a.decades || a.year, a.type);
        a.spanSource = a.span ? "inferred" : "";
      }
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
      .map(l => Object.assign({}, l, {
        source: nid(l.source), target: nid(l.target),
        rel: l.rel || "linked to",
        ev: EVIDENCE[l.ev] ? l.ev : "verify",
        origin: edgeOv.has(l.id) ? (edgeOv.get(l.id)._op === "new" ? "new" : "edited") : "base"
      }));

    nodes.forEach(n => { n.deg = 0; n.fields = new Set([n.domain]); });
    adj = new Map(nodes.map(n => [n.id, []]));
    links.forEach(l => {
      const a = byId.get(l.source), b = byId.get(l.target);
      a.deg++; b.deg++; a.fields.add(b.domain); b.fields.add(a.domain);
      adj.get(a.id).push(l); adj.get(b.id).push(l);
    });

    isolates = nodes.filter(n => n.deg === 0);
    ghostList = nodes.filter(n => n.kindOf === "ghost");
    mergedList = nodes.filter(n => has(n, "mergedFrom"));
    qcList = nodes.filter(n => has(n, "qcFlag"));

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
    families: new Set(Object.keys(FAMILIES)),
    statuses: new Set(Object.keys(STATUS)),
    priorities: new Set(Object.keys(PRIORITY)),
    from: 0, to: DECN - 1, undated: true,
    gap: "", preset: "", selected: null, hovered: null,
    tab: "net", sheetTab: "person", sheetQ: ""
  };

  /* Five ways in, for a reader who does not yet know what they are looking at.
     Each sets the filters and lands on the part of the network it names. */
  const PRESETS = [
    { id: "guardian", title: "Cotton money and the Guardian",
      blurb: "Who paid for the Manchester Guardian, and where the money came from. " +
             "The Little Circle financed the paper; eight of its merchants appear in " +
             "the original loan agreement, and their records describe the cotton trade " +
             "that made them.",
      domains: ["press", "trade"], focus: "COL-009" },
    { id: "herbarium", title: "How the herbarium moved",
      blurb: "Four herbaria built at home, in back rooms and on kitchen tables, ended " +
             "up in one museum. This traces each transfer into the Manchester Museum " +
             "Herbarium, and back out again to the people who made them.",
      domains: ["nat"], focus: "PL-NH-016" },
    { id: "artisans", title: "Artisan botanists and their ground",
      blurb: "Weavers, shoemakers and gardeners who botanised on Sunday. The mosses, " +
             "cloughs and pub back-rooms they met in are here as places, not background.",
      domains: ["nat"], focus: "COL-001" },
    { id: "suffrage", title: "Votes for women",
      blurb: "From Lydia Becker's herbarium to the Manchester National Society for " +
             "Women's Suffrage. Whether her botany led to her politics is a reading " +
             "rather than a fact, so that line is drawn dotted.",
      domains: ["suff", "reform"], focus: "ORG-BASE-005" },
    { id: "slavery", title: "Slavery, for and against",
      blurb: "This collection sorts its people into anti-slavery campaigners and " +
             "pro-slavery interests, and Manchester supplied plenty of both. Several " +
             "families appear near both at once.",
      domains: ["reform", "trade"], focus: "COL-011" }
  ];

  const GAPS = {
    iso: n => n.deg === 0,
    ghost: n => n.kindOf === "ghost",
    merged: n => has(n, "mergedFrom"),
    qc: n => has(n, "qcFlag")
  };

  function inWindow(n) {
    if (!n.span) return state.undated;
    return n.span[0] <= decYear(state.to) + 9 && n.span[1] >= decYear(state.from);
  }
  function visibleNode(n) {
    if (!n) return false;
    if (state.gap) return GAPS[state.gap](n);
    return state.domains.has(n.domain) && state.types.has(n.type)
      && state.statuses.has(n.status) && state.priorities.has(n.priority) && inWindow(n);
  }
  const famOf = l => CONNECTION[l.kind] ? CONNECTION[l.kind].family : "other";
  const relLabel = l => (CONNECTION[l.kind] ? CONNECTION[l.kind].label : l.rel);

  function visibleLink(l) {
    return state.evs.has(l.ev) && state.families.has(famOf(l))
      && visibleNode(byId.get(nid(l.source)))
      && visibleNode(byId.get(nid(l.target)));
  }

  /* ---------------- graph ---------------- */
  const svg = d3.select("#net");
  const plot = document.querySelector(".plot");
  const root = svg.append("g");
  const gLink = root.append("g").attr("fill", "none");
  const gNode = root.append("g");
  const gHit = root.append("g");     /* a target you can actually hit */
  const gText = root.append("g");

  const keys = Object.keys(DOMAINS), anchors = {};
  keys.forEach((k, i) => {
    const a = (i / keys.length) * Math.PI * 2 - Math.PI / 2;
    anchors[k] = { x: Math.cos(a) * 355, y: Math.sin(a) * 275 };
  });
  const anchorOf = d => anchors[d.domain] || { x: 0, y: 0 };
  const rad = d => 3.4 + Math.sqrt(d.deg) * 2.4;

  const sim = d3.forceSimulation()
    .force("link", d3.forceLink().id(d => d.id)
      .distance(l => l.ev === "documented" ? 44 : 62).strength(0.5))
    .force("charge", d3.forceManyBody().strength(d => -100 - d.deg * 18))
    .force("collide", d3.forceCollide(d => rad(d) + 6.5))
    .force("x", d3.forceX(d => anchorOf(d).x).strength(0.07))
    .force("y", d3.forceY(d => anchorOf(d).y).strength(0.07))
    .stop();

  const symbol = d3.symbol();
  const SHAPE = { person: d3.symbolCircle, org: d3.symbolSquare,
                  place: d3.symbolDiamond, event: d3.symbolTriangle };
  function shapeFor(d) {
    const r = rad(d);
    symbol.size(Math.PI * r * r * (d.type === "person" ? 1 : 1.3));
    symbol.type(SHAPE[d.type] || d3.symbolCircle);
    return symbol();
  }
  const DASH = { ghost: "2 2", collective: "4 2", grouping: "4 2", derived: "1 2" };

  let linkSel, nodeSel, hitSel, textSel, lastShape = [-1, -1];
  /* The drawn dot is as small as 7px across. Give every node a target big enough
     for a mouse, and make its name clickable too, since the name is what people aim at. */
  const hitR = d => Math.max(rad(d) + 9, 14);
  /* Event names are whole sentences. Trim what is drawn on the graph; the panel
     carries the full one. */
  const shortLabel = d => d.label.length > 32 ? d.label.slice(0, 30) + "…" : d.label;

  function bindGraph(firstRun) {
    nodes.forEach(n => {
      if (n.x == null) {
        const a = anchorOf(n);
        n.x = a.x + (Math.random() - 0.5) * 70;
        n.y = a.y + (Math.random() - 0.5) * 70;
      }
    });
    sim.nodes(nodes);
    sim.force("link").links(links);

    if (firstRun) {
      for (let i = 0; i < 500; i++) sim.tick();
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

    nodeSel = gNode.selectAll("path").data(nodes, d => d.id).join("path")
      .attr("class", "node")
      .style("pointer-events", "none")
      .attr("d", shapeFor)
      .attr("stroke-width", 1.4)
      .attr("vector-effect", "non-scaling-stroke");

    const grab = d3.drag()
      .on("start", (ev, d) => { if (!ev.active) sim.alphaTarget(0.2).restart(); d.fx = d.x; d.fy = d.y; })
      .on("drag", (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
      .on("end", (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; });

    hitSel = gHit.selectAll("circle").data(nodes, d => d.id).join(
      enter => enter.append("circle").attr("fill", "transparent")
        .style("cursor", "pointer")
        .on("click", (ev, d) => { ev.stopPropagation(); select(d.id); })
        .on("mouseenter", (ev, d) => { state.hovered = d.id; paint(); })
        .on("mouseleave", () => { state.hovered = null; paint(); })
        .call(grab),
      update => update, exit => exit.remove())
      .attr("r", hitR);

    textSel = gText.selectAll("text").data(nodes, d => d.id).join(
      enter => enter.append("text")
        .attr("text-anchor", "middle")
        .on("click", (ev, d) => { ev.stopPropagation(); select(d.id); })
        .on("mouseenter", (ev, d) => { state.hovered = d.id; paint(); })
        .on("mouseleave", () => { state.hovered = null; paint(); })
        .call(grab),
      update => update, exit => exit.remove())
      .attr("class", "node-label")
      .text(shortLabel);

    position();
  }

  sim.on("tick", position);

  function position() {
    if (!linkSel) return;
    linkSel.attr("d", d => "M" + d.source.x + "," + d.source.y + "L" + d.target.x + "," + d.target.y);
    nodeSel.attr("transform", d => "translate(" + d.x + "," + d.y + ")");
    hitSel.attr("cx", d => d.x).attr("cy", d => d.y);
    placeLabels();
  }

  let k = 1;
  const zoom = d3.zoom().scaleExtent([0.2, 4]).on("zoom", ev => {
    k = ev.transform.k; root.attr("transform", ev.transform);
    if (hitSel) hitSel.attr("r", d => Math.min(hitR(d) / k, rad(d) + 26));
    paintLabels();
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
    const s = Math.min(W / (x1 - x0 + 150), H / (y1 - y0 + 150), 1.6) || 1;
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
      d3.zoomIdentity.translate(W / 2, H / 2).scale(Math.max(k, 1.4)).translate(-n.x, -n.y));
  }

  function neighbourhood() {
    const f = state.hovered || state.selected;
    if (!f || !byId.has(f)) return null;
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
      .attr("fill", d => d.kindOf === "record" ? col(d) : PAL.canvas)
      .attr("stroke", d => col(d))
      .attr("stroke-dasharray", d => DASH[d.kindOf] || null)
      .attr("opacity", d => !near ? 1 : (near.has(d.id) ? 1 : 0.11));

    hitSel
      .attr("display", d => visibleNode(d) ? null : "none")
      .attr("r", d => Math.min(hitR(d) / k, rad(d) + 26));

    const lit = d => near && near.has(nid(d.source)) && near.has(nid(d.target));
    linkSel
      .attr("display", d => visibleLink(d) ? null : "none")
      .attr("stroke", d => lit(d) ? col(byId.get(nid(d.source))) : PAL.link)
      .attr("stroke-dasharray", d => EVIDENCE[d.ev].dash)
      .attr("stroke-width", d => lit(d) ? 2.2 : 1.2)
      .attr("opacity", d => !near ? (d.ev === "documented" ? 0.78 : 0.66) : (lit(d) ? 1 : 0.06));

    paintLabels();
    tally();
  }

  function placeLabels() {
    if (!textSel) return;
    const inv = 1 / k;
    textSel.attr("transform", d => "translate(" + d.x + "," + (d.y - rad(d) - 4.5) +
      ") scale(" + inv + ")");
  }

  /* Show every name that fits. Busiest first, and skip any that would land on a name
     already placed - so zooming in spreads the dots apart and uncovers more of them. */
  function paintLabels() {
    if (!textSel) return;
    const nb = neighbourhood();
    const near = nb ? nb.near : null;
    const focused = nb ? nb.f : null;

    const cand = nodes.filter(n => visibleNode(n) && (!near || near.has(n.id)));
    cand.sort((a, b) => (b.id === focused) - (a.id === focused) || b.deg - a.deg);

    const placed = [], show = new Set();
    for (let i = 0; i < cand.length; i++) {
      const nd = cand[i];
      const big = nd.deg >= 8 || nd.id === focused;
      const chars = shortLabel(nd).length;
      const w = chars * (big ? 5.7 : 4.9) + 8;
      const cx = nd.x * k, cy = (nd.y - rad(nd) - 4.5) * k;
      const box = [cx - w / 2, cy - (big ? 13 : 11), cx + w / 2, cy + 3];
      let clash = false;
      for (let j = 0; j < placed.length; j++) {
        const q = placed[j];
        if (box[0] < q[2] && q[0] < box[2] && box[1] < q[3] && q[1] < box[3]) {
          clash = true; break;
        }
      }
      if (clash) continue;
      placed.push(box); show.add(nd.id);
    }

    placeLabels();
    textSel
      .attr("display", d => show.has(d.id) ? null : "none")
      .attr("class", d => "node-label" + (d.deg >= 8 || d.id === focused ? " big" : ""))
      .attr("fill", d => d.id === focused ? col(d) : null);
  }

  function tally() {
    const vn = nodes.filter(visibleNode), vl = links.filter(visibleLink);
    document.getElementById("t-nodes").textContent = vn.length;
    document.getElementById("t-edges").textContent = vl.length;
    document.getElementById("t-cross").textContent =
      vl.filter(l => byId.get(nid(l.source)).domain !== byId.get(nid(l.target)).domain).length;
    document.getElementById("t-iso").textContent = vn.filter(n => n.deg === 0).length;
    document.getElementById("t-todo").textContent = vn.filter(n => n.status === "verify").length;
    document.getElementById("isoN").textContent = isolates.length;
    document.getElementById("ghostN").textContent = ghostList.length;
    document.getElementById("mergedN").textContent = mergedList.length;
    document.getElementById("qcN").textContent = qcList.length;
  }

  /* ---------------- detail panel ---------------- */
  const detail = document.getElementById("detail");

  function select(id) {
    state.selected = id;
    if (id && byId.has(id)) { renderNode(byId.get(id)); focus(id); }
    else { state.selected = null; renderSummary(); }
    paint();
  }

  function spanText(n) {
    if (!n.span) return "not recorded";
    const a = Math.floor(n.span[0] / 10) * 10, b = Math.floor(n.span[1] / 10) * 10;
    return a === b ? a + "s" : a + "s \u2013 " + b + "s";
  }

  function renderSummary() {
    const brokers = nodes.filter(n => n.type === "person" && n.deg > 0)
      .map(n => ({ n: n, f: n.fields.size }))
      .sort((a, b) => b.f - a.f || b.n.deg - a.n.deg).slice(0, 8);
    const evRows = Object.keys(EVIDENCE).map(kk =>
      '<div class="statline"><b>' + links.filter(l => l.ev === kk).length +
      '</b><span>' + esc(EVIDENCE[kk].label) + '</span></div>').join("");
    const span = nodes.filter(n => n.span);
    const first = Math.min.apply(null, span.map(n => n.span[0]));
    const last = Math.max.apply(null, span.map(n => n.span[1]));

    detail.innerHTML = '<div class="panel">' +
      '<div class="sect"><h2>What you are looking at</h2>' +
        '<p class="pnote">Manchester and Salford between ' + first + ' and ' + last +
        ': ' + nodes.filter(n => n.type === "person").length + ' people, ' +
        nodes.filter(n => n.type === "org").length + ' societies, firms and groups, ' +
        nodes.filter(n => n.type === "place").length + ' places and ' +
        nodes.filter(n => n.type === "event").length + ' events, joined by ' +
        links.length + ' connections.</p>' +
        '<p class="pnote">The question underneath it: how did people, specimens and ' +
        'knowledge move between the workplaces, pubs, fields, societies, private ' +
        'collections and museums of a city that was inventing industrial science and ' +
        'industrial poverty at the same time?</p>' +
        '<p class="hint">Pick one of the ways in on the left, or click any shape. ' +
        'Colour is the field someone worked in; shape is what kind of thing it is.</p>' +
      '</div>' +
      '<div class="sect"><h2>Who bridges the most fields</h2>' +
        '<p class="hint">People whose connections reach across the most fields at once — ' +
        'the likeliest carriers of anything that travelled.</p><ul class="brokers">' +
        brokers.map(b => '<li><button data-go="' + esc(b.n.id) + '"><span class="bars">' +
          [...b.n.fields].map(f => '<i style="background:' + cssvar(f) + '"></i>').join("") +
          '</span><span>' + esc(b.n.label) + '</span><span class="n">' + b.f +
          '</span></button></li>').join("") + '</ul></div>' +
      '<div class="sect"><h2>What joins them</h2>' +
        Object.keys(FAMILIES).map(kk => {
          const c = links.filter(l => famOf(l) === kk).length;
          return c ? '<div class="statline"><b>' + c + '</b><span>' +
            esc(FAMILIES[kk].label) + '</span></div>' : "";
        }).join("") +
        '<p class="hint">Marriages, memberships, buildings, specimens changing hands. ' +
        'Filter by these on the left.</p></div>' +
      '<div class="sect"><h2>How sure any of it is</h2>' + evRows +
        '<p class="hint">A solid line is stated in the collection. A dashed one still ' +
        'needs confirming. A dotted one is a reading offered for testing, not a fact.</p>' +
      '</div>' +
      '<details class="prov"><summary>About this collection</summary>' +
        '<p class="hint">Built from a Victorian Manchester natural-history database. ' +
        'Every entry says on its own record where it came from, what was corrected, and ' +
        'what is still to be found out. ' +
        (mergedList.length ? mergedList.length + ' entries absorbed a duplicate. ' : "") +
        (ghostList.length ? ghostList.length + ' people are named in it and cannot be ' +
          'identified; they are drawn hollow. ' : "") +
        (isolates.length ? isolates.length + ' entries have nothing joined to them yet. '
          : 'Everything is joined to something. ') +
        (typeof META !== "undefined" && META.unresolved && META.unresolved.length
          ? 'Three phrases name a milieu rather than a record and could not be joined ' +
            'to anything: ' + META.unresolved.map(u => esc(u.text)).join("; ") + '.'
          : "") +
        '</p></details>' +
      '</div>';
  }
  const FACTS = [
    ["role", "Role"], ["theme", "Theme"], ["orgType", "Kind of body"],
    ["placeType", "Kind of place"], ["founded", "Founded"],
    ["specialism", "Specialism"], ["background", "Background"],
    ["knowledgeRole", "Part they played"], ["politics", "Politics"],
    ["religion", "Religion"], ["building", "Based at"],
    ["areas", "Where"], ["collections", "Collections"],
    ["destination", "Collections now at"], ["scope", "Scope"]
  ];
  const KIND_OF = {
    person: "Person", org: "Society or firm", place: "Place", event: "Event"
  };
  function kindLabel(n) {
    if (n.kindOf === "grouping") return "Theme";
    if (n.kindOf === "collective") return "Group";
    return KIND_OF[n.type] || "Record";
  }
  const SPAN_FROM = {
    workbook: "from the dates in the collection",
    researched: "from dates researched for this page",
    inferred: "worked out from a lifespan",
    estimated: "estimated from what it connects to",
    edited: "edited here"
  };

  function lead(n) {
    /* The one or two sentences that say what this is. */
    const bits = [], seen = [];
    [n.category, n.note, n.role].forEach(t => {
      const key = String(t == null ? "" : t).trim();
      if (!key || seen.indexOf(key) >= 0) return;
      seen.push(key);
      /* a bare label like "Botanist & shoemaker" is a fact, not a description */
      if (key === n.role && key.length < 46) return;
      bits.push(key);
    });
    return bits.map(t => '<p class="pnote">' + esc(t) + '</p>').join("");
  }

  function provenance(n) {
    const rows = [];
    rows.push('<dt>Reference</dt><dd class="mono">' + esc(n.id) + '</dd>');
    if (has(n, "recordType"))
      rows.push('<dt>Kind of entry</dt><dd>' + esc(n.recordType) + '</dd>');
    rows.push('<dt>Dates</dt><dd>' + esc(SPAN_FROM[n.spanSource] || "not recorded") + '</dd>');
    rows.push('<dt>Checked</dt><dd>' + esc(STATUS[n.status].label) + '</dd>');
    if (has(n, "mergedFrom"))
      rows.push('<dt>Absorbed</dt><dd>' + esc(n.mergedFrom) +
        (has(n, "mergeNote") ? '. ' + esc(n.mergeNote) : "") + '</dd>');
    if (has(n, "corrected"))
      rows.push('<dt>Corrected</dt><dd>' + esc(n.corrected) + '</dd>');
    if (has(n, "qcFlag"))
      rows.push('<dt>Flagged</dt><dd>' + esc(n.qcFlag) + '</dd>');
    if (has(n, "sourceNote"))
      rows.push('<dt>On the source</dt><dd>' + esc(n.sourceNote) + '</dd>');
    const src = n.sourceUrl || n.link;
    if (src) rows.push('<dt>Source</dt><dd><a href="' + esc(src) + '" target="_blank" ' +
      'rel="noopener">' + esc(host(src)) + '</a></dd>');
    return '<details class="prov"><summary>About this entry</summary>' +
      '<dl class="meta">' + rows.join("") + '</dl></details>';
  }

  function host(u) {
    return String(u).replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
  }

  /* notes to self about the data are not for a public record */
  const HOUSEKEEPING = new RegExp("\\b(node|record|column|field|flag|dataset|row|duplicat)", "i");
  function readerQuestion(n) {
    return has(n, "openQuestion") && !HOUSEKEEPING.test(n.openQuestion);
  }

  function renderNode(n) {
    const order = { documented: 0, verify: 1, interpretive: 2 };
    const es = (adj.get(n.id) || []).slice().sort((a, b) => order[a.ev] - order[b.ev]);
    const rows = es.map(l => {
      const o = byId.get(nid(l.source) === n.id ? nid(l.target) : nid(l.source));
      return '<li><button data-go="' + esc(o.id) + '">' +
        '<span class="mark" style="background:' + cssvar(o.domain) + '"></span>' +
        '<span class="rel">' + esc(relLabel(l)) + '</span>' +
        '<span class="who">' + esc(o.label) + '</span>' +
        '<span class="ev">' + esc(EVIDENCE[l.ev].label.toLowerCase()) + '</span></button></li>';
    }).join("");

    const when = has(n, "dates") ? n.dates : has(n, "year") ? n.year
      : has(n, "founded") ? n.founded : spanText(n);
    /* anything already said in the heading or the description is not a fact row */
    const said = [n.note, n.category, when];

    const facts = FACTS.filter(r => has(n, r[0]) && said.indexOf(n[r[0]]) < 0 &&
        !(r[0] === "role" && n[r[0]] === n.theme))
      .map(r => '<dt>' + esc(r[1]) + '</dt><dd>' + esc(n[r[0]]) + '</dd>').join("");

    detail.innerHTML = '<div class="panel">' +
      '<button class="backbtn" data-go="">&larr; Whole network</button><div>' +
      '<div class="eyebrow"><span class="dot" style="background:' + cssvar(n.domain) + '"></span>' +
        esc(DOMAINS[n.domain].label) + ' &middot; ' + esc(kindLabel(n)) + '</div>' +
      '<h2 class="pname">' + esc(n.label) + '</h2>' +
      '<p class="pdates">' + esc(when) + '</p></div>' +
      lead(n) +
      (facts ? '<dl class="meta">' + facts + '</dl>' : "") +
      (es.length
        ? '<div class="sect"><h2>Connections</h2><ul class="edges">' + rows + '</ul></div>'
        : '<p class="hint">Nothing in the collection is joined to this yet.</p>') +
      (readerQuestion(n) ? '<p class="ask"><b>Still to find out</b>' +
        esc(n.openQuestion) + '</p>' : "") +
      provenance(n) +
      '</div>';
  }

  function showLink(l) {
    const a = byId.get(nid(l.source)), b = byId.get(nid(l.target));
    detail.innerHTML = '<div class="panel">' +
      '<button class="backbtn" data-go="">&larr; Whole network</button><div>' +
      '<div class="eyebrow">' + esc(FAMILIES[famOf(l)].label) + ' &middot; ' +
        esc(EVIDENCE[l.ev].label) + '</div>' +
      '<h2 class="pname">' + esc(a.label) +
        '<br><span class="joiner">' + esc(relLabel(l)) + '</span><br>' + esc(b.label) + '</h2>' +
      (has(l, "period") ? '<p class="pdates">' + esc(l.period) + '</p>' : "") + '</div>' +
      (has(l, "note") ? '<p class="pnote">' + esc(l.note) + '</p>' : "") +
      '<p class="hint">' +
        (CONNECTION[l.kind] && CONNECTION[l.kind].note
          ? esc(CONNECTION[l.kind].note) + ' ' : "") +
        esc(EVIDENCE[l.ev].note) + '</p>' +
      '<div class="sect"><h2>Both ends</h2><ul class="edges">' +
        [a, b].map(o => '<li><button data-go="' + esc(o.id) + '">' +
          '<span class="mark" style="background:' + cssvar(o.domain) + '"></span>' +
          '<span class="rel">' + esc(DOMAINS[o.domain].label) + '</span>' +
          '<span class="who">' + esc(o.label) + '</span>' +
          '<span class="ev">' + esc(o.dates || o.year || kindLabel(o)) +
          '</span></button></li>').join("") +
      '</ul></div>' +
      (has(l, "followUp") ? '<p class="ask"><b>Still to find out</b>' +
        esc(l.followUp) + '</p>' : "") +
      '<details class="prov"><summary>About this connection</summary><dl class="meta">' +
        (l.relId ? '<dt>Reference</dt><dd class="mono">' + esc(l.relId) + '</dd>' : "") +
        '<dt>Where it comes from</dt><dd>' +
          esc(l.basis || "Added while cleaning the collection.") + '</dd>' +
        (has(l, "sourceUrl") ? '<dt>Source</dt><dd><a href="' + esc(l.sourceUrl) +
          '" target="_blank" rel="noopener">' + esc(host(l.sourceUrl)) + '</a></dd>' : "") +
      '</dl></details></div>';
    state.selected = a.id;
    paint();
  }

  detail.addEventListener("click", e => {
    const pre = e.target.closest("[data-preset]");
    if (pre) { applyPreset(pre.getAttribute("data-preset")); return; }
    const b = e.target.closest("[data-go]"); if (!b) return;
    select(b.getAttribute("data-go") || null);
  });

  /* ---------------- left rail ---------------- */
  const GLYPH = {
    person: '<svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="currentColor"/></svg>',
    org: '<svg width="12" height="12" aria-hidden="true"><rect x="1" y="1" width="10" height="10" rx="2" fill="currentColor"/></svg>',
    place: '<svg width="12" height="12" aria-hidden="true"><path d="M6 0.5 L11.5 6 L6 11.5 L0.5 6 Z" fill="currentColor"/></svg>',
    event: '<svg width="12" height="12" aria-hidden="true"><path d="M6 1 L11.5 11 L0.5 11 Z" fill="currentColor"/></svg>'
  };

  function chip(attr, key, on, glyph, label, count) {
    return '<button class="chip' + (on ? "" : " off") + '" data-' + attr + '="' + key + '">' +
      glyph + '<span>' + esc(label) + '</span><span class="n">' + count + '</span></button>';
  }

  function buildPresets() {
    document.getElementById("presets").innerHTML = PRESETS.map(p =>
      '<button class="preset' + (state.preset === p.id ? " on" : "") +
      '" data-preset="' + p.id + '"><b>' + esc(p.title) + '</b><i>' +
      esc(p.blurb.split(". ")[0]) + '.</i></button>').join("");
  }

  function applyPreset(id) {
    const p = PRESETS.filter(x => x.id === id)[0];
    state.preset = p ? p.id : "";
    clearGaps();
    state.domains = new Set(p ? p.domains : Object.keys(DOMAINS));
    state.types = new Set(Object.keys(TYPES));
    state.evs = new Set(Object.keys(EVIDENCE));
    state.families = new Set(Object.keys(FAMILIES));
    state.statuses = new Set(Object.keys(STATUS));
    state.priorities = new Set(Object.keys(PRIORITY));
    state.from = 0; state.to = DECN - 1;
    fromEl.value = 0; toEl.value = DECN - 1;
    state.selected = null; state.hovered = null;
    buildPresets(); buildChips(); paintHist(); paint();
    if (p) { renderPreset(p); focus(p.focus); } else { renderSummary(); fit(); }
  }

  function renderPreset(p) {
    const vis = nodes.filter(visibleNode).sort((a, b) => b.deg - a.deg).slice(0, 10);
    detail.innerHTML = '<div class="panel">' +
      '<button class="backbtn" data-preset="">&larr; Whole network</button>' +
      '<div><div class="eyebrow">A way in</div>' +
      '<h2 class="pname">' + esc(p.title) + '</h2></div>' +
      '<p class="pnote">' + esc(p.blurb) + '</p>' +
      '<div class="sect"><h2>Busiest here</h2><ul class="brokers">' +
        vis.map(n => '<li><button data-go="' + esc(n.id) + '">' +
          '<span class="dot" style="background:' + cssvar(n.domain) + '"></span>' +
          '<span>' + esc(n.label) + '</span><span class="n">' + n.deg +
          '</span></button></li>').join("") +
      '</ul><p class="hint">Click a name to follow it, or use the filters below to ' +
      'widen the view back out.</p></div></div>';
  }

  function buildChips() {
    document.getElementById("domainChips").innerHTML = Object.keys(DOMAINS).map(kk =>
      chip("dom", kk, state.domains.has(kk),
        '<span class="swatch" style="background:' + cssvar(kk) + '"></span>',
        DOMAINS[kk].label, nodes.filter(n => n.domain === kk).length)).join("");
    document.getElementById("typeToggles").innerHTML = Object.keys(TYPES).map(kk =>
      chip("type", kk, state.types.has(kk), '<span class="glyph">' + GLYPH[kk] + '</span>',
        TYPES[kk].label, nodes.filter(n => n.type === kk).length)).join("");
    document.getElementById("evToggles").innerHTML = Object.keys(EVIDENCE).map(kk => {
      const dash = EVIDENCE[kk].dash ? ' stroke-dasharray="' + EVIDENCE[kk].dash + '"' : "";
      return chip("ev", kk, state.evs.has(kk),
        '<span class="glyph"><svg width="22" height="12" aria-hidden="true"><line x1="1" y1="6" ' +
        'x2="21" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"' + dash +
        '/></svg></span>', EVIDENCE[kk].label, links.filter(l => l.ev === kk).length);
    }).join("");
    document.getElementById("famChips").innerHTML = Object.keys(FAMILIES).map(kk =>
      chip("fam", kk, state.families.has(kk), "", FAMILIES[kk].label,
        links.filter(l => famOf(l) === kk).length)).join("");
    document.getElementById("statusChips").innerHTML = Object.keys(STATUS).map(kk =>
      chip("status", kk, state.statuses.has(kk), "", STATUS[kk].label,
        nodes.filter(n => n.status === kk).length)).join("");
    document.getElementById("priorityChips").innerHTML = Object.keys(PRIORITY).map(kk =>
      chip("priority", kk, state.priorities.has(kk), "", PRIORITY[kk].label,
        nodes.filter(n => n.priority === kk).length)).join("");
  }

  const SETS = { dom: "domains", type: "types", ev: "evs", fam: "families",
                 status: "statuses", priority: "priorities" };
  const ALL = { dom: DOMAINS, type: TYPES, ev: EVIDENCE, fam: FAMILIES,
                status: STATUS, priority: PRIORITY };

  document.querySelector(".rail.left").addEventListener("click", e => {
    const pre = e.target.closest("[data-preset]");
    if (pre) { applyPreset(pre.getAttribute("data-preset")); return; }
    const all = e.target.closest("[data-all]");
    if (all) {
      const g = all.getAttribute("data-all");
      state[SETS[g]] = new Set(Object.keys(ALL[g]));
      clearGaps(); dropPreset(); buildChips(); paint(); return;
    }
    const c = e.target.closest("[data-dom],[data-type],[data-ev],[data-fam],"
      + "[data-status],[data-priority]");
    if (!c) return;
    for (const g in SETS) {
      const v = c.getAttribute("data-" + g);
      if (v == null) continue;
      const set = state[SETS[g]];
      if (set.has(v)) set.delete(v); else set.add(v);
      c.classList.toggle("off", !set.has(v));
      if (g !== "ev" && g !== "fam") { clearGaps(); dropPreset(); }
      paint();
      return;
    }
  });

  const gapBtns = { iso: document.getElementById("isoBtn"),
                    ghost: document.getElementById("ghostBtn"),
                    merged: document.getElementById("mergedBtn"),
                    qc: document.getElementById("qcBtn") };
  function dropPreset() {
    if (!state.preset) return;
    state.preset = "";
    buildPresets();
  }
  function clearGaps() {
    state.gap = "";
    Object.keys(gapBtns).forEach(g => gapBtns[g].classList.remove("on"));
  }
  Object.keys(gapBtns).forEach(g => {
    gapBtns[g].onclick = () => {
      const turnOn = state.gap !== g;
      clearGaps();
      if (turnOn) { state.gap = g; gapBtns[g].classList.add("on"); }
      paint(); fit();
    };
  });

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
    const wb = nodes.filter(n => n.spanSource === "workbook").length;
    decMeta.textContent = shown + " of " + dated + " shown · " +
      wb + " dated by the collection itself, the rest worked out";
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
    paintHist(); paint();
  };

  /* ---------------- search ---------------- */
  const q = document.getElementById("q"), results = document.getElementById("results");
  q.addEventListener("input", () => {
    const v = q.value.trim().toLowerCase();
    if (v.length < 2) { results.classList.remove("on"); results.innerHTML = ""; return; }
    const hits = nodes.filter(n => (n.label + " " + (n.role || "") + " " + (n.category || "") +
      " " + (n.areas || "") + " " + n.id).toLowerCase().indexOf(v) >= 0).slice(0, 26);
    results.innerHTML = hits.length
      ? hits.map(n => '<li><button data-go="' + esc(n.id) + '">' +
        '<span class="dot" style="background:' + cssvar(n.domain) + '"></span><span>' +
        esc(n.label) + '</span><span class="k">' + esc(TYPES[n.type].label.replace(/s$/, "")) +
        '</span></button></li>').join("")
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
    if (t === "sheet") renderSheet(); else { paint(); fit(); }
  }
  tabNet.onclick = () => setTab("net");
  tabSheet.onclick = () => setTab("sheet");

  /* ---------------- the sheet ---------------- */
  const grid = document.getElementById("grid");
  const sheetq = document.getElementById("sheetq");
  const saveFlag = document.getElementById("saveFlag"), saveText = document.getElementById("saveText");
  const notice = document.getElementById("sheetNotice");
  let typingInGrid = false, needsRerender = false;

  function setSave(mode, text) {
    saveFlag.className = "saveflag " + (mode === "db" ? "live" : mode === "busy" ? "busy" : "off");
    saveText.textContent = text;
  }

  document.getElementById("segs").addEventListener("click", e => {
    const b = e.target.closest("[data-seg]"); if (!b) return;
    state.sheetTab = b.getAttribute("data-seg");
    Array.prototype.forEach.call(e.currentTarget.children,
      c => c.setAttribute("aria-selected", String(c === b)));
    renderSheet();
  });
  sheetq.addEventListener("input", () => {
    state.sheetQ = sheetq.value.trim().toLowerCase(); renderSheet();
  });

  /* [field, header, width, kind] */
  const COLS = {
    person: [
      ["name", "Name", "mid", "text"], ["domain", "Field", "narrow", "select:DOMAINS"],
      ["dates", "Dates", "narrow", "text"], ["af", "From", "tiny", "num"],
      ["at", "To", "tiny", "num"], ["gender", "Gender", "tiny", "text"],
      ["role", "Role", "mid", "text"], ["category", "What they did", "wide", "area"],
      ["specialism", "Specialism", "mid", "text"], ["background", "Background", "mid", "text"],
      ["knowledgeRole", "Knowledge role", "mid", "text"],
      ["decades", "Decades active", "narrow", "text"], ["areas", "GM areas", "mid", "text"],
      ["collections", "Collections", "wide", "area"], ["destination", "Now held at", "mid", "text"],
      ["status", "Research status", "mid", "select:STATUS"],
      ["priority", "Priority", "narrow", "select:PRIORITY"],
      ["openQuestion", "Still to find out", "wide", "area"], ["qcFlag", "Data flag", "mid", "area"],
      ["mergedFrom", "Absorbed", "mid", "text"],
      ["corrected", "Corrected here", "wide", "area"],
      ["note", "Note", "wide", "area"], ["link", "Source", "mid", "text"]
    ],
    org: [
      ["name", "Name", "mid", "text"], ["domain", "Field", "narrow", "select:DOMAINS"],
      ["founded", "Founded", "narrow", "text"], ["orgType", "Type", "mid", "text"],
      ["role", "Role in the network", "wide", "area"],
      ["connectedPeople", "Connected people", "wide", "area"],
      ["keyPlaces", "Key places", "mid", "text"],
      ["status", "Research status", "mid", "select:STATUS"],
      ["priority", "Priority", "narrow", "select:PRIORITY"],
      ["openQuestion", "Still to find out", "wide", "area"], ["qcFlag", "Data flag", "mid", "area"],
      ["link", "Source", "mid", "text"]
    ],
    place: [
      ["name", "Name", "mid", "text"], ["domain", "Field", "narrow", "select:DOMAINS"],
      ["placeType", "Type", "mid", "text"], ["founded", "Date", "narrow", "text"],
      ["areas", "GM area", "mid", "text"], ["role", "Why it matters", "wide", "area"],
      ["connectedPeople", "Connected people", "wide", "area"],
      ["connectedOrgs", "Connected organisations", "wide", "area"],
      ["status", "Research status", "mid", "select:STATUS"],
      ["priority", "Priority", "narrow", "select:PRIORITY"],
      ["openQuestion", "Still to find out", "wide", "area"], ["link", "Source", "mid", "text"]
    ],
    event: [
      ["name", "Event", "wide", "area"], ["domain", "Field", "narrow", "select:DOMAINS"],
      ["year", "Year", "narrow", "text"], ["theme", "Theme", "mid", "text"],
      ["keyFigures", "Key figures", "wide", "area"],
      ["connectedOrgs", "Organisation", "mid", "text"],
      ["connectedPlaces", "Place", "mid", "text"],
      ["status", "Research status", "mid", "select:STATUS"],
      ["priority", "Priority", "narrow", "select:PRIORITY"],
      ["scope", "Scope", "mid", "text"], ["note", "What to establish", "wide", "area"],
      ["link", "Source", "mid", "text"]
    ],
    links: [
      ["source", "From", "mid", "node"], ["kind", "Kind", "mid", "select:CONNECTION"],
      ["rel", "As written", "mid", "text"],
      ["target", "To", "mid", "node"], ["ev", "Evidence", "narrow", "select:EVIDENCE"],
      ["period", "Period", "narrow", "text"],
      ["note", "What it says", "wide", "area"],
      ["basis", "Where it comes from", "wide", "area"],
      ["followUp", "Still to find out", "wide", "area"],
      ["sourceUrl", "Source", "mid", "text"]
    ]
  };
  const VOCAB = { DOMAINS: DOMAINS, STATUS: STATUS, PRIORITY: PRIORITY,
                  EVIDENCE: EVIDENCE, CONNECTION: CONNECTION };

  let optCache = "";
  function buildOptCache() {
    optCache = nodes.slice().sort((a, b) => a.label.localeCompare(b.label))
      .map(n => '<option value="' + esc(n.id) + '">' + esc(n.label) + '</option>').join("");
  }

  function cellHtml(row, c) {
    const field = c[0], kind = c[3];
    const raw = kind === "node" ? nid(row[field]) : row[field];
    const v = raw == null ? "" : raw;
    if (kind.indexOf("select:") === 0) {
      const opts = VOCAB[kind.slice(7)];
      return '<select class="cell" data-f="' + field + '">' + Object.keys(opts).map(o =>
        '<option value="' + o + '"' + (o === v ? " selected" : "") + '>' +
        esc(opts[o].label) + '</option>').join("") + '</select>';
    }
    if (kind === "node")
      return '<select class="cell" data-f="' + field + '">' +
        optCache.replace('value="' + esc(v) + '"', 'value="' + esc(v) + '" selected') + '</select>';
    if (kind === "area")
      return '<textarea class="cell" rows="1" data-f="' + field + '">' + esc(v) + '</textarea>';
    if (kind === "num")
      return '<input class="cell" type="number" min="1600" max="2020" step="1" data-f="' +
        field + '" value="' + esc(v) + '">';
    return '<input class="cell" type="text" data-f="' + field + '" value="' + esc(v) + '">';
  }

  function sheetRows() {
    const t = state.sheetTab;
    if (t === "links")
      return links.slice().sort((a, b) =>
        (a.relId ? 0 : 1) - (b.relId ? 0 : 1) ||
        byId.get(nid(a.source)).label.localeCompare(byId.get(nid(b.source)).label));
    if (t === "event")
      return nodes.filter(n => n.type === "event")
        .sort((a, b) => (a.sortYear || 0) - (b.sortYear || 0));
    return nodes.filter(n => n.type === t).sort((a, b) => a.label.localeCompare(b.label));
  }

  function renderSheet() {
    if (state.tab !== "sheet") return;
    const isLinks = state.sheetTab === "links";
    if (isLinks) buildOptCache();
    const cols = COLS[state.sheetTab];

    let rows = sheetRows();
    if (state.sheetQ) rows = rows.filter(r => {
      const hay = isLinks
        ? [byId.get(nid(r.source)).label, byId.get(nid(r.target)).label, r.rel, r.note, r.relId]
        : cols.map(c => r[c[0]]).concat([r.id]);
      return hay.join(" ").toLowerCase().indexOf(state.sheetQ) >= 0;
    });

    const head = '<thead><tr><th></th>' + cols.map(c => '<th>' + esc(c[1]) + '</th>').join("") +
      '<th>' + (isLinks ? "Rel" : "Record") + '</th><th></th></tr></thead>';

    const body = '<tbody>' + rows.map(r => {
      const cls = [r.origin === "new" ? "added" : r.origin === "edited" ? "edited" : "",
        (!isLinks && has(r, "qcFlag")) ? "flagged" : ""]
        .filter(Boolean).join(" ");
      const mark = r.origin === "new" ? "+" : r.origin === "edited" ? "•" : "";
      return '<tr class="' + cls + '" data-id="' + esc(r.id) + '" data-kind="' +
        (isLinks ? "edge" : "row") + '"><td class="rowmark">' + mark + '</td>' +
        cols.map(c => '<td class="' + c[2] + '">' + cellHtml(r, c) + '</td>').join("") +
        '<td class="idcell">' + esc(isLinks ? (r.relId || "—") : r.id) + '</td>' +
        '<td><button class="killbtn" data-kill="1" title="Remove this row" ' +
        'aria-label="Remove row">&times;</button></td></tr>';
    }).join("") + '</tbody>';

    grid.innerHTML = head + body;
    grid.querySelectorAll("textarea.cell").forEach(autoGrow);
    needsRerender = false;
  }

  function autoGrow(t) {
    t.style.height = "auto";
    t.style.height = Math.min(t.scrollHeight, 130) + "px";
  }

  const debounced = new Map();
  function queueSave(kind, id, patch) {
    const key = kind + "/" + id;
    clearTimeout(debounced.get(key));
    debounced.set(key, setTimeout(() => commit(kind, id, patch()), 420));
  }

  function commit(kind, id, body) {
    (kind === "row" ? rowOv : edgeOv).set(id, body);
    buildModel(); bindGraph(false); buildChips(); drawHist(); paint();
    if (state.selected && byId.has(state.selected)) renderNode(byId.get(state.selected));
    if (typingInGrid) needsRerender = true; else renderSheet();

    if (db) {
      setSave("busy", "Saving…");
      db.doc((kind === "row" ? "rows" : "edges") + "/" + id).set(body)
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
    const cols = COLS[state.sheetTab];
    queueSave(kind, id, () => {
      const src = kind === "row" ? byId.get(id) : links.filter(l => l.id === id)[0];
      const prev = (kind === "row" ? rowOv : edgeOv).get(id) || {};
      const body = { _op: prev._op === "new" ? "new" : "edit" };
      cols.forEach(c => { body[c[0]] = src[c[0]] == null ? "" : src[c[0]]; });
      if (kind === "row") {
        body.type = src.type; body.kindOf = src.kindOf;
        body.af = src.af == null ? "" : src.af;
        body.at = src.at == null ? "" : src.at;
      } else {
        body.relId = src.relId || "";
      }
      tr.querySelectorAll(".cell").forEach(c => {
        const f = c.getAttribute("data-f"); if (!f) return;
        body[f] = (f === "af" || f === "at") ? (c.value === "" ? "" : +c.value) : c.value;
      });
      if (kind === "row" && body.name) body.label = body.name;
      if (kind === "edge") { body.source = nid(body.source); body.target = nid(body.target); }
      body._at = new Date().toISOString();
      return body;
    });
  });

  grid.addEventListener("click", e => {
    const kill = e.target.closest("[data-kill]"); if (!kill) return;
    const tr = kill.closest("tr");
    commit(tr.getAttribute("data-kind"), tr.getAttribute("data-id"),
      { _op: "delete", _at: new Date().toISOString() });
  });

  document.getElementById("addRow").onclick = () => {
    const stamp = Date.now().toString(36);
    if (state.sheetTab === "links") {
      const sorted = nodes.slice().sort((a, b) => b.deg - a.deg);
      commit("edge", "NEW~" + stamp, { _op: "new",
        source: sorted[0].id, target: sorted[1].id, rel: "linked to", ev: "verify",
        period: "", note: "Added here — needs a source.", followUp: "",
        _at: new Date().toISOString() });
    } else {
      const t = state.sheetTab;
      const name = "New " + TYPES[t].label.replace(/s$/, "").toLowerCase();
      commit("row", "NEW-" + stamp, { _op: "new", name: name, label: name, type: t,
        domain: "nat", kindOf: "record", status: "verify", priority: "high",
        dates: "", role: "", note: "", af: "", at: "",
        openQuestion: "Added here — needs a source.",
        _at: new Date().toISOString() });
    }
    const wrap = document.querySelector(".tablewrap");
    if (wrap) wrap.scrollTop = 0;
  };

  /* ---------------- export ---------------- */
  function csv(rows) {
    const cell = v => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"';
    return rows.map(r => r.map(cell).join(",")).join("\r\n");
  }
  function tableCsv() {
    const isLinks = state.sheetTab === "links";
    const cols = COLS[state.sheetTab];
    const head = (isLinks ? ["rel_id", "source_id", "target_id"] : ["id"])
      .concat(cols.map(c => c[1].toLowerCase().replace(/[^a-z0-9]+/g, "_")))
      .concat(isLinks ? [] : ["active_from", "active_to", "active_source", "links"]);
    const body = sheetRows().map(r => {
      const lead = isLinks ? [r.relId || "", nid(r.source), nid(r.target)] : [r.id];
      const mid = cols.map(c => c[3] === "node" ? byId.get(nid(r[c[0]])).label : (r[c[0]] || ""));
      const tail = isLinks ? []
        : [(r.span || ["", ""])[0], (r.span || ["", ""])[1], r.spanSource || "", r.deg];
      return lead.concat(mid, tail);
    });
    return csv([head].concat(body));
  }

  document.getElementById("expCsv").onclick = function () {
    const btn = this, data = tableCsv();
    if (!dl) { copy(data, btn); return; }
    dl.save({ filename: "manchester-" + state.sheetTab + ".csv", data: data })
      .then(() => flash(btn, "Downloaded"))
      .catch(err => { if (!(err && err.code === "declined")) copy(data, btn); });
  };
  document.getElementById("expJson").onclick = function () {
    const skip = ["x", "y", "vx", "vy", "fx", "fy", "index", "fields"];
    copy(JSON.stringify({
      built: typeof META !== "undefined" ? META.built : "",
      nodes: nodes.map(n => {
        const o = {};
        Object.keys(n).forEach(kk => { if (skip.indexOf(kk) < 0) o[kk] = n[kk]; });
        return o;
      }),
      links: links.map(l => Object.assign({}, l,
        { source: nid(l.source), target: nid(l.target) }))
    }, null, 2), this);
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
  buildPresets();
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

  setSave("none", "Saved in this browser");
  notice.textContent = "Your edits are kept in this browser and laid over the " +
    "collection — nothing underneath is overwritten. Download CSV takes them out.";

  /* Shared storage lights up only if the viewer's runtime offers it. */
  if (window.claude && window.claude.use) {
    window.claude.use("db").then(store => {
      if (!store) {
        notice.textContent = "Shared editing is off in this version, so your edits stay in this " +
          "browser and are lost if you clear site data. Download the CSV to keep them.";
        return;
      }
      db = store;
      setSave("db", "Saved for everyone");
      notice.classList.add("hide");
      const apply = map => snap => {
        snap.docs.forEach(d => { const v = d.data(); if (v) map.set(d.id, v); });
        snap.docChanges().forEach(ch => { if (ch.type === "removed") map.delete(ch.doc.id); });
        buildModel(); bindGraph(false); buildChips(); drawHist(); paint();
        if (state.tab === "sheet") { if (typingInGrid) needsRerender = true; else renderSheet(); }
      };
      const onErr = e => setSave("none", "Sync stopped: " + (e && e.code ? e.code : "error"));
      store.collection("rows").onSnapshot(apply(rowOv), onErr);
      store.collection("edges").onSnapshot(apply(edgeOv), onErr);
    }).catch(() => setSave("none", "Saved in this browser"));

    window.claude.use("downloads").then(d => {
      dl = d;
      if (!d) document.getElementById("expCsv").textContent = "Copy CSV";
    }).catch(() => { document.getElementById("expCsv").textContent = "Copy CSV"; });
  }
})();
