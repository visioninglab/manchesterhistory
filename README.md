# Who Knew Whom

A tool for reading a Victorian Manchester natural-history collection as a network, around
one question: **how did people, specimens and knowledge move between Manchester's
workplaces, pubs, fields, societies, private collections and museums?**

Live page: <https://visioninglab.github.io/manchesterhistory/>

Built from `Victorian_Manchester_Natural_History_Cleaned.xlsm`, which adds a
**Relationships** sheet, research-status and priority rankings, a duplicate review, and
data-quality flags. Almost everything here is something a row or a column of that source
asserts. Where a link was added in cleaning, or rests on something outside the source, the
page says so and draws it differently.

## What the page holds

| | |
|---|---|
| People | 159 |
| Societies, firms and groupings | 52 |
| Places | 83 |
| Dated events | 44 |
| Links | 444, of which **18 come from the Relationships sheet** |
| Evidence | 374 stated in the source · 58 to be confirmed · 12 readings offered for testing |
| Records with nothing linked to them | 0 |

The 18 Relationships rows are the only links where the source names the relationship
itself ("Introduced to network by", "Herbarium transferred to", "Financed / enabled"),
dates it, rates its evidence and sets a follow-up. They are labelled `REL-001`…`REL-018`
throughout the page. The rest are read out of the connection columns — Connected people,
Key figures, Key places, Connected organisations, Category, Building — or were added in
cleaning, each with a note saying what it rests on.

## Files

| File | What it is |
|---|---|
| `src/*.psv` | the transcribed source, pipe-delimited, one file per sheet |
| `src/merges.psv` | records that were the same thing twice, and which one survives |
| `src/groupings.psv` | the Category values that become nodes |
| `src/added-links.psv` | links added in cleaning, each with its basis |
| `src/aliases.psv` | how free-text names resolve to record IDs |
| `build.py` | reads `src/`, resolves names, writes `data.js` and the CSVs |
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
connection string it could **not** resolve to a record. Four remain, all genuinely vague
source prose ("ILP, Trade Unions", "active in reform circles", "Unitarian women",
"working-class women's care"). The page names them under *Did not resolve* rather than
guessing a target.

## How the data is shaped

**Fields of activity** (`domain`) — `nat`, `press`, `trade`, `suff`, `reform`, `civic`,
`arts`. Assigned here, not in the source, from role and category text; treat it as a
reading aid, not a claim.

**Kind of record** (`kindOf`) — `record` is a row in the source. Everything else draws
hollow:

- `ghost` — a person the source names in an event or connection column but gives no row
  of their own (18).
- `collective` — a group the source links to as if it were a single actor: "artisan
  botanists", "textile wealth" (9). Kept whole rather than guessed at as individuals, so
  REL-016/017/018 stay drawable and visibly interpretive.
- `grouping` — a heading the Category column already sorts people under, turned into a
  node (13): anti-slavery campaigning, pro-slavery interests, free trade and Liberalism,
  Palmerstonian conservatism, journalism, and so on. See `src/groupings.psv`.
- `derived` — a node made from a **column** rather than a row: `PL-GUARDIAN` (the Building
  value on twelve People rows), `COL-009 The Little Circle` (named in eight Notes cells),
  `PL-ARTTREASURES`, `PL-GAIETY`.

**Evidence** — `documented` (a record states it), `verify` (flagged as still to be
confirmed, including everything asserted from outside the source), `interpretive` (a
reading offered for testing). Solid, dashed and dotted lines respectively.

**Research status and priority** — the source's own rankings, carried through: Existing
database / Existing workbook / Existing – enriched / Researched addition / Needs checking,
and Essential / High / Investigate / Existing / Context. Context rows are background —
buildings, national timeline entries, and the Category headings — and can be filtered out
in one click.

**Dates.** `active_from` / `active_to` drive the decade slider. `active_source` says
`workbook` where the Decades active column states it (220 rows), `inferred` where it was
derived from a lifespan (47). 71 rows carry no date, most of them groupings and collectives
that never had one. Never read an inferred span as a record.

