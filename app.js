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
      blurb: "Four private collections became one museum. The Relationships sheet " +
             "traces each transfer into the Manchester Museum Herbarium, and back out " +
             "again to the collectors who built them.",
      domains: ["nat"], focus: "PL-NH-016" },
    { id: "artisans", title: "Artisan botanists and their ground",
      blurb: "Weavers, shoemakers and gardeners who botanised on Sunday. The mosses, " +
             "cloughs and pub back-rooms they met in are here as places, not background.",
      domains: ["nat"], focus: "COL-001" },
    { id: "suffrage", title: "Votes for women",
      blurb: "From Lydia Becker's herbarium to the Manchester National Society for " +
             "Women's Suffrage. The workbook offers the link between her botany and her " +
             "politics as a hypothesis; it is drawn dotted, for testing.",
      domains: ["suff", "reform"], focus: "ORG-BASE-005" },
    { id: "slavery", title: "Slavery, for and against",
      blurb: "The Category column sorts this collection's people into anti-slavery " +
             "campaigners and pro-slavery interests. Both groups are here, and several " +
             "Manchester families appear near both.",
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

  let linkSel, nodeSel, textSel, lastShape = [-1, -1];

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
      .text(d => d.label.length > 40 ? d.label.slice(0, 38) + "…" : d.label);

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
  const zoom = d3.zoom().scaleExtent([0.2, 4]).on("zoom", ev => {
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

  function paintLabels() {
    if (!textSel) return;
    const nb = neighbourhood();
    const near = nb ? nb.near : null;
    const showAll = k > 1.7 || state.gap;
    textSel
      .attr("display", d => {
        if (!visibleNode(d)) return "none";
        if (near) return near.has(d.id) ? null : "none";
        if (showAll) return null;
        return (d.deg >= 5 || (d.type !== "person" && d.deg >= 3)) ? null : "none";
      })
      .attr("class", d => "node-label" + (d.deg >= 8 || (nb && d.id === nb.f) ? " big" : ""))
      .attr("fill", d => (nb && d.id === nb.f) ? col(d) : null);
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
    const s = a === b ? a + "s" : a + "s – " + b + "s";
    const src = n.spanSource === "edited" ? "edited here"
      : n.spanSource === "workbook" ? "from the workbook's own dates"
      : "inferred from a lifespan";
    return s + " (" + src + ")";
  }

  function renderSummary() {
    const brokers = nodes.filter(n => n.type === "person" && n.deg > 0)
      .map(n => ({ n: n, f: n.fields.size }))
      .sort((a, b) => b.f - a.f || b.n.deg - a.n.deg).slice(0, 8);
    const evRows = Object.keys(EVIDENCE).map(kk =>
      '<div class="statline"><b>' + links.filter(l => l.ev === kk).length +
      '</b><span>' + esc(EVIDENCE[kk].label) + '</span></div>').join("");
    const stRows = Object.keys(STATUS).map(kk => {
      const c = nodes.filter(n => n.status === kk).length;
      return c ? '<div class="statline"><b>' + c + '</b><span>' +
        esc(STATUS[kk].label) + '</span></div>' : "";
    }).join("");
    const relCount = links.filter(l => l.relId).length;

    detail.innerHTML = '<div class="panel">' +
      '<div class="sect"><h2>What you are looking at</h2>' +
        '<p class="pnote">The cleaned workbook drawn as a network: ' +
        nodes.filter(n => n.type === "person").length + ' people, ' +
        nodes.filter(n => n.type === "org").length + ' societies and firms, ' +
        nodes.filter(n => n.type === "place").length + ' places and ' +
        nodes.filter(n => n.type === "event").length + ' dated events. ' +
        relCount + ' of the ' + links.length + ' links come from the workbook’s own ' +
        'Relationships sheet, which names the relationship and rates its evidence; the rest ' +
        'are read out of its Connected people, Key figures, Category and Building columns, '
        + 'or were added in cleaning where a record named something the collection holds.</p>' +
      '</div>' +
      '<div class="sect"><h2>Evidence</h2>' + evRows + '</div>' +
      '<div class="sect"><h2>Research status</h2>' + stRows +
        '<p class="hint">Rows marked <em>Needs checking</em> are the ones still to be confirmed. '
        + 'Filter to them on the left.</p></div>' +
      '<div class="sect"><h2>Who bridges the most fields</h2>' +
        '<p class="hint">People whose links reach across the most fields of activity — ' +
        'the candidates for how knowledge actually travelled.</p><ul class="brokers">' +
        brokers.map(b => '<li><button data-go="' + esc(b.n.id) + '"><span class="bars">' +
          [...b.n.fields].map(f => '<i style="background:' + cssvar(f) + '"></i>').join("") +
          '</span><span>' + esc(b.n.label) + '</span><span class="n">' + b.f +
          '</span></button></li>').join("") + '</ul></div>' +
      '<div class="sect"><h2>Loose ends</h2><p class="pnote">' +
        (isolates.length
          ? isolates.length + ' records still have nothing linked to them. '
          : 'Every record is joined to at least one other. ') +
        ghostList.length + ' people are named by the collection but have no record of their own, ' +
        mergedList.length + ' records absorbed a duplicate, and ' +
        qcList.length + ' carry a data flag. Each is a button on the left.</p></div>' +
      (typeof META !== "undefined" && META.unresolved && META.unresolved.length
        ? '<div class="sect"><h2>Did not resolve</h2><p class="hint">Text the workbook puts ' +
          'in a connection column that matches no record, so no line is drawn: ' +
          META.unresolved.map(u => esc(u.text)).join("; ") + '.</p></div>' : "") +
      '</div>';
  }

  const ROWS = [
    ["role", "Role"], ["theme", "Theme"], ["category", "Category"],
    ["orgType", "Type of body"], ["placeType", "Type of place"], ["founded", "Date"],
    ["gender", "Gender"], ["specialism", "Scientific specialism"],
    ["background", "Background"], ["knowledgeRole", "Knowledge role"],
    ["politics", "Politics"], ["religion", "Religion"], ["building", "Building"],
    ["areas", "Greater Manchester areas"], ["decades", "Decades active"],
    ["collections", "Collections"], ["destination", "Now held at"],
    ["keyFigures", "Key figures"], ["connectedPeople", "Connected people"],
    ["connectedOrgs", "Connected organisations"], ["connectedPlaces", "Places"],
    ["keyPlaces", "Key places"], ["relationships", "Relationships column"],
    ["spouse", "Relationship column"], ["scope", "Scope"],
    ["recordType", "Record type"], ["idStatus", "ID status"], ["sourceId", "Source ID"], ["mergedFrom", "Absorbed"]
  ];

  function renderNode(n) {
    const order = { documented: 0, verify: 1, interpretive: 2 };
    const es = (adj.get(n.id) || []).slice().sort((a, b) => order[a.ev] - order[b.ev]);
    const rows = es.map(l => {
      const o = byId.get(nid(l.source) === n.id ? nid(l.target) : nid(l.source));
      return '<li><button data-go="' + esc(o.id) + '">' +
        '<span class="mark" style="background:' + cssvar(o.domain) + '"></span>' +
        '<span class="rel">' + esc(l.rel) + '</span>' +
        '<span class="who">' + esc(o.label) + '</span>' +
        '<span class="ev">' + esc(EVIDENCE[l.ev].label.toLowerCase()) +
        (l.relId ? " · " + esc(l.relId) : "") + '</span></button></li>';
    }).join("");

    const badges = [];
    if (n.kindOf === "ghost") badges.push('<span class="badge hot">named, no record</span>');
    if (n.kindOf === "collective") badges.push('<span class="badge">a group, not a person</span>');
    if (n.kindOf === "grouping") badges.push('<span class="badge">a heading, not a record</span>');
    if (n.kindOf === "derived") badges.push('<span class="badge">from a column, not a row</span>');
    if (n.status === "verify") badges.push('<span class="badge hot">to verify</span>');
    if (n.priority === "essential") badges.push('<span class="badge go">essential</span>');
    if (has(n, "mergedFrom")) badges.push('<span class="badge">merged</span>');

    const meta = ROWS.filter(r => has(n, r[0]))
      .map(r => '<dt>' + esc(r[1]) + '</dt><dd>' + esc(n[r[0]]) + '</dd>').join("");
    const src = n.sourceUrl || n.link;

    detail.innerHTML = '<div class="panel">' +
      '<button class="backbtn" data-go="">&larr; Whole network</button><div>' +
      '<div class="eyebrow"><span class="dot" style="background:' + cssvar(n.domain) + '"></span>' +
        esc(DOMAINS[n.domain].label) + ' &middot; ' +
        esc(TYPES[n.type].label.replace(/s$/, "")) + '</div>' +
      '<h2 class="pname">' + esc(n.label) + '</h2>' +
      (has(n, "dates") ? '<p class="pdates">' + esc(n.dates) +
        (has(n, "dateQc") ? ' &middot; ' + esc(n.dateQc) : "") + '</p>' : "") +
      (has(n, "year") ? '<p class="pdates">' + esc(n.year) + '</p>' : "") +
      '</div>' +
      (badges.length ? '<div class="badges">' + badges.join("") + '</div>' : "") +
      (has(n, "note") && n.note !== n.role ? '<p class="pnote">' + esc(n.note) + '</p>' : "") +
      (has(n, "mergedFrom") ? '<p class="flag"><b>Absorbed ' + esc(n.mergedFrom) +
        '</b>' + esc(n.mergeNote || "") + '</p>' : "") +
      (has(n, "qcFlag") ? '<p class="flag"><b>Data flag</b>' + esc(n.qcFlag) + '</p>' : "") +
      (has(n, "corrected") ? '<p class="flag"><b>Corrected here</b>' +
        esc(n.corrected) + '</p>' : "") +
      (has(n, "openQuestion") ? '<p class="ask"><b>Open question</b>' +
        esc(n.openQuestion) + '</p>' : "") +
      '<dl class="meta">' +
        '<dt>Record</dt><dd style="font-family:\'IBM Plex Mono\',monospace">' + esc(n.id) + '</dd>' +
        '<dt>Active</dt><dd>' + esc(spanText(n)) + '</dd>' +
        '<dt>Status</dt><dd>' + esc(STATUS[n.status].label) + ' &middot; ' +
          esc(PRIORITY[n.priority].label) + ' priority</dd>' +
        '<dt>Links</dt><dd>' + es.length +
          (es.length ? "" : " — nothing joins it to the rest") + '</dd>' +
        '<dt>Fields</dt><dd>' + [...n.fields].map(f => esc(DOMAINS[f].label)).join(", ") + '</dd>' +
        meta +
        (src ? '<dt>Source</dt><dd><a href="' + esc(src) + '" target="_blank" ' +
          'rel="noopener">' + esc(String(src).replace(/^https?:\/\//, "").slice(0, 44)) +
          '&hellip;</a></dd>' : "") +
      '</dl>' +
      (es.length ? '<div class="sect"><h2>Recorded links</h2><ul class="edges">' +
        rows + '</ul></div>' : "") +
      '</div>';
  }

  function showLink(l) {
    const a = byId.get(nid(l.source)), b = byId.get(nid(l.target));
    detail.innerHTML = '<div class="panel">' +
      '<button class="backbtn" data-go="">&larr; Whole network</button><div>' +
      '<div class="eyebrow">' + esc(EVIDENCE[l.ev].label) +
        (l.relId ? ' &middot; ' + esc(l.relId) : "") + '</div>' +
      '<h2 class="pname">' + esc(a.label) +
        '<br><span style="color:var(--ink3);font-size:14px;font-family:Archivo,sans-serif;' +
        'font-weight:400">' + esc(l.rel) + '</span><br>' + esc(b.label) + '</h2></div>' +
      (has(l, "period") ? '<p class="pdates">' + esc(l.period) + '</p>' : "") +
      '<p class="pnote">' + esc(EVIDENCE[l.ev].note) + '</p>' +
      (has(l, "note") ? '<div class="sect"><h2>What the workbook says</h2>' +
        '<p class="pnote">' + esc(l.note) + '</p></div>' : "") +
      (has(l, "followUp") ? '<p class="ask"><b>Follow-up</b>' +
        esc(l.followUp) + '</p>' : "") +
      (has(l, "sourceUrl") ? '<dl class="meta"><dt>Source</dt><dd><a href="' +
        esc(l.sourceUrl) + '" target="_blank" rel="noopener">' +
        esc(l.sourceUrl.replace(/^https?:\/\//, "").slice(0, 44)) + '&hellip;</a></dd></dl>' : "") +
      '<div class="sect"><h2>Both ends</h2><ul class="edges">' +
        [a, b].map(o => '<li><button data-go="' + esc(o.id) + '">' +
          '<span class="mark" style="background:' + cssvar(o.domain) + '"></span>' +
          '<span class="rel">' + esc(DOMAINS[o.domain].label) + '</span>' +
          '<span class="who">' + esc(o.label) + '</span>' +
          '<span class="ev">' + esc(o.dates || o.year ||
            TYPES[o.type].label.replace(/s$/, "")) + '</span></button></li>').join("") +
      '</ul></div></div>';
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
    document.getElementById("statusChips").innerHTML = Object.keys(STATUS).map(kk =>
      chip("status", kk, state.statuses.has(kk), "", STATUS[kk].label,
        nodes.filter(n => n.status === kk).length)).join("");
    document.getElementById("priorityChips").innerHTML = Object.keys(PRIORITY).map(kk =>
      chip("priority", kk, state.priorities.has(kk), "", PRIORITY[kk].label,
        nodes.filter(n => n.priority === kk).length)).join("");
  }

  const SETS = { dom: "domains", type: "types", ev: "evs",
                 status: "statuses", priority: "priorities" };
  const ALL = { dom: DOMAINS, type: TYPES, ev: EVIDENCE, status: STATUS, priority: PRIORITY };

  document.querySelector(".rail.left").addEventListener("click", e => {
    const pre = e.target.closest("[data-preset]");
    if (pre) { applyPreset(pre.getAttribute("data-preset")); return; }
    const all = e.target.closest("[data-all]");
    if (all) {
      const g = all.getAttribute("data-all");
      state[SETS[g]] = new Set(Object.keys(ALL[g]));
      clearGaps(); dropPreset(); buildChips(); paint(); return;
    }
    const c = e.target.closest("[data-dom],[data-type],[data-ev],[data-status],[data-priority]");
    if (!c) return;
    for (const g in SETS) {
      const v = c.getAttribute("data-" + g);
      if (v == null) continue;
      const set = state[SETS[g]];
      if (set.has(v)) set.delete(v); else set.add(v);
      c.classList.toggle("off", !set.has(v));
      if (g !== "ev") { clearGaps(); dropPreset(); }
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
    decMeta.textContent = shown + " of " + dated + " dated · " +
      (nodes.length - dated) + " undated · " + wb + " dated by the workbook itself";
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
      ["openQuestion", "Open question", "wide", "area"], ["qcFlag", "Data flag", "mid", "area"],
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
      ["openQuestion", "Open question", "wide", "area"], ["qcFlag", "Data flag", "mid", "area"],
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
      ["openQuestion", "Open question", "wide", "area"], ["link", "Source", "mid", "text"]
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
      ["source", "From", "mid", "node"], ["rel", "Relationship", "mid", "text"],
      ["target", "To", "mid", "node"], ["ev", "Evidence", "narrow", "select:EVIDENCE"],
      ["period", "Period", "narrow", "text"],
      ["note", "What the workbook says", "wide", "area"],
      ["followUp", "Follow-up", "wide", "area"],
      ["sourceUrl", "Source", "mid", "text"]
    ]
  };
  const VOCAB = { DOMAINS: DOMAINS, STATUS: STATUS, PRIORITY: PRIORITY, EVIDENCE: EVIDENCE };

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
  notice.textContent = "Edits are saved in this browser and layered over the workbook — " +
    "the rows underneath are never overwritten. Use Download CSV to take your changes out.";

  /* Shared storage lights up only if the viewer's runtime offers it. */
  if (window.claude && window.claude.use) {
    window.claude.use("db").then(store => {
      if (!store) {
        notice.textContent = "Shared editing is off in this version, so edits stay in this " +
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
