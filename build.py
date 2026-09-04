# -*- coding: utf-8 -*-
"""
Builds data.js and the CSV exports from the cleaned edition of
Victorian_Manchester_Natural_History_Cleaned.xlsm.

The transcriptions live in src/*.psv, one file per workbook sheet, in the sheet's own
row order. Two things are derived rather than transcribed, and both are done here in
the open so a reader can check them:

  * `domain` — the colour band. The workbook has no such column; it is assigned per row
    in src/people.psv and src/orgs.psv from the workbook's own ROLE and CATEGORY text.
  * links from the "Connected people" / "Key figures" columns — the workbook writes
    those as free text. They are matched against record names and src/aliases.psv.
    Anything that does not match is left unresolved and reported, not guessed.

The Relationships sheet (src/relationships.psv) is authoritative: where it and a derived
link describe the same pair, the Relationships row's own evidence status wins.

    python build.py
"""
import io, os, re, csv, json, datetime, collections

SRC = "src"

# ---------------------------------------------------------------- URL shorthand
U = {
 "gst":"https://www.theguardian.com/the-scott-trust/ng-interactive/2023/mar/28/the-scott-trust-legacies-of-enslavement-report",
 "gct":"https://www.theguardian.com/news/ng-interactive/2023/mar/28/the-cotton-thread-guardian-founders-slavery-john-edward-taylor",
 "gnm":"https://www.theguardian.com/gnm-archive/2016/apr/01/the-manchester-guardian-agreement-gnm-archive-teaching-resource-april-2016",
 "pure":"https://pure.manchester.ac.uk/ws/portalfiles/portal/86863970/FULL_TEXT.PDF",
 "herb":"https://herbologymanchester.wordpress.com/wp-content/uploads/2017/10/herb_manch-contents-guide.pdf",
 "gut":"https://www.gutenberg.org/cache/epub/47578/pg47578-images.html",
 "ent":"https://www.museum.manchester.ac.uk/collections/entomology",
 "bot":"https://www.museum.manchester.ac.uk/collections/botany",
 "eup":"https://www.euppublishing.com/doi/10.3366/anh.2015.0305",
 "mma":"https://archiveshub.jisc.ac.uk/data/gb133-mma",
 "bal":"https://archiveshub.jisc.ac.uk/data/gb2875-bal",
 "he1406":"https://historicengland.org.uk/listing/the-list/list-entry/1406283",
 "sage":"https://journals.sagepub.com/doi/10.1177/007327539403200302",
 "mmus":"https://www.manchester.ac.uk/about/history-heritage/history/buildings/museum/",
 "exeter":"https://lib-archives.ex.ac.uk/Record.aspx?id=EUL+MS+277&src=CalmView.Catalog",
 "slc":"https://salfordladsclub.org.uk/about/history/",
 "watkin":"https://watkinsociety.org.uk/absalom-watkin.html",
 "collmisc":"https://archiveshub.jisc.ac.uk/data/gb97-collmisc0146",
 "vegsoc":"https://vegsoc.org/who-we-are/history/",
 "mms":"https://www.manchestermicroscopical.org.uk/mmshist.html",
 "nwi":"https://www.northwestinvertebrates.org.uk/document/manchester-entomological-society-annual-reports-proceedings-and-transactions-1904-1963-vols-1-to-61/",
}
def url(s):
    s = (s or "").strip()
    return U.get(s[1:], s) if s.startswith("@") else s

# ---------------------------------------------------------------- vocabularies
DOMAINS = collections.OrderedDict([
 ("nat",   {"label":"Natural history",      "css":"--d-nat"}),
 ("press", {"label":"Press & publishing",   "css":"--d-press"}),
 ("trade", {"label":"Industry & commerce",  "css":"--d-trade"}),
 ("suff",  {"label":"Women's rights",       "css":"--d-suff"}),
 ("reform",{"label":"Reform & abolition",   "css":"--d-reform"}),
 ("civic", {"label":"Civic & institutions", "css":"--d-civic"}),
 ("arts",  {"label":"Arts & performance",   "css":"--d-arts"}),
])
TYPES = collections.OrderedDict([
 ("person",{"label":"People"}), ("org",{"label":"Societies & firms"}),
 ("place", {"label":"Places"}), ("event",{"label":"Events"}),
])
EVIDENCE = collections.OrderedDict([
 ("documented",  {"label":"On the record","dash":None,
                  "note":"Something the collection states outright."}),
 ("verify",      {"label":"Not yet confirmed","dash":"5 3",
                  "note":"Set down here, but nobody has checked it against a source."}),
 ("interpretive",{"label":"A reading","dash":"1.5 3",
                  "note":"An argument the material suggests, put here to be tested "
                         "rather than believed."}),
])
STATUS = collections.OrderedDict([
 ("existing",  {"label":"Core entry"}),
 ("workbook",  {"label":"Background entry"}),
 ("enriched",  {"label":"Core entry, added to"}),
 ("researched",{"label":"Researched for this"}),
 ("verify",    {"label":"Needs checking"}),
])
ST = {"Existing database":"existing","Existing - enriched":"enriched",
      "Researched addition":"researched","Workshop candidate - verify":"verify",
      "Existing workbook":"workbook","Existing / related":"existing","Existing":"existing"}
PRIORITY = collections.OrderedDict([
 ("essential",  {"label":"Essential"}),
 ("high",       {"label":"High"}),
 ("investigate",{"label":"Investigate"}),
 ("existing",   {"label":"Existing"}),
 ("context",    {"label":"Context"}),
])
PR = {"Essential":"essential","High":"high","Investigate":"investigate",
      "Context":"context","Existing":"existing"}
EV = {"Researched":"documented","Needs verification":"verify",
      "Interpretive hypothesis":"interpretive"}
