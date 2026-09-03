# Who Knew Whom

A tool for reading a Victorian Manchester natural-history collection as a network, around
one question: **how did people, specimens and knowledge move between Manchester's
workplaces, pubs, fields, societies, private collections and museums?**

Live page: <https://visioninglab.github.io/manchesterhistory/>

Built from `Victorian_Manchester_Natural_History_Cleaned.xlsx` — read straight from the
workbook, not from a PDF of it. Almost everything here is something a row or a column of
that source asserts. Where a link was added in cleaning, or rests on something outside the
source, the page says so and draws it differently.

## What the page holds

| | |
|---|---|
| People | 158 |
| Societies, firms and groupings | 52 |
| Places | 82 |
| Dated events | 44 |
| Links | 425, of which **18 come from the Relationships sheet** |
| Evidence | 353 stated in the source · 60 to be confirmed · 12 readings offered for testing |
| Records with nothing linked to them | 0 |
| Records with no date | 0 |

The 18 Relationships rows are the only links where the source names the relationship
itself ("Introduced to network by", "Herbarium transferred to", "Financed / enabled"),
dates it, rates its evidence and sets a follow-up. They are labelled `REL-001`…`REL-018`
throughout the page. The rest are read out of the connection columns — Connected people,
Key figures, Key places, Connected organisations, Category, Building — or were added in
cleaning, each with a note saying what it rests on.

**Start here** offers five ways in for a reader who does not yet know the material: cotton
money and the Guardian, how the herbarium moved, artisan botanists and their ground, votes
for women, and slavery for and against. Each sets the filters and lands on the part of the
network it names.

## Files

| File | What it is |
|---|---|
| `src/people.psv` `orgs.psv` `places.psv` `timeline.psv` | transcribed straight from the workbook; not edited by hand |
| `src/corrections.psv` | every change made to those values, with the reason |
| `src/merges.psv` | records that were the same thing twice, and which one survives |
| `src/groupings.psv` | the Category values that become nodes |
| `src/added-links.psv` | links added in cleaning, each with its basis |
| `src/extra-nodes.psv` | people and groups the workbook names but gives no row |
| `src/relationships.psv` | the Relationships sheet, endpoints resolved to record IDs |
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

