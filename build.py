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
 ("documented",  {"label":"Stated in workbook","dash":None,
                  "note":"A workbook row asserts this directly."}),
 ("verify",      {"label":"Needs verification","dash":"5 3",
                  "note":"The workbook flags this end of the link as still to be confirmed."}),
 ("interpretive",{"label":"Interpretive","dash":"1.5 3",
                  "note":"A hypothesis the workbook offers for the workshop to test."}),
])
STATUS = collections.OrderedDict([
 ("existing",  {"label":"Existing database"}),
 ("workbook",  {"label":"Existing workbook"}),
 ("enriched",  {"label":"Existing - enriched"}),
 ("researched",{"label":"Researched addition"}),
 ("verify",    {"label":"Workshop candidate - verify"}),
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

# ---------------------------------------------------------------- reading
def rows(name, n):
    out = []
    path = os.path.join(SRC, name)
    for ln, raw in enumerate(io.open(path, encoding="utf-8"), 1):
        raw = raw.rstrip("\n").rstrip("\r")
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        f = [x.strip() for x in raw.split("|")]
        if len(f) != n:
            raise SystemExit("%s line %d: %d fields, expected %d\n  %s"
                             % (path, ln, len(f), n, raw[:120]))
        out.append(f)
    return out

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
    n.setdefault("workshopNote", "Find full identity and relationship evidence.")
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
         "sourceUrl": url(src), "workshopNote": wnote, "qcFlag": qc,
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
         "sourceUrl": url(src), "workshopNote": question,
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
for gid, name, typ, domain, kind, note in rows("extra-nodes.psv", 6):
    if typ not in TYPES: typ = "org"
    add({"id": gid, "name": name, "type": typ, "domain": domain, "kindOf": kind,
         "note": note, "role": "", "status": "verify",
         "priority": "investigate" if kind == "ghost" else "high",
         "recordType": "Named in the workbook, no record of its own"
                       if kind == "ghost" else "Collective referred to by the workbook",
         "sourceId": "", "link": "", "decades": ""})

# ---------------------------------------------------------------- name index
alias = {}
for a, target in rows("aliases.psv", 2):
    alias[a.lower()] = target

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
    if prefer:
        for h in hits:
            if nodes[h]["type"] == prefer: return h
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
        SCANNABLE.append((re.compile(r"" + re.escape(nm) + r""), n["id"]))
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
        used.append((m.start(), m.end())); found.append((m.group(0), tid))
    return found

GROUPISH = re.compile(r"(societ|network|club|association|circle|guild|gathering|"
                      r"botanists|naturalists|collectors|council|union)", re.I)
def looks_like_group(t):
    return bool(GROUPISH.search(t))

# ---------------------------------------------------------------- links
links = collections.OrderedDict()

def key(a, b): return "~".join(sorted([a, b]))

def link(a, b, rel, ev, note, src="", period="", follow="", relId=""):
    if not a or not b or a == b: return
    k = key(a, b)
    L = links.get(k)
    if L is None:
        links[k] = {"id": k, "source": a, "target": b, "rel": rel, "ev": ev,
                    "note": note, "sourceUrl": src, "period": period,
                    "followUp": follow, "relId": relId}
        return
    rank = {"documented": 3, "verify": 2, "interpretive": 1}
    if relId and not L["relId"]:                       # a Relationships row wins outright
        L.update({"rel": rel, "ev": ev, "note": note, "sourceUrl": src,
                  "period": period, "followUp": follow, "relId": relId})
        return
    if rel not in L["rel"]: L["rel"] += " · " + rel
    if note and note not in L["note"]: L["note"] += "\n" + note
    if not L["relId"] and rank[ev] > rank[L["ev"]]: L["ev"] = ev

# derived: how confident the workbook is about the row the connection came from
def ev_for(n):
    return "verify" if n["status"] == "verify" else "documented"

build_scan_index()

for n in list(nodes.values()):
    if n["type"] == "person":
        # The Relationships and Relationship/wife columns are prose, not lists, so scan
        # them for names we hold rather than chopping the sentence into fragments.
        prose = n.get("relationships", "")
        for hit, tid in scan(prose, n["id"]):
            rel = "spouse" if re.search(r"(wife|husband|married)", prose, re.I) else "named in relationships"
            link(n["id"], tid, rel, ev_for(n),
                 "Workbook Relationships column for " + n["name"] + ": " + prose, n.get("link", ""))
        for frag in split(prose):
            f2 = TRIM.sub("", frag.strip()).strip(".;")
            if f2 and not scan(frag, n["id"]) and looks_like_group(f2):
                tgt = resolve(frag)
                if tgt: link(n["id"], tgt, "named in relationships", ev_for(n),
                             "Workbook Relationships column for " + n["name"] + ": " + frag.strip(),
                             n.get("link", ""))
        sp = n.get("spouse", "")
        if sp and not sp.startswith("http"):
            for hit, tid in scan(sp, n["id"]):
                link(n["id"], tid, "spouse", "documented",
                     "Workbook Relationship / wife column: " + sp, n.get("link", ""))
        if n.get("building"):
            tgt = resolve(n["building"], prefer="place")
            if tgt: link(n["id"], tgt, "workbook building", "documented",
                         "Workbook Building column: " + n["building"], n.get("link", ""))
        if "Little Circle" in n.get("note", ""):
            link(n["id"], "COL-009", "member of the Little Circle", "documented",
                 n["note"], n.get("link", ""))
    elif n["type"] == "org":
        for frag in split(n.get("connectedPeople", "")):
            tgt = resolve(frag, prefer="person")
            if tgt: link(n["id"], tgt, "connected person", ev_for(n),
                         "Workbook Connected people column for " + n["name"] + ": " + frag.strip(),
                         n.get("sourceUrl", ""))
        for frag in split(n.get("keyPlaces", "")):
            tgt = resolve(frag, prefer="place")
            if tgt: link(n["id"], tgt, "key place", ev_for(n),
                         "Workbook Key places column for " + n["name"] + ": " + frag.strip(),
                         n.get("sourceUrl", ""))
    elif n["type"] == "place":
        for frag in split(n.get("connectedPeople", "")):
            tgt = resolve(frag, prefer="person")
            if tgt: link(n["id"], tgt, "connected person", ev_for(n),
                         "Workbook Connected people column for " + n["name"] + ": " + frag.strip(),
                         n.get("sourceUrl", ""))
        for frag in split(n.get("connectedOrgs", "")):
            tgt = resolve(frag, prefer="org")
            if tgt: link(n["id"], tgt, "connected organisation", ev_for(n),
                         "Workbook Connected organisations column for " + n["name"] + ": " + frag.strip(),
                         n.get("sourceUrl", ""))
    elif n["type"] == "event":
        for frag in split(n.get("keyFigures", "")):
            tgt = resolve(frag, prefer="person")
            if tgt: link(n["id"], tgt, "took part", ev_for(n),
                         "Workbook Key figures column for " + n["year"] + ": " + frag.strip(),
                         n.get("sourceUrl", ""))
        for frag in split(n.get("connectedOrgs", "")):
            tgt = resolve(frag, prefer="org")
            if tgt: link(n["id"], tgt, "organisation", ev_for(n),
                         "Workbook Organisation column for " + n["year"] + ": " + frag.strip(),
                         n.get("sourceUrl", ""))
        for frag in split(n.get("connectedPlaces", "")):
            tgt = resolve(frag, prefer="place")
            if tgt: link(n["id"], tgt, "happened at", ev_for(n),
                         "Workbook Place column for " + n["year"] + ": " + frag.strip(),
                         n.get("sourceUrl", ""))

# the Relationships sheet, last so it wins
rel_rows = rows("relationships.psv", 9)
for rid, a, typ, b, period, summary, src, ev, follow in rel_rows:
    for end in (a, b):
        if end not in nodes: raise SystemExit("%s: unknown endpoint %r" % (rid, end))
    link(a, b, typ, EV.get(ev, "verify"), summary, url(src), period, follow, rid)

# duplicate-review edges, so a merge candidate sits next to its keeper
for n in nodes.values():
    k = n.get("keeperId", "")
    if k and k in nodes:
        link(n["id"], k, "duplicate of", "documented",
             "Duplicate Review: " + n.get("dupReason", ""), n.get("link", ""))

# ---------------------------------------------------------------- spans, degree
for n in nodes.values():
    if n["type"] == "event":
        n["span"], n["spanSource"] = [n["sortYear"], n["sortYear"]], "workbook"
    else:
        s = span_from_decades(n.get("decades", ""))
        if s:
            n["span"], n["spanSource"] = s, "workbook"
        else:
            s = span_from_life(n.get("birth", ""), n.get("death", ""), n["type"])
            n["span"] = s
            n["spanSource"] = "inferred" if s else ""

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

FIELDS = ["id","label","name","type","domain","kindOf","gender","birth","death","dates",
          "dateQc","role","category","relationships","spouse","decades","areas","note",
          "link","specialism","background","knowledgeRole","collections","destination",
          "politics","religion","building","status","priority","sourceUrl","workshopNote",
          "qcFlag","recordType","sourceId","idStatus","dupStatus","dupGroup","keeperId",
          "action","dupReason","founded","orgType","placeType","connectedPeople",
          "connectedOrgs","connectedPlaces","keyPlaces","keyFigures","year","sortYear",
          "theme","scope","span","spanSource","deg"]

out = io.open("data.js", "w", encoding="utf-8", newline="\n")
out.write("/* Victorian Manchester natural-history workbook, cleaned edition.\n"
          "   GENERATED by build.py from src/*.psv - do not hand-edit.\n"
          "   Built %s. */\n\n" % datetime.date.today().isoformat())
for name, obj in (("DOMAINS", DOMAINS), ("TYPES", TYPES), ("EVIDENCE", EVIDENCE),
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
   "record_type","source_id","duplicate_status","duplicate_group","keeper_id",
   "recommended_action","research_status","priority","workshop_note","qc_flag",
   "active_from","active_to","active_source","links","link"],
  [[n["id"],n["name"],n.get("kindOf",""),n["domain"],n.get("gender",""),n.get("birth",""),
    n.get("death",""),n.get("dates",""),n.get("dateQc",""),n.get("role",""),
    n.get("category",""),n.get("specialism",""),n.get("background",""),
    n.get("knowledgeRole",""),n.get("decades",""),n.get("areas",""),
    n.get("collections",""),n.get("destination",""),n.get("politics",""),
    n.get("religion",""),n.get("building",""),n.get("note",""),n.get("relationships",""),
    n.get("recordType",""),n.get("sourceId",""),n.get("dupStatus",""),n.get("dupGroup",""),
    n.get("keeperId",""),n.get("action",""),STATUS[n["status"]]["label"],
    PRIORITY[n["priority"]]["label"],n.get("workshopNote",""),n.get("qcFlag",""),
    (n["span"] or ["",""])[0],(n["span"] or ["",""])[1],n.get("spanSource",""),
    n["deg"],n.get("link","")] for n in sorted(people, key=lambda x: x["name"])])

write_csv("links.csv",
  ["relationship_id","source_id","source","relationship","target_id","target","evidence",
   "period","evidence_summary","workshop_follow_up","source_url"],
  [[L.get("relId",""),L["source"],nodes[L["source"]]["label"],L["rel"],L["target"],
    nodes[L["target"]]["label"],EVIDENCE[L["ev"]]["label"],L.get("period",""),
    L["note"].replace("\n"," / "),L.get("followUp",""),L.get("sourceUrl","")]
   for L in links.values()])

write_csv("places.csv",
  ["id","name","field","place_type","date","gm_area","natural_history_relevance",
   "connected_people","connected_organisations","research_status","priority",
   "workshop_question","links","source_url"],
  [[n["id"],n["name"],n["domain"],n.get("placeType",""),n.get("founded",""),
    n.get("areas",""),n.get("role",""),n.get("connectedPeople",""),
    n.get("connectedOrgs",""),STATUS[n["status"]]["label"],PRIORITY[n["priority"]]["label"],
    n.get("workshopNote",""),n["deg"],n.get("sourceUrl","")]
   for n in nodes.values() if n["type"] == "place"])

write_csv("organisations.csv",
  ["id","name","field","founded","type","role_in_network","connected_people","key_places",
   "research_status","priority","workshop_note","qc_flag","links","source_url"],
  [[n["id"],n["name"],n["domain"],n.get("founded",""),n.get("orgType",""),n.get("role",""),
    n.get("connectedPeople",""),n.get("keyPlaces",""),STATUS[n["status"]]["label"],
    PRIORITY[n["priority"]]["label"],n.get("workshopNote",""),n.get("qcFlag",""),
    n["deg"],n.get("sourceUrl","")]
   for n in nodes.values() if n["type"] == "org"])

write_csv("timeline.csv",
  ["id","year","event","field","key_figures","organisation","place","theme",
   "research_status","scope","links","source_url","workshop_note"],
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
print("isolates %d (%s)" % (len(iso), dict(collections.Counter(n["type"] for n in iso))))
if unresolved:
    print("\nunresolved connection strings (%d distinct):" % len(unresolved))
    for t, c in unresolved.most_common():
        print("   %2d  %s" % (c, t))