DATEQC = {"P":"Parsed from source","U":"Unknown","A":"Approximate",
          "V":"Various / group record","E":"Death year expanded from abbreviated source"}

# ---------------------------------------------------------------- connection types
FAMILIES = collections.OrderedDict([
 ("kin",      {"label":"Family and household"}),
 ("work",     {"label":"Work and money"}),
 ("science",  {"label":"Science and collecting"}),
 ("belonging",{"label":"Membership and founding"}),
 ("place",    {"label":"Places and buildings"}),
 ("event",    {"label":"Events"}),
 ("other",    {"label":"Named together"}),
])

# ---------------------------------------------------------------- reading
def rows(name, n):
    out = []
    path = os.path.join(SRC, name)
    for ln, raw in enumerate(io.open(path, encoding="utf-8"), 1):
        raw = raw.rstrip("\n").rstrip("\r").replace(u"�", "'").replace(u"’", "'").replace(u"‘", "'")
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        f = [x.strip() for x in raw.split("|")]
        if len(f) != n:
            raise SystemExit("%s line %d: %d fields, expected %d\n  %s"
                             % (path, ln, len(f), n, raw[:120]))
        out.append(f)
    return out

CONNECTION = collections.OrderedDict()
for _k, _label, _fam, _note, _rev in rows("connection-types.psv", 5):
    if _fam not in FAMILIES: raise SystemExit("connection-types: bad family " + _fam)
    CONNECTION[_k] = {"label": _label, "family": _fam, "note": _note,
                      "rev": _rev or _label}

# ---------------------------------------------------------------- decade spans
CENT = re.compile(r"(\d{2})(?:st|nd|rd|th)\s+century", re.I)