`build.py` prints a report: node and link counts, evidence split, isolates, anything
dropped for falling outside the period, and every connection string it could **not**
resolve to a record. Three remain, all genuinely vague source prose ("active in reform
circles", "Unitarian women", "working-class women's care"). The page names them under
*Did not resolve* rather than guessing a target.

## How the data is shaped

**Fields of activity** (`domain`) — `nat`, `press`, `trade`, `suff`, `reform`, `civic`,
`arts`. Assigned here, not in the source, from role and category text; treat it as a
reading aid, not a claim.

**Kind of record** (`kindOf`) — `record` is a row in the source, or a person researched
into one here. The rest draw hollow:

- `grouping` (16) — a heading the source already sorts records under, turned into a node:
  anti-slavery campaigning, pro-slavery interests, free trade and Liberalism,
  Palmerstonian conservatism, and the three place records that stand for classes of
  building rather than buildings. See `src/groupings.psv`.
- `collective` (9) — a group the source links to as if it were a single actor: "artisan
  botanists", "textile wealth". Kept whole rather than guessed at as individuals, so
  REL-016/017/018 stay drawable and visibly interpretive.
- `derived` (4) — a node made from a **column** rather than a row: `PL-GUARDIAN` (the
  Building value on twelve People rows), `COL-009 The Little Circle` (named in eight Notes
  cells), `PL-ARTTREASURES`, `PL-GAIETY`.
- `ghost` (3) — a person the source names and no one can identify: Anne Robertson, Frances
  Ashwell, and a Mrs Broadhurst recorded only by her husband's surname.

**Evidence** — `documented` (a record states it), `verify` (flagged as still to be
confirmed, including everything asserted from outside the source), `interpretive` (a
reading offered for testing). Solid, dashed and dotted lines respectively.

**Research status and priority** — the source's own rankings, carried through. Context rows
are background — buildings, national timeline entries, and the headings — and can be
filtered out in one click.

**Dates.** `active_from` / `active_to` drive the decade slider. `active_source` says
`workbook` where the source's own Decades active column states it (222 rows), `inferred`
where it comes from a lifespan (62), and `estimated` where a grouping or collective has no
dates of its own and takes the span of the records attached to it (52). Nothing is undated,
but only the first of those three is a source claim.

## What cleaning changed

**The transcription was replaced.** The first version was read out of a 386-page PDF of the
workbook and had drifted: whole columns of the Places sheet were offset by a row, and a
dozen Connected people cells held names that are not in the source at all. Everything is now
read from the `.xlsx` itself. The connections that turned out to be inferences rather than
source data were not thrown away — they moved to `src/added-links.psv`, where each says what
it rests on.

**A bug that had been eating the data.** The scanner that reads names out of prose
relationship columns had its word boundaries mangled into literal backspace characters, so
it had been matching nothing at all since it was written. Fixing it recovered every marriage
in the collection, among other links the source had always asserted.

**Eleven duplicate records were merged.** The survivor absorbs any field the dropped record
filled in, every link is re-pointed at it, and it carries an *Absorbed* note naming what was
folded in. `src/merges.psv` holds the list and the reason for each. Five came from the
source's own duplicate review — John Edward Taylor, John Shuttleworth, Absalom Watkin,
Joseph Brotherton, and the composite row covering both Potter brothers. Six were found
here: Sir John Potter, the Manchester Royal Infirmary, Manchester Cathedral, the
Co-operative Wholesale Society building, Market Street, and Peel Park Museum, which is
Salford Museum and Art Gallery under an older name.

**Every record is linked, and every record is dated.** 106 records had nothing joining them
to the rest. They were connected by the bug fix, by the Category column becoming nodes, and
by 105 curated links in `src/added-links.psv`. Groupings and collectives that had no dates
now take the span of what is attached to them.

**Fifteen people the source names but never recorded are now records**, with dates: the
entomologist John Curtis, the bryologist William Henry Pearson, the microscopists Thomas
Brittain and James Cash, the museum keeper Harry Britten, Elizabeth Wolstenholme Elmy,
Richard Pankhurst, Sarah Dickenson, Agnes Pochin, Josephine Butler, Emily Davies, Anne
Jemima Clough, Priscilla Bright McLaren, Florence Nightingale, and the North of England
Society for Women's Suffrage. Each says on its record that it was researched here.

**Corrections** (31 of them, each written onto the record so a reader sees it, and listed
in `src/corrections.psv`):

- Names the source leaves incomplete or misspelled: Alfred Waterhouse, Friedrich Engels,
  James McConnel and John Kennedy had no first name; Granville Sharp, Charlotte Brontë and
  William Fairbairn were misspelled; a record named only "Founder?" is now "Unnamed founder,
  Society for the Abolition of Slavery".
- The Philips family: Mark Philips and Philips Park are spelled Philips, as the family and
  the MP spelled it. The source has Phillips on both. Robert Philips is now linked to his
  cousin Sir George Philips and to Mark Philips's park.
- Boroughs: Peel Park, Salford Museum and Art Gallery, Salford Lads Club and Weaste Cemetery
  were filed under Manchester; the Portico Library and the Castlefield warehouses under
  Salford.
- Arthur Wharton is recorded as F in both of the source's gender columns. He was a man.
- Three place records that stand for classes of building — "Factories (e.g., Cotton Mills)",
  "Hotels (e.g., Midland Hotel)", "Warehouses (e.g., Castlefield area)" — are renamed and
  reclassified as groupings.
- Four cases of the source's own column drift, where relevance text sits in the Connected
  people column, including one cell damaged to "0H)istorically male institution".

**Anyone whose activity begins after 1930 is out.** One record went: Shelagh Delaney, born
1938.

## Still open

- **William Crawford Williamson (VM-ADD-013)** was the last addition to the source and its
  biographical fields are incomplete.
- **Florence Nightingale's visit to Salford Workhouse** is asserted by the Places sheet and
  by nothing else. Her record says so. If the visit does not stand up, she should come out.
- **Forty-five records carry a data flag** from the source, most of them saying the PDF text
  behind a row was clipped and the final wording needs checking.
- **Three connection strings resolve to nothing** — "active in reform circles", "Unitarian
  women", "working-class women's care". They name a milieu, not a record.
- **Column drift.** On the People sheet the Politics column carries marriage narratives on
  many rows while Relationship / wife sits empty. Only genuine political labels were carried
  across.
- **John Leigh Philips's dates** conflict between sources: 1761–1841 and 1761–1814.
- **The fields of activity are ours, not the source's.** Colour is the first thing anyone
  reads, and nobody has checked the assignment.

## Editing

The Spreadsheet tab has one grid per sheet — People, Organisations, Places, Timeline,
Links — with the source's own columns, plus what cleaning added: research status, priority,
open question, data flag, what a record absorbed and what was corrected on it. Edits are
stored as an overlay in your browser and layered over the data; the rows underneath are
never overwritten, and an edited or added row is marked in the margin. Download CSV takes
the current grid out, with the computed date span and link count appended. Copy JSON takes
the whole model.

Shared editing is deliberately off: declaring the artifact's `db` capability makes the page
organisation-internal, which is why an earlier version would not load at all.