## What cleaning changed

**Ten duplicate records were merged.** The survivor absorbs any field the dropped record
filled in, every link is re-pointed at it, and it carries an *Absorbed* note naming what
was folded in. `src/merges.psv` holds the list and the reason for each.

Five came from the source's own duplicate review — John Edward Taylor, John Shuttleworth,
Absalom Watkin, Joseph Brotherton, and the composite row covering both Potter brothers.
Five more were found here: Sir John Potter held two records; so did the Manchester Royal
Infirmary; "Cathedral" duplicated Manchester Cathedral; the Co-operative Wholesale Society
building had two rows; and "Shops (e.g., Market Street)" duplicated Market Street.

**Every record is now linked to something.** 106 records had nothing joining them to the
rest. They were connected three ways:

1. A bug fix. The name-scanner that reads prose relationship columns had a broken word
   boundary and had been matching nothing at all. Fixing it added 19 links the source had
   always asserted, including every marriage.
2. The Category column. Recurring values became nodes, so the grouping the spreadsheet
   already makes is visible instead of implied — 48 links.
3. Curation. 74 links added by hand in `src/added-links.psv`, each carrying a note saying
   what it rests on and rated accordingly: stated in one of the two records' own text,
   asserted from outside the source, or offered as a reading.

**Names completed or corrected**, each recorded in the record's data flag: Alfred
Waterhouse, Friedrich Engels, James McConnel and John Kennedy had no first name; Granville
Sharp, Charlotte Brontë and William Fairbairn were misspelled; a record named only
"Founder?" is now "Unnamed founder, Society for the Abolition of Slavery". Mrs Hopkins
(NH-027) stays as she is — the first name is not recoverable from the source.

**Places filed in the wrong borough** were corrected: Peel Park, Salford Museum and Art
Gallery, Salford Lads Club and Weaste Cemetery were all filed under Manchester; the Portico
Library and the Castlefield warehouses under Salford.

## Still open

- **Arthur Wharton (200075) is recorded as F.** Check against the source.
- **William Crawford Williamson (VM-ADD-013)** was the last addition and its biographical
  fields are incomplete.
- **Five ORG-BASE rows have clipped source text** from the PDF and need their wording
  verified.
- **Category-place records.** "Factories (e.g., Cotton Mills)", "Hotels (e.g., Midland
  Hotel)" and "Warehouses (e.g., Castlefield area)" are categories wearing a place record's
  clothes. They work as anchors but they are not buildings.
- **Peel Park Museum and Salford Museum and Art Gallery** are almost certainly one
  institution under two names, kept as two records because the natural-history row makes a
  claim the other does not. They are linked, not merged.
- **Philips / Phillips.** Mark Phillips, Robert Philips, Sir George Philips and John Leigh
  Philips are spelled inconsistently across records and against Philips Park.
- **Column drift.** On the People sheet the Politics column carries marriage narratives on
  many rows while Relationship / wife sits empty. Only genuine political labels were
  carried across.
- **Scope.** Shelagh Delaney (1938–2011), Kate Isitt and Marie Stopes sit alongside
  Peterloo-era figures. The Timeline sheet has a scope flag; People does not.
- **John Leigh Philips's dates** conflict between sources: 1761–1841 and 1761–1814.

## Editing

The Spreadsheet tab has one grid per sheet — People, Organisations, Places, Timeline,
Links — with the source's own columns, including research status, priority, open question
and data flag. Edits are stored as an overlay in your browser and layered over the data;
the rows underneath are never overwritten, and an edited or added row is marked in the
margin. Download CSV takes the current grid out, with the computed date span and link count
appended. Copy JSON takes the whole model.

Shared editing is deliberately off: declaring the artifact's `db` capability makes the page
organisation-internal, which is why an earlier version would not load at all.