def span_from_decades(s):
    """The workbook's own 'Decades active' column, in all the shapes it takes."""
    if not s: return None
    t = s.lower().replace("–", "-").replace("—", "-")
    m = CENT.search(t)
    if m:
        base = (int(m.group(1)) - 1) * 100
        if "early" in t: return [base, base + 39]
        if "late"  in t: return [base + 60, base + 99]
        if "mid"   in t: return [base + 30, base + 69]
        return [base, base + 99]
    nums = re.findall(r"(\d{4}|\d{2})(s?)", t)
    if not nums: return None
    lo = hi = None
    century = None
    for raw, s_suffix in nums:
        if len(raw) == 4:
            y = int(raw); century = (y // 100) * 100
        else:
            if century is None: continue
            y = century + int(raw)
            if lo is not None and y < lo: y += 100      # "1890, 1900s" style roll-over
        end = y + 9 if (s_suffix or len(raw) == 2 or y % 10 == 0) else y
        lo = y if lo is None else min(lo, y)
        hi = end if hi is None else max(hi, end)
    if lo is None: return None
    if hi < lo: hi = lo
    return [lo, min(hi, 1959)]

def span_from_life(birth, death, kind):
    if birth and death:
        b, d = int(birth), int(death)
        return [min(b + 25, d), d] if kind == "person" else [b, d]
    if birth:
        b = int(birth)
        return [b + 25, b + 65] if kind == "person" else [b, 1910]
    if death:
        d = int(death)
        return [d - 40, d]
    return None

# ---------------------------------------------------------------- nodes
nodes = collections.OrderedDict()

def add(node):
    if node["id"] in nodes:
        raise SystemExit("duplicate id: " + node["id"])
    nodes[node["id"]] = node

# people ---------------------------------------------------------------------
for f in rows("people.psv", 16):
    (pid, name, domain, gender, birth, death, datesOrig, dq, role, category,
     relationships, spouse, decades, areas, note, link) = f
    if domain not in DOMAINS: raise SystemExit("bad domain %r on %s" % (domain, pid))
    add({"id": pid, "name": name, "type": "person", "domain": domain,
         "gender": gender, "birth": birth, "death": death, "dates": datesOrig,
         "dateQc": DATEQC.get(dq, dq), "role": role, "category": category,
         "relationships": relationships, "spouse": spouse, "decades": decades,
         "areas": areas, "note": note, "link": url(link),
         "status": "existing", "priority": "existing", "recordType": "Person",
         "sourceId": pid, "kindOf": "record"})

extra = collections.defaultdict(dict)
for pid, key, val in rows("people-extra.psv", 3):
    if pid not in nodes: raise SystemExit("people-extra: unknown id " + pid)
    extra[pid][key] = val
for pid, kv in extra.items():
    n = nodes[pid]
    for k, v in kv.items():
        if   k == "status":   n["status"]   = ST.get(v, "existing")
        elif k == "priority": n["priority"] = PR.get(v, "existing")
        elif k == "sourceUrl": n["sourceUrl"] = url(v)
        else: n[k] = v

# NH-016..NH-026 all carry the same generic verification prompt in the workbook.
for i in range(16, 27):
    n = nodes.get("NH-%03d" % i)
    if not n: continue
    n.setdefault("openQuestion", "Find full identity and relationship evidence.")
    n.setdefault("sourceUrl", U["gut"])
    n["status"], n["priority"] = "verify", "investigate"
    n.setdefault("specialism", "Botany"); n.setdefault("background", "Unknown")
    n.setdefault("knowledgeRole", "Society participant")

# organisations --------------------------------------------------------------
for f in rows("orgs.psv", 13):
    (oid, name, domain, founded, otype, role, people, places, status, priority,
     src, wnote, qc) = f
    add({"id": oid, "name": name, "type": "org", "domain": domain,
         "founded": founded, "orgType": otype, "role": role,
         "connectedPeople": people, "keyPlaces": places,
         "status": ST.get(status, "workbook"), "priority": PR.get(priority, "context"),
         "sourceUrl": url(src), "openQuestion": wnote, "qcFlag": qc,
         "recordType": "Organisation", "sourceId": oid, "kindOf": "record",
         "decades": founded, "note": role, "link": url(src)})

# places ---------------------------------------------------------------------
for f in rows("places.psv", 13):
    (plid, name, domain, ptype, date, area, relevance, people, orgs, status,
     priority, src, question) = f
    add({"id": plid, "name": name, "type": "place", "domain": domain,
         "placeType": ptype, "founded": date, "areas": area, "role": relevance,
         "connectedPeople": people, "connectedOrgs": orgs,
         "status": ST.get(status, "workbook"), "priority": PR.get(priority, "context"),
         "sourceUrl": url(src), "openQuestion": question,
         "recordType": "Place", "sourceId": plid, "kindOf": "record",
         "decades": date, "note": relevance, "link": url(src)})

# timeline events ------------------------------------------------------------
for f in rows("timeline.psv", 13):
    (tid, year, sortYear, event, domain, figures, orgs, places, theme, status,
     scope, src, note) = f
    add({"id": tid, "name": event, "type": "event", "domain": domain,
         "year": year, "sortYear": int(sortYear), "keyFigures": figures,
         "connectedOrgs": orgs, "connectedPlaces": places, "theme": theme,
         "status": ST.get(status, "workbook"),
         "priority": "context" if status == "Existing workbook" else "high",
         "scope": scope, "sourceUrl": url(src), "note": note,
         "recordType": "Event", "sourceId": tid, "kindOf": "record",
         "role": theme, "decades": year, "link": url(src)})

# ghosts and collectives -----------------------------------------------------
RECTYPE = {"ghost": "Named in the workbook, no record of its own",
           "record": "Named in the workbook, researched into a record here",
           "collective": "Group the workbook treats as a single actor",
           "derived": "Stated in a column rather than a row"}
for gid, name, typ, domain, kind, dates, src, note in rows("extra-nodes.psv", 8):
    if typ not in TYPES: typ = "org"
    birth, death = (dates.split("-") + [""])[:2] if dates else ("", "")
    add({"id": gid, "name": name, "type": typ, "domain": domain, "kindOf": kind,
         "note": note, "role": "", "birth": birth, "death": death, "dates": dates,
         "status": "researched" if kind == "record" else "verify",
         "priority": "high" if kind in ("record", "derived") else
                     ("investigate" if kind == "ghost" else "high"),
         "recordType": RECTYPE[kind], "datesResearched": "1" if dates else "",
         "sourceId": "", "link": url(src), "sourceUrl": url(src), "decades": ""})

# Several descriptions end with a note about the source rather than the subject
# ("; Original sheet cites Wikipedia"). That belongs behind the provenance flap.
TRAIL = re.compile(r"\s*[;.]\s*((?:Original (?:workbook|sheet)|final words clipped|"
                   r"PDF source text clipped|Reconstructed|possible )[^;]*?)\s*\.?\s*$", re.I)
for n in nodes.values():
    for field in ("note", "role", "category"):
        v = n.get(field) or ""
        while True:
            m = TRAIL.search(v)
            if not m: break
            piece = m.group(1).strip().rstrip(".") + "."
            if piece not in n.get("sourceNote", ""):
                n["sourceNote"] = (piece + " " + n.get("sourceNote", "")).strip()
            v = v[:m.start()].rstrip(" ;.") + "."
        if v != (n.get(field) or ""): n[field] = v

# ---------------------------------------------------------------- corrections
# The transcription is left exactly as the workbook has it; everything we change goes
# through this file, and lands on the record as a note so a reader can see it.
CORRECT_FIELD = {"name": "name", "area": "areas", "relevance": "role",
                 "connectedPeople": "connectedPeople", "connectedOrgs": "connectedOrgs",
                 "gender": "gender", "kindOf": "kindOf", "note": "note",
                 "domain": "domain", "role": "role", "openQuestion": "openQuestion"}
old_names = {}
for cid, field, value, why in rows("corrections.psv", 4):
    if cid not in nodes: raise SystemExit("corrections: unknown record " + cid)
    if field not in CORRECT_FIELD: raise SystemExit("corrections: unknown field " + field)
    n, f = nodes[cid], CORRECT_FIELD[field]
    if field == "name":
        old_names.setdefault(n["name"], cid)
    if field == "relevance":
        n["note"] = value
    n[f] = value
    n["corrected"] = (n.get("corrected", "") + " " + why).strip()

# ---------------------------------------------------------------- merges
# Records that turned out to be the same thing twice. The survivor absorbs any field the
# dropped record filled in, every link is re-pointed at it, and it carries a note saying
# what was folded in, so a merge is visible rather than silent.
REDIRECT = {}
merge_alias = {}
KEEP_OWN = {"id", "name", "label", "type", "domain", "kindOf", "sourceId", "deg"}
for dead, keeper, reason in rows("merges.psv", 3):
    if dead not in nodes:   raise SystemExit("merges: unknown record " + dead)
    if keeper not in nodes: raise SystemExit("merges: unknown survivor " + keeper)
    d, k = nodes[dead], nodes[keeper]
    for f, v in d.items():
        if f in KEEP_OWN: continue
        if v and not k.get(f): k[f] = v
    k["mergedFrom"] = dead if d["name"] == k["name"] else "%s (%s)" % (d["name"], dead)
    k["mergeNote"] = reason
    merge_alias[d["name"].lower()] = keeper
    REDIRECT[dead] = keeper
    del nodes[dead]

# The duplicate review has been acted on, so its working columns come out of the model.
for n in nodes.values():
    for f in ("dupStatus", "dupGroup", "keeperId", "action", "dupReason"):
        n.pop(f, None)

# ---------------------------------------------------------------- groupings
# The Category column already sorts people into groups; these turn the recurring values
# into nodes so the grouping the spreadsheet makes is visible instead of implied.
GROUPS, membership, used_groups = [], [], collections.OrderedDict()
GROUP_TEXT = {}
for phrase, gid, gname, gdom, desc in rows("groupings.psv", 5):
    if gname: GROUP_TEXT[gid] = (gname, gdom, desc)
    GROUPS.append((phrase, gid) + GROUP_TEXT[gid][:2])
for n in nodes.values():
    if n["type"] != "person" or not n.get("category"): continue
    cat = n["category"].lower()
    for phrase, gid, gname, gdom in GROUPS:
        if phrase.lower() in cat:
            used_groups[gid] = (gname, gdom)
            membership.append((n["id"], gid, phrase))
for gid, (gname, gdom) in used_groups.items():
    add({"id": gid, "name": gname, "type": "org", "domain": gdom, "kindOf": "grouping",
         "note": GROUP_TEXT[gid][2],
         "role": "", "status": "workbook", "priority": "context",
         "recordType": "A heading this collection groups people under",
         "sourceId": "", "link": "", "decades": ""})

# ---------------------------------------------------------------- testimony
# People who work with the material, telling us something about it. Attributed and
# quoted; it belongs on the record it bears on, not in the provenance flap.
for tid, who, when, text, tsrc in rows("testimony.psv", 5):
    if tid not in nodes: raise SystemExit("testimony: unknown record " + tid)
    nodes[tid].setdefault("said", []).append(
        {"who": who, "when": when, "text": text, "url": url(tsrc)})

RESOURCES = [{"name": nm, "url": url(u), "what": what}
             for nm, u, what in rows("resources.psv", 3)]

# ---------------------------------------------------------------- geography
PRECISION = {"site":  "located to a street",
             "area":  "roughly the middle of a district or a landscape",
             "line":  "a point on a river or a canal, not its course",
             "guess": "the source says the location is unverified"}
for pid, lat, lon, prec in rows("places-geo.psv", 4):
    if pid not in nodes: raise SystemExit("places-geo: unknown record " + pid)
    if prec not in PRECISION: raise SystemExit("places-geo: bad precision " + prec)
    n = nodes[pid]
    n["lat"], n["lon"], n["geo"] = float(lat), float(lon), prec

BASEMAP = []
for kind, name, pts in rows("basemap.psv", 3):
    coords = [[float(v) for v in pair.split(",")] for pair in pts.split()]
    BASEMAP.append({"kind": kind, "name": name, "pts": coords})

# ---------------------------------------------------------------- name index
alias = {}
for a, target in rows("aliases.psv", 2):
    alias[a.lower()] = target
alias.update(merge_alias)
for nm, cid in old_names.items():
    alias.setdefault(nm.lower(), cid)

index = collections.defaultdict(list)          # lowercase name -> [ids]
for n in nodes.values():
    index[n["name"].lower()].append(n["id"])

# Fragments that are not records and are not gaps either: bare marital status, and
# the district names the workbook uses as a coarse location rather than a place record.
STOP = {"", "-", "unknown", "various", "others", "and others", "donors", "collectors",
        "museum staff", "subscribers", "members", "married", "unmarried",
        "manchester", "salford", "bury", "eccles", "ashton", "oldham", "trafford",
        "tameside", "wigan", "stockport", "manchester / salford", "manchester area",
        "middleton and others", "manchester and surrounding townships",
        "manchester and regional excursion sites", "north manchester / lancashire",
        "greater manchester", "lancashire", "princess street", "ancoats",
        "manchester, trafford", "manchester; salford", "salford / prestwich"}

TRIM = re.compile(r"\s*(?:and others|and later members|and subscribers|and early artisan botanists"
                  r"|and field naturalists|and regional naturalists|and other artisan botanists"
                  r"|and Salford collectors|\(visited\)|\(linked via textile workers\))\s*$", re.I)

unresolved = collections.Counter()

def resolve(fragment, prefer=None):
    t = re.sub(r"\s+", " ", (fragment or "").strip()).strip(".;")
    t = TRIM.sub("", t).strip()
    if t.lower() in STOP: return None
    if t.lower() in alias: return alias[t.lower()]
    hits = index.get(t.lower())
    if not hits:
        t2 = re.sub(r"\s*\(.*?\)\s*", " ", t).strip()
        hits = index.get(t2.lower())
    if not hits:
        unresolved[t] += 1
        return None
    hits = [REDIRECT.get(h, h) for h in hits]
    if prefer:
        for h in hits:
            if h in nodes and nodes[h]["type"] == prefer: return h
    return hits[0]

def split(s):
    return [p for p in re.split(r"[;]", s or "") if p.strip()]

# names long enough to be worth substring-scanning prose for
SCANNABLE = None
def build_scan_index():
    global SCANNABLE
    SCANNABLE = []
    for n in nodes.values():
        if n["type"] != "person": continue
        nm = n["name"]
        if len(nm) < 8 or " " not in nm: continue
        SCANNABLE.append((re.compile(r"(?<!\w)" + re.escape(nm) + r"(?!\w)"), n["id"]))
    SCANNABLE.sort(key=lambda p: -len(p[0].pattern))

def scan(text, self_id):
    """Find person names inside a prose cell. Longest names first so 'John Edward
    Taylor' is not swallowed by a shorter match."""
    if not text: return []
    found, used = [], []
    for rx, tid in SCANNABLE:
        if tid == self_id: continue
        m = rx.search(text)
        if not m: continue
        if any(m.start() < e and s < m.end() for s, e in used): continue
        if re.search(r"[A-Z][a-z]+ $", text[:m.start()]): continue
        used.append((m.start(), m.end())); found.append((m.group(0), tid, m.start()))
    return found

GROUPISH = re.compile(r"(societ|network|club|association|circle|guild|gathering|"
                      r"botanists|naturalists|collectors|council|union)", re.I)
def looks_like_group(t):
    return bool(GROUPISH.search(t))

# ---------------------------------------------------------------- links
links = collections.OrderedDict()

def key(a, b): return "~".join(sorted([a, b]))

def link(a, b, rel, ev, note, src="", period="", follow="", relId="", basis="",
         kind="associate"):
    """basis is where a link came from; note is what it actually tells you."""
    a, b = REDIRECT.get(a, a), REDIRECT.get(b, b)
    if not a or not b or a == b: return
    if a not in nodes or b not in nodes: return
    k = key(a, b)
    L = links.get(k)
    if L is None:
        if kind not in CONNECTION: raise SystemExit("unknown connection type " + kind)
        links[k] = {"id": k, "source": a, "target": b, "rel": rel, "ev": ev,
                    "kind": kind, "note": note, "basis": basis, "sourceUrl": src,
                    "period": period, "followUp": follow, "relId": relId}
        return
    rank = {"documented": 3, "verify": 2, "interpretive": 1}
    if relId and not L["relId"]:                       # a Relationships row wins outright
        L.update({"rel": rel, "ev": ev, "kind": kind, "note": note, "sourceUrl": src,
                  "period": period, "followUp": follow, "relId": relId,
                  "basis": _join(L.get("basis", ""), basis)})
        return
    if L["kind"] in ("associate", "reading") and kind not in ("associate", "reading"):
        L["kind"], L["rel"] = kind, rel          # anything beats "named alongside"
    elif rel not in L["rel"]:
        L["rel"] += " · " + rel
    L["note"] = _join(L["note"], note)
    L["basis"] = _join(L.get("basis", ""), basis)
    if not L["relId"] and rank[ev] > rank[L["ev"]]: L["ev"] = ev

def _join(a, b):
    if not b or b in a: return a
    return (a + "\n" + b).strip()

FIELD_SITE = re.compile(r"moss|clough|landscape|river|valley|field site|township|"
                        r"wood|moor|garden", re.I)
HOLDING    = re.compile(r"museum|collection|herbarium", re.I)
WORKPLACE  = re.compile(r"educational|medical|office|workplace|institution|school|"
                        r"library|hall|works", re.I)
MEETING    = re.compile(r"pub|meeting", re.I)
KINWORDS = [
 (re.compile(r"\b(wife|husband|married|spouse)\b", re.I), "married"),
 (re.compile(r"\b(sister|brother)\b", re.I), "sibling"),
 (re.compile(r"\b(daughter|son|father|mother)\b(?!-in-law)", re.I), "parentchild"),
 (re.compile(r"in-law|cousin|niece|nephew|aunt|uncle|family", re.I), "kin"),
]
ROLEWORDS = [
 (re.compile(r"founder|founded|co-founder", re.I), "founded"),
 (re.compile(r"president|secretary|chair|curator|keeper|editor", re.I), "led"),
]

def kin_kind(prose, fallback="associate"):
    for rx, k in KINWORDS:
        if rx.search(prose or ""): return k
    return fallback

def belong_kind(target, prose=""):
    """A person joined to an organisation: how, as far as the source lets us say."""
    t = nodes[target]
    if t.get("kindOf") in ("collective", "grouping"): return "partof"
    for rx, k in ROLEWORDS:
        if rx.search(prose or ""): return k
    return "member"

def place_kind(target):
    """A person joined to a place: what they were doing there."""
    t = nodes[target]
    pt = (t.get("placeType") or "") + " " + t["name"]
    if MEETING.search(pt):   return "metat"
    if FIELD_SITE.search(pt): return "collectedat"
    if HOLDING.search(pt):   return "heldat"
    if WORKPLACE.search(pt): return "workedat"
    return "basedat"

def pair_kind(a, b, prose=""):
    """The type a connection gets when the source names it without saying what it is."""
    ta, tb = nodes[a]["type"], nodes[b]["type"]
    if ta == "person" and tb == "person": return kin_kind(prose)
    if "org" in (ta, tb):
        person, org = (a, b) if ta == "person" else (b, a)
        if ta == "person" or tb == "person": return belong_kind(org, prose)
        if "place" in (ta, tb): return "basedat"
        return "partof"
    if ta == "person" and tb == "place": return place_kind(b)
    if tb == "person" and ta == "place": return place_kind(a)
    if ta == "place" and tb == "place":  return "nearby"
    return "associate"

# derived: how confident the workbook is about the row the connection came from
def ev_for(n):
    return "verify" if n["status"] == "verify" else "documented"

build_scan_index()

def kinded(a, b, kind, ev, src, basis, note=""):
    """Every derived link is typed, and takes its wording from the type."""
    link(a, b, CONNECTION[kind]["label"], ev, note, src, basis=basis, kind=kind)

for n in list(nodes.values()):
    if n["type"] == "person":
        # The Relationships and Relationship/wife columns are prose, not lists, so scan
        # them for names we hold rather than chopping the sentence into fragments.
        prose = n.get("relationships", "")
        for hit, tid, at in scan(prose, n["id"]):
            near = prose[prose.rfind(";", 0, at) + 1:at]   # its own clause, no further
            kinded(n["id"], tid, pair_kind(n["id"], tid, near or prose), ev_for(n),
                   n.get("link", ""),
                   "Relationships column for " + n["name"] + ": " + prose)
        for frag in split(prose):
            f2 = TRIM.sub("", frag.strip()).strip(".;")
            if f2 and not scan(frag, n["id"]) and looks_like_group(f2):
                tgt = resolve(frag)
                if tgt:
                    kinded(n["id"], tgt, pair_kind(n["id"], tgt, frag), ev_for(n),
                           n.get("link", ""),
                           "Relationships column for " + n["name"] + ": " + frag.strip())
        sp = n.get("spouse", "")
        if sp and not sp.startswith("http"):
            for hit, tid, at in scan(sp, n["id"]):
                kinded(n["id"], tid, kin_kind(sp[sp.rfind(";", 0, at) + 1:at] or sp,
                                             "married"),
                       "documented",
                       n.get("link", ""), "Relationship column: " + sp)
        if n.get("building"):
            tgt = resolve(n["building"], prefer="place")
            if tgt:
                kinded(n["id"], tgt, "basedat", "documented", n.get("link", ""),
                       "Building column: " + n["building"])
        if "Little Circle" in n.get("note", ""):
            kinded(n["id"], "COL-009", "member", "documented", n.get("link", ""),
                   "Named in the Notes column as one of the Little Circle: " + n["note"])
    elif n["type"] == "org":
        for frag in split(n.get("connectedPeople", "")):
            tgt = resolve(frag, prefer="person")
            if tgt:
                kinded(tgt, n["id"], pair_kind(tgt, n["id"], frag), ev_for(n),
                       n.get("sourceUrl", ""),
                       "Connected people column for " + n["name"] + ": " + frag.strip())
        for frag in split(n.get("keyPlaces", "")):
            tgt = resolve(frag, prefer="place")
            if tgt:
                kinded(n["id"], tgt, "metat", ev_for(n), n.get("sourceUrl", ""),
                       "Key places column for " + n["name"] + ": " + frag.strip())
    elif n["type"] == "place":
        for frag in split(n.get("connectedPeople", "")):
            tgt = resolve(frag, prefer="person")
            if tgt:
                kinded(tgt, n["id"], place_kind(n["id"]), ev_for(n),
                       n.get("sourceUrl", ""),
                       "Connected people column for " + n["name"] + ": " + frag.strip())
        for frag in split(n.get("connectedOrgs", "")):
            tgt = resolve(frag, prefer="org")
            if tgt:
                kinded(tgt, n["id"], place_kind(n["id"]), ev_for(n),
                       n.get("sourceUrl", ""),
                       "Connected organisations column for " + n["name"] + ": " + frag.strip())
    elif n["type"] == "event":
        for frag in split(n.get("keyFigures", "")):
            tgt = resolve(frag, prefer="person")
            if tgt:
                kinded(tgt, n["id"], "tookpart", ev_for(n), n.get("sourceUrl", ""),
                       "Key figures column for " + n["year"] + ": " + frag.strip())
        for frag in split(n.get("connectedOrgs", "")):
            tgt = resolve(frag, prefer="org")
            if tgt:
                kinded(n["id"], tgt, "organisedby", ev_for(n), n.get("sourceUrl", ""),
                       "Organisation column for " + n["year"] + ": " + frag.strip())
        for frag in split(n.get("connectedPlaces", "")):
            tgt = resolve(frag, prefer="place")
            if tgt:
                kinded(n["id"], tgt, "happenedat", ev_for(n), n.get("sourceUrl", ""),
                       "Place column for " + n["year"] + ": " + frag.strip())

# ---------------------------------------------------------------- contributions
# Anything sent in on the contribution sheet. Kept apart from the transcription, and
# marked on the page as contributed and unconfirmed until somebody checks it.
CONTRIB_TYPE = {"person": "person", "society": "org", "org": "org",
                "place": "place", "event": "event"}
CONTRIB_EV = {"yes": "documented", "no": "verify", "reading": "interpretive"}
CONTRIB_KIND = {}
for _k, _c in CONNECTION.items():
    CONTRIB_KIND[_c["label"].lower()] = _k
    CONTRIB_KIND[_k.lower()] = _k
    if _c.get("rev"): CONTRIB_KIND.setdefault(_c["rev"].lower(), _k)

contrib_rows = rows("contributions.psv", 13)
contributed = 0
for what, name, frm, to, how, field, dates, did, where, sure, csrc, by, cnote in contrib_rows:
    what = what.lower().strip()
    if what in CONTRIB_TYPE:
        cid = "CON-" + re.sub(r"[^A-Za-z0-9]+", "-", name).strip("-").upper()[:28]
        if cid in nodes: raise SystemExit("contributions: %s is already here" % name)
        lat = lon = None
        if re.match(r"^\s*-?\d+\.\d+\s*,\s*-?\d+\.\d+\s*$", where or ""):
            lat, lon = [float(v) for v in where.split(",")]
        n = {"id": cid, "name": name, "type": CONTRIB_TYPE[what],
             "domain": field if field in DOMAINS else "civic", "kindOf": "record",
             "note": did, "role": "", "dates": dates, "decades": dates,
             "areas": "" if lat is not None else where,
             "status": "verify", "priority": "high",
             "recordType": "Contributed, not yet confirmed",
             "contributedBy": by, "sourceId": "", "link": url(csrc),
             "sourceUrl": url(csrc), "openQuestion": cnote,
             "datesResearched": "1" if dates else ""}
        if lat is not None:
            n["lat"], n["lon"], n["geo"] = lat, lon, "site"
        add(n)
        alias[name.lower()] = cid
        contributed += 1

for what, name, frm, to, how, field, dates, did, where, sure, csrc, by, cnote in contrib_rows:
    if what.lower().strip() != "connection": continue
    a = resolve(frm) or (frm if frm in nodes else None)
    b = resolve(to) or (to if to in nodes else None)
    if not a or not b:
        raise SystemExit("contributions: cannot place %r - %r" % (frm, to))
    kind = CONTRIB_KIND.get((how or "").strip().lower(), "associate")
    link(a, b, how or CONNECTION[kind]["label"], CONTRIB_EV.get(sure.lower(), "verify"),
         did, url(csrc), dates, cnote, kind=kind,
         basis="Contributed by " + (by or "a reader") + ", not yet confirmed.")
    contributed += 1

# the Relationships sheet, last so it wins
rel_rows = rows("relationships.psv", 10)
for rid, a, typ, b, period, summary, src, ev, follow, kind in rel_rows:
    for end in (a, b):
        if end not in nodes: raise SystemExit("%s: unknown endpoint %r" % (rid, end))
    link(a, b, typ, EV.get(ev, "verify"), summary, url(src), period, follow, rid,
         basis="Relationships sheet, row " + rid, kind=kind)

# the Category column's own groupings
for pid, gid, phrase in membership:
    link(pid, gid, CONNECTION["groupedunder"]["label"], "documented", "",
         nodes[pid].get("link", ""), kind="groupedunder",
         basis="Filed under “%s” in the source's own Category column: %s"
               % (phrase, nodes[pid].get("category", "")))

# links added here, where a record named something the workbook holds but no column
# carried the connection. Each one says what it rests on.
for a, rel, b, ev, note, src, kind in rows("added-links.psv", 7):
    for end in (a, b):
        if REDIRECT.get(end, end) not in nodes:
            raise SystemExit("added-links: unknown record %r" % end)
    if ev not in EVIDENCE: raise SystemExit("added-links: bad evidence %r" % ev)
    if kind not in CONNECTION: raise SystemExit("added-links: bad type %r" % kind)
    link(a, b, rel, ev, "", url(src), basis=note, kind=kind)

# ---------------------------------------------------------------- spans, degree
for n in nodes.values():
    if n["type"] == "event":
        n["span"], n["spanSource"] = [n["sortYear"], n["sortYear"]], "workbook"
    else:
        s = span_from_decades(n.get("decades", ""))
        if s:
            n["span"] = s
            n["spanSource"] = "researched" if n.get("datesResearched") else "workbook"
        else:
            s = span_from_life(n.get("birth", ""), n.get("death", ""), n["type"])
            n["span"] = s
            n["spanSource"] = ("researched" if n.get("datesResearched")
                               else "inferred") if s else ""

# A grouping, a collective or a ghost has no dates of its own. Give it the span of the
# records attached to it, so it moves with them on the decade slider instead of vanishing.
neighbours = collections.defaultdict(list)
for L in links.values():
    neighbours[L["source"]].append(L["target"])
    neighbours[L["target"]].append(L["source"])
for _ in range(2):
    for n in nodes.values():
        if n.get("span"): continue
        spans = [nodes[o]["span"] for o in neighbours.get(n["id"], [])
                 if o in nodes and nodes[o].get("span")]
        if not spans: continue
        n["span"] = [min(s[0] for s in spans), max(s[1] for s in spans)]
        n["spanSource"] = "estimated"

# Anyone whose activity begins after 1930 is outside the period this collection covers.
CUTOFF = 1930
dropped = [n for n in nodes.values() if n.get("span") and n["span"][0] > CUTOFF]
for n in dropped:
    del nodes[n["id"]]
for k in [k for k, L in links.items()
          if L["source"] not in nodes or L["target"] not in nodes]:
    del links[k]

deg = collections.Counter()
for L in links.values():
    deg[L["source"]] += 1; deg[L["target"]] += 1
for n in nodes.values():
    n["deg"] = deg[n["id"]]

# disambiguate identical labels (the duplicate-record pairs)
byname = collections.defaultdict(list)
for n in nodes.values(): byname[n["name"]].append(n)
for name, group in byname.items():
    if len(group) > 1:
        for n in group: n["label"] = "%s (%s)" % (name, n["id"])
for n in nodes.values(): n.setdefault("label", n["name"])

# ---------------------------------------------------------------- emit
def js(o): return json.dumps(o, ensure_ascii=False, separators=(",", ":"))

FIELDS = ["id","label","name","type","domain","kindOf","lat","lon","geo","gender","birth","death","dates",
          "dateQc","role","category","relationships","spouse","decades","areas","note",
          "link","specialism","background","knowledgeRole","collections","destination",
          "politics","religion","building","status","priority","sourceUrl","openQuestion",
          "qcFlag","corrected","sourceNote","contributedBy","said","recordType","sourceId","idStatus","mergedFrom","mergeNote","founded","orgType","placeType","connectedPeople",
          "connectedOrgs","connectedPlaces","keyPlaces","keyFigures","year","sortYear",
          "theme","scope","span","spanSource","deg"]

out = io.open("data.js", "w", encoding="utf-8", newline="\n")
out.write("/* Victorian Manchester natural-history workbook, cleaned edition.\n"
          "   GENERATED by build.py from src/*.psv - do not hand-edit.\n"
          "   Built %s. */\n\n" % datetime.date.today().isoformat())
for name, obj in (("DOMAINS", DOMAINS), ("TYPES", TYPES), ("EVIDENCE", EVIDENCE),
                  ("FAMILIES", FAMILIES), ("CONNECTION", CONNECTION),
                  ("STATUS", STATUS), ("PRIORITY", PRIORITY)):
    out.write("const %s = %s;\n\n" % (name, js(obj)))

out.write("const NODES = [\n")
for n in nodes.values():
    rec = {k: n[k] for k in FIELDS if n.get(k) not in (None, "", [])}
    out.write(js(rec) + ",\n")
out.write("];\n\n")

out.write("const LINKS = [\n")
for L in links.values():
    rec = {k: v for k, v in L.items() if v not in (None, "", [])}
    out.write(js(rec) + ",\n")
out.write("];\n\n")

counts = collections.Counter(n["type"] for n in nodes.values())
meta = {"built": datetime.date.today().isoformat(),
        "source": "Victorian_Manchester_Natural_History_Cleaned.xlsm",
        "counts": dict(counts), "links": len(links),
        "relationshipRows": len(rel_rows),
        "unresolved": [{"text": t, "n": c} for t, c in unresolved.most_common()]}
out.write("const BASEMAP = %s;\n\n" % js(BASEMAP))
out.write("const RESOURCES = %s;\n\n" % js(RESOURCES))
out.write("const META = %s;\n" % js(meta))
out.close()

# ---------------------------------------------------------------- CSVs
def write_csv(path, header, body):
    with io.open(path, "w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh); w.writerow(header); w.writerows(body)

people = [n for n in nodes.values() if n["type"] == "person"]
write_csv("people.csv",
  ["id","name","kind","field","gender","birth","death","dates_original","date_qc","role",
   "category","specialism","background","knowledge_role","decades_active","gm_areas",
   "collections","destination","politics","religion","building","note","relationships",
   "record_type","source_id","merged_from","merge_note",
   "research_status","priority","open_question","qc_flag",
   "active_from","active_to","active_source","links","link"],
  [[n["id"],n["name"],n.get("kindOf",""),n["domain"],n.get("gender",""),n.get("birth",""),
    n.get("death",""),n.get("dates",""),n.get("dateQc",""),n.get("role",""),
    n.get("category",""),n.get("specialism",""),n.get("background",""),
    n.get("knowledgeRole",""),n.get("decades",""),n.get("areas",""),
    n.get("collections",""),n.get("destination",""),n.get("politics",""),
    n.get("religion",""),n.get("building",""),n.get("note",""),n.get("relationships",""),
    n.get("recordType",""),n.get("sourceId",""),n.get("mergedFrom",""),n.get("mergeNote",""),
    STATUS[n["status"]]["label"],
    PRIORITY[n["priority"]]["label"],n.get("openQuestion",""),n.get("qcFlag",""),
    (n["span"] or ["",""])[0],(n["span"] or ["",""])[1],n.get("spanSource",""),
    n["deg"],n.get("link","")] for n in sorted(people, key=lambda x: x["name"])])

write_csv("links.csv",
  ["relationship_id","source_id","source","relationship","target_id","target","evidence",
   "connection_type","connection_group","period","evidence_summary","basis",
   "follow_up","source_url"],
  [[L.get("relId",""),L["source"],nodes[L["source"]]["label"],L["rel"],L["target"],
    nodes[L["target"]]["label"],EVIDENCE[L["ev"]]["label"],
    CONNECTION[L["kind"]]["label"],FAMILIES[CONNECTION[L["kind"]]["family"]]["label"],
    L.get("period",""),
    L["note"].replace("\n"," / "),L.get("basis","").replace("\n"," / "),
    L.get("followUp",""),L.get("sourceUrl","")]
   for L in links.values()])

write_csv("places.csv",
  ["id","name","field","place_type","date","gm_area","natural_history_relevance",
   "connected_people","connected_organisations","latitude","longitude","location_precision","research_status","priority",
   "open_question","links","source_url"],
  [[n["id"],n["name"],n["domain"],n.get("placeType",""),n.get("founded",""),
    n.get("areas",""),n.get("role",""),n.get("connectedPeople",""),
    n.get("connectedOrgs",""),n.get("lat",""),n.get("lon",""),n.get("geo",""),
    STATUS[n["status"]]["label"],PRIORITY[n["priority"]]["label"],
    n.get("openQuestion",""),n["deg"],n.get("sourceUrl","")]
   for n in nodes.values() if n["type"] == "place"])

write_csv("organisations.csv",
  ["id","name","field","founded","type","role_in_network","connected_people","key_places",
   "research_status","priority","open_question","qc_flag","links","source_url"],
  [[n["id"],n["name"],n["domain"],n.get("founded",""),n.get("orgType",""),n.get("role",""),
    n.get("connectedPeople",""),n.get("keyPlaces",""),STATUS[n["status"]]["label"],
    PRIORITY[n["priority"]]["label"],n.get("openQuestion",""),n.get("qcFlag",""),
    n["deg"],n.get("sourceUrl","")]
   for n in nodes.values() if n["type"] == "org"])

write_csv("timeline.csv",
  ["id","year","event","field","key_figures","organisation","place","theme",
   "research_status","scope","links","source_url","open_question"],
  [[n["id"],n.get("year",""),n["name"],n["domain"],n.get("keyFigures",""),
    n.get("connectedOrgs",""),n.get("connectedPlaces",""),n.get("theme",""),
    STATUS[n["status"]]["label"],n.get("scope",""),n["deg"],n.get("sourceUrl",""),
    n.get("note","")]
   for n in sorted((n for n in nodes.values() if n["type"] == "event"),
                   key=lambda x: x["sortYear"])])

# ---------------------------------------------------------------- report
print("nodes   %s (total %d)" % (dict(counts), len(nodes)))
print("links   %d  (%d from the Relationships sheet)"
      % (len(links), sum(1 for L in links.values() if L.get("relId"))))
print("evidence", dict(collections.Counter(L["ev"] for L in links.values())))
print("spans   %d dated, %d undated"
      % (sum(1 for n in nodes.values() if n["span"]),
         sum(1 for n in nodes.values() if not n["span"])))
iso = [n for n in nodes.values() if n["deg"] == 0]
if dropped:
    print("dropped after %d: %s" % (CUTOFF, ", ".join(
        "%s (%s, active from %s)" % (n["name"], n["id"], n["span"][0]) for n in dropped)))
unplaced = [n for n in nodes.values() if n["type"] == "place" and "lat" not in n]
print("mapped   %d of %d places%s" % (
    sum(1 for n in nodes.values() if n["type"] == "place" and "lat" in n),
    sum(1 for n in nodes.values() if n["type"] == "place"),
    "" if not unplaced else "   MISSING: " + ", ".join(n["id"] for n in unplaced)))
if contributed:
    print("contributed %d rows from src/contributions.psv" % contributed)
print("isolates %d (%s)" % (len(iso), dict(collections.Counter(n["type"] for n in iso))))
if unresolved:
    print("\nunresolved connection strings (%d distinct):" % len(unresolved))
    for t, c in unresolved.most_common():
        print("   %2d  %s" % (c, t))
