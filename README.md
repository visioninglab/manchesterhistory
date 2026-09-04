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
| Places | 85 |
| Dated events | 44 |
| Links | 436, of which **18 come from the Relationships sheet** |
| Evidence | 357 stated in the source · 67 to be confirmed · 12 readings offered for testing |
| Records with nothing linked to them | 0 |
| Records with no date | 0 |
| Places with a coordinate | 85 of 85 |

The 18 Relationships rows are the only links where the source names the relationship
itself ("Introduced to network by", "Herbarium transferred to", "Financed / enabled"),
dates it, rates its evidence and sets a follow-up. They are labelled `REL-001`…`REL-018`
throughout the page. Every link also carries one of 33 connection types in seven families, so nothing is
merely "connected to" something else. The rest are read out of the connection columns — Connected people,
Key figures, Key places, Connected organisations, Category, Building — or were added in
cleaning, each with a note saying what it rests on.

There are four views: the **network**, a **map**, a **timeline** and a **table**.
The timeline lays every record out against a 1750-1960 axis - events as points, everyone
and everything else as a bar from the first year it was active to the last - and marks
the spans that were worked out rather than stated, so an era is never mistaken for a
record. The map has no
tiles — a published artifact cannot load images from a tile server — so the geography is
drawn from coordinates: the Irwell, the Irk, the Medlock, the Mersey, the four canals,
and eighteen district labels. Coordinates for all 82 places were put here by hand and
each says how precise it is. Lines on the map join two places when the same person,
society or event reaches both, which is the only kind of movement this collection can
actually show; click one to see who.

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
| `src/places-geo.psv` | a coordinate and a precision for every place |
| `src/testimony.psv` | what people who work with the material have told us, quoted and attributed |
| `src/resources.psv` | the catalogues and aggregators to search next |
| `src/basemap.psv` | the rivers, canals and district labels the map is drawn from |
| `src/connection-types.psv` | the 33 kinds of connection, in seven families |
| `src/contributions.psv` | what people have sent in on the contribution sheet |
| `contribute-template.csv` | the sheet to send them |
| `analytics.html` | where a visit-counting snippet goes, if you want one. Empty by default |
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

## What the Head of Botany told us

The Head of Botany at Manchester Museum, asked about the herbarium the collection treats
as the destination for Manchester's botany:

> Although we're Manchester Museum, our herbarium hasn't got a huge amount of material
> from within Greater Manchester. We have more extensive collections from the rest of the
> UK, continental Europe and beyond. Our collectors seem to have concentrated on
> collecting that which they couldn't readily get access to, rather than the things which
> were on their doorsteps and which might flower again next year.

That cuts against what this tool was quietly implying. Four herbaria did move into the
Manchester Museum — the Relationships sheet records each transfer — but it does not follow
that the mosses and cloughs on the map are what is in the cabinets. The collecting habit
ran the other way: what you can walk to on a Sunday and see again next spring is exactly
what you do not press and keep.

The quote sits on the herbarium's own record, and the *How the herbarium moved* view now
carries the qualification. Three repositories the Head of Botany points to instead are
now in the collection and on the map — **Gallery Oldham**, **Bolton Museum and Art
Gallery** and **Tameside museums and galleries** — each joined to the artisan botanists
as a lead that needs checking rather than as a fact. Oldham and Tameside sit in the
middle of the country those botanists worked, which is the point.

The open question this leaves is a good one: if the local material is not in Manchester,
whose sheets are in Oldham, Bolton and Tameside, and do any of them carry the names
already in this collection? *Where to look next*, in the opening panel, lists the
catalogues and aggregators to answer it with.

## Seeing who uses it

**The artifact cannot be counted, at all.** A published artifact runs under a content
policy that blocks every outbound request: no analytics script, no beacon, not even a
one-pixel image. That is not a setting anyone can change. If you want to know whether a
page is being read, share the **GitHub Pages** link rather than the artifact link:

    https://visioninglab.github.io/manchesterhistory/

The repository's own Insights → Traffic panel does not help either: it counts visits to
the *repository*, not to the Pages site.

To count visits to the Pages site, paste a provider's snippet into `analytics.html` below
the marked line and run `python bundle.py`. It goes into `index.html` only, never into the
artifact. Leave the file alone and nothing is tracked. Three that work on a static site
and set no cookies:

| | |
|---|---|
| **GoatCounter** | Free for non-commercial use, open source, about 3KB. The obvious first choice here. |
| **Cloudflare Web Analytics** | Free, needs a Cloudflare account. |
| **Plausible** | Around £9 a month, the best dashboard of the three. |

Google Analytics also works, but it sets cookies, which in the UK means a consent banner
and a privacy policy. For a page like this the cookieless ones are less trouble and tell
you the same thing.

**None of them tell you who.** Analytics tells you how many people, roughly where they
are, what referred them and what they looked at. It cannot name an individual, and trying
to make it do so is where the trouble starts.

If what you actually want is "did Dr So-and-so open the thing I sent her", the way to do
that on a static site is to give each person their own link:

    https://visioninglab.github.io/manchesterhistory/?from=oldham
    https://visioninglab.github.io/manchesterhistory/?from=nybg

The page ignores the parameter; the analytics provider records it as a separate page, so
you can see which link was opened and when. Two things follow from that. It identifies a
named person, so tell them you are doing it — a line in the covering email is enough, and
people generally do not mind being asked. And a forwarded link carries the tag with it, so
treat it as "this link was opened", not "this person opened it".

When a snippet is set, the page says so itself, in *About this collection* in the opening
panel.

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

## Contributing without touching the browser

`contribute-template.csv` is a spreadsheet anyone can fill in. One row per thing: a
person, a society, a place, an event, or a connection between two of them. It carries
its own instructions in the first rows, and the columns are plain words rather than
field names — *what*, *name*, *from*, *to*, *how*, *field*, *dates*, *what_they_did*,
*where*, *sure*, *source*, *by*, *notes*.

Three of those columns do the real work. **how** takes any of the connection types, or
plain words the build will match to one. **sure** takes `yes` if you have a source, `no`
if you are fairly confident, `reading` if it is an argument rather than a fact — and that
becomes the line style on the graph. **by** is your name, which stays on the record.

Send the sheet back and its rows go into `src/contributions.psv`. Everything added that
way is kept apart from the transcription and marked on the page as contributed and not
yet confirmed, with the contributor named in the provenance, until somebody checks it. A
`where` of `53.5352,-2.2861` puts a new place straight onto the map.

## The table

The table has one grid per sheet — People, Organisations, Places, Timeline,
Links — with the source's own columns, plus what cleaning added: research status, priority,
open question, data flag, what a record absorbed and what was corrected on it. It is
read-only, and clicking a row opens that record. Additions come through the contribution
sheet instead, so that a name and a source stay attached to everything that arrives.

The generated CSVs in this repository are the export: one file per sheet, with the
computed date span and link count appended.
