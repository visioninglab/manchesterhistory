# Who Knew Whom

A workshop tool built from the Victorian Manchester natural-history workbook, around one
question: **how did people, specimens and knowledge move between Manchester's workplaces,
pubs, fields, societies, private collections and museums?**

Live page: <https://visioninglab.github.io/manchesterhistory/>

Built from `Victorian_Manchester_Natural_History_Cleaned.xlsm` — the cleaned edition, which
adds a **Relationships** sheet, research-status and priority rankings, a duplicate review,
and QC flags on the rows that need a decision. Every node and link here is something a row
or a column of that workbook asserts; nothing is invented. Where the workbook flags
something as unconfirmed, or offers a hypothesis rather than a fact, the page shows that in
the line style rather than hiding it in a status column.

## What the page holds

| | |
|---|---|
| People | 165 (148 workbook rows, 17 named-but-unrecorded, plus collectives) |
| Societies and firms | 39 |
| Places | 86 |
| Dated events | 44 |
| Links | 310, of which **18 come from the Relationships sheet** |
| Evidence | 269 stated · 38 needing verification · 3 interpretive |

The 18 Relationships rows are the only links where the workbook names the relationship
itself ("Introduced to network by", "Herbarium transferred to", "Financed / enabled"),
dates it, rates its evidence and sets a follow-up. They are labelled `REL-001`…`REL-018`
throughout the page. The other 292 links are read out of the workbook's connection
columns — Connected people, Key figures, Key places, Connected organisations, Building —
and are labelled by which column they came from.

## Files

| File | What it is |
|---|---|
| `src/*.psv` | the transcribed workbook, pipe-delimited, one file per sheet |
| `build.py` | reads `src/`, resolves names to IDs, writes `data.js` and the CSVs |
| `bundle.py` | inlines `data.js` + `app.js` into the two published pages |
| `data.js` | generated — the model the page loads |
| `app.js` | graph, decade filter, detail panel, editable sheet |
| `network.html` | development page (loads `data.js` and `app.js` separately) |
| `whoknewwhom.html` | generated — the single-file bundle published as an artifact |
| `index.html` | generated — the same bundle, wrapped as a full document for GitHub Pages |
| `people.csv` `organisations.csv` `places.csv` `timeline.csv` `links.csv` | generated — one file per sheet, flat |

Rebuild after editing anything in `src/`, `app.js` or `network.html`:

```
python build.py     # src/*.psv  ->  data.js + the five CSVs
python bundle.py    # data.js + app.js + network.html  ->  whoknewwhom.html, index.html
```

`build.py` prints a report: node and link counts, evidence split, isolates, and every
connection string it could **not** resolve to a record. Four remain, all of them genuinely
vague workbook prose ("ILP, Trade Unions", "active in reform circles", "Unitarian women",
"working-class women's care"). The page names them under *Did not resolve* rather than
guessing a target.

## How the data is shaped

**Fields of activity** (`domain`) — `nat`, `press`, `trade`, `suff`, `reform`, `civic`,
`arts`. Assigned here, not in the workbook, from role and category text; treat it as a
reading aid, not a source claim.

**Kind of record** (`kindOf`) — `record` is a workbook row. Everything else draws hollow:

- `ghost` — a person the workbook names in an event or connection column but gives no row
  of their own (18 of these).
- `collective` — a group the workbook links to as if it were a single actor: "artisan
  botanists", "textile wealth". Kept whole rather than guessed at as individuals, so
  REL-016/017/018 stay drawable and visibly interpretive.
- `derived` — a node made from a **column** rather than a row, because the column names a
  thing the network needs: `PL-GUARDIAN` (the Building value on twelve People rows),
  `COL-009 The Little Circle` (named in eight Notes cells), `PL-ARTTREASURES`.

**Evidence** — `documented` (a workbook row says it), `verify` (the workbook flags it as
unconfirmed), `interpretive` (a hypothesis the workbook offers for testing). Solid, dashed
and dotted lines respectively.

**Research status and priority** — the cleaned workbook's own rankings, carried straight
through: Existing database / Existing workbook / Existing – enriched / Researched addition /
Workshop candidate – verify, and Essential / High / Investigate / Existing / Context. The
104 Context rows are background buildings and national timeline entries; turn that chip off
to leave the network the workbook wants argued about.

**Dates.** `active_from` / `active_to` drive the decade slider. `active_source` says
`workbook` where the Decades active column states it (224 rows), `inferred` where it was
derived from a lifespan (53 rows). 57 rows carry no date at all. Never read an inferred
span as a record.

## What the cleaned edition fixed, and what it did not

The duplicate IDs are now **decided rather than merged**, and the page shows the decision
on the record and draws a `duplicate of` line between the pair:

- `DUP-001` John Edward Taylor — 200013 merge then delete, **keep 200100**
- `DUP-002` John Shuttleworth — 200014 delete after review, **keep 200102**
- `DUP-003` Absalom Watkin — 200015 delete after review, **keep 200103**
- `DUP-004` Joseph Brotherton — 200037 merge then delete, **keep 200107**
- `DUP-005` the Potter composite — 200016 delete after review; **keep 200104 Thomas and
  200105 Richard** as separate people
- `ID-001` three rows that reused the source ID `sw` now hold `VM-ADD-010/011/012`

Thirteen rows that had no workbook ID now hold assigned `VM-ADD-*` IDs, each carrying an
`idStatus` saying so.

Still open, and flagged on the rows themselves so the workshop decides:

- **Five rows have no first name** — Waterhouse (200045), Kennedy (200050), McConnel
  (200049), Engels (200035), Mrs Hopkins (NH-027).
- **Arthur Wharton (200075) is recorded as F.** Check against the source.
- **William Crawford Williamson (VM-ADD-013)** was the last PDF addition and its
  biographical fields are incomplete.
- **Five ORG-BASE rows have clipped source text** from the PDF and need their wording
  verified against the workbook.
- **Column drift.** On the People sheet the Politics column carries marriage narratives on
  many rows while Relationship / wife sits empty. Only genuine political labels were
  carried across; the narratives were left behind as duplicates of the Relationships
  column.
- **Scope.** Shelagh Delaney, Kate Isitt and Marie Stopes still sit alongside Peterloo-era
  figures. The Timeline sheet has a scope flag; People does not.
- **John Leigh Philips's dates** conflict between sources: 1761–1841 and 1761–1814.

## Editing

The Spreadsheet tab has one grid per sheet — People, Organisations, Places, Timeline,
Links — with the workbook's own columns, including research status, priority, workshop
note and QC flag. Edits are stored as an overlay in your browser and layered over the
workbook; the rows underneath are never overwritten, and an edited or added row is marked
in the margin. Download CSV takes the current grid out, with the computed date span and
link count appended. Copy JSON takes the whole model.

Shared editing is deliberately off: declaring the artifact's `db` capability makes the page
organisation-internal, which is why an earlier version would not load at all.
