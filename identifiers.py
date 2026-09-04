# -*- coding: utf-8 -*-
"""Find a Wikidata identifier for each person in the collection.

Run occasionally, by hand: python identifiers.py

A name on its own is not enough to identify anybody - "John Turner" matches dozens of
people and string similarity will happily give you the wrong one. So a candidate is only
accepted when Wikidata's birth and death years agree with ours within a year. People we
have no dates for are reported at the end rather than guessed at.

Writes src/identifiers.psv. Nothing else reads Wikidata at build time; the file is the
record.
"""
import collections
import io
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse

SRC = os.path.join(os.path.dirname(os.path.abspath(__file__)), "src")
UA = "WhoKnewWhom/1.0 (https://visioninglab.github.io/manchesterhistory/)"
API = "https://www.wikidata.org/w/api.php?"


def get(params):
    """Fetched with curl rather than urllib: the Python here has no CA bundle, so
    urllib cannot verify the certificate and every request fails silently."""
    url = API + urllib.parse.urlencode(params)
    for attempt in range(3):
        try:
            out = subprocess.run(["curl", "-s", "-m", "30", "-A", UA, url],
                                 capture_output=True, timeout=40)
            return json.loads(out.stdout.decode("utf-8"))
        except Exception:
            time.sleep(1.5 * (attempt + 1))
    return {}


def year(claims, prop):
    """The year on a P569/P570 claim, or None."""
    for c in claims.get(prop, []):
        try:
            t = c["mainsnak"]["datavalue"]["value"]["time"]
        except (KeyError, TypeError):
            continue
        m = re.match(r"[+-](\d{4})", t)
        if m:
            return int(m.group(1))
    return None


def search(name, limit=7):
    d = get({"action": "wbsearchentities", "search": name, "language": "en",
             "uselang": "en", "type": "item", "format": "json", "limit": limit})
    return [(x["id"], x.get("description", "")) for x in d.get("search", [])]


def details(qids):
    if not qids:
        return {}
    d = get({"action": "wbgetentities", "ids": "|".join(qids), "props": "claims|labels",
             "languages": "en", "format": "json"})
    out = {}
    for q, e in (d.get("entities") or {}).items():
        cl = e.get("claims", {})
        out[q] = {"born": year(cl, "P569"), "died": year(cl, "P570"),
                  "human": any(s["mainsnak"].get("datavalue", {}).get("value", {})
                               .get("id") == "Q5" for s in cl.get("P31", [])),
                  "label": (e.get("labels", {}).get("en", {}) or {}).get("value", "")}
    return out


def rows(name, n):
    out = []
    for line in io.open(os.path.join(SRC, name), encoding="utf-8"):
        line = line.rstrip("\n")
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        f = [x.strip() for x in line.split("|")]
        if len(f) == n:
            out.append(f)
    return out


def people():
    """id, name, birth, death - from the transcription plus the researched additions."""
    out = []
    for f in rows("people.psv", 16):
        out.append((f[0], f[1], f[4], f[5]))
    for f in rows("extra-nodes.psv", 8):
        if f[2] != "person":
            continue
        b, d = (f[5].split("-") + [""])[:2] if f[5] else ("", "")
        out.append((f[0], f[1], b, d))
    return out


def match(name, born, died):
    """A candidate only counts if the years line up."""
    if not born and not died:
        return None, "no dates of our own"
    cands = search(name)
    if not cands:
        return None, "nothing on Wikidata by that name"
    info = details([q for q, _ in cands])
    for q, desc in cands:
        d = info.get(q, {})
        if not d.get("human"):
            continue
        ok_b = born and d["born"] and abs(int(born) - d["born"]) <= 1
        ok_d = died and d["died"] and abs(int(died) - d["died"]) <= 1
        if (ok_b and ok_d) or (ok_b and not died) or (ok_d and not born):
            return q, desc
    return None, "no candidate whose dates agree"


if __name__ == "__main__":
    only = sys.argv[1:] or None
    found, missed = [], []
    for pid, name, born, died in people():
        if only and pid not in only:
            continue
        q, why = match(name, born, died)
        time.sleep(0.12)
        if q:
            found.append((pid, q, name, why))
            print("  %-14s %-10s %s" % (pid, q, name))
        else:
            missed.append((pid, name, why))
    with io.open(os.path.join(SRC, "identifiers.psv"), "w",
                 encoding="utf-8", newline="\n") as f:
        f.write("# Authority identifiers, so a person here can be matched against other\n"
                "# collections without anyone guessing from a name. Written by\n"
                "# identifiers.py, which only accepts a Wikidata item whose birth and death\n"
                "# years agree with ours; see that file for why.\n"
                "# id|scheme|value|what Wikidata calls them\n")
        for pid, q, name, desc in sorted(found):
            f.write("|".join([pid, "wikidata", q, desc.replace("|", "/")]) + "\n")
    print("\nmatched %d of %d" % (len(found), len(found) + len(missed)))
    why = collections.Counter(w for _, _, w in missed)
    for w, n in why.most_common():
        print("  %4d  %s" % (n, w))
