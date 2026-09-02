# Who Knew Whom

The Victorian Manchester natural-history workshop database, restructured as a network you
can read, filter by decade, and edit.

Built from `Victorian_Manchester_Natural_History_Workshop.xlsx`. Every node and link here is
something a row of that workbook asserts — nothing is invented. Where the workbook flags
something as unconfirmed, or offers a hypothesis rather than a fact, the graph shows that in
the line style rather than hiding it in a status column.

## Files

| File | What it is |
|---|---|
| `people.csv` | 222 people, societies and places, one row each |
| `links.csv` | 229 relationship assertions, one row each (186 unique pairs) |
| `data.js` | the same data as JS literals — the source the page loads |
| `app.js` | graph rendering, decade filter, editable sheet |
| `network.html` | development page (loads `data.js` and `app.js` separately) |
| `whoknewwhom.html` | the published single-file bundle |

`whoknewwhom.html` is generated — don't hand-edit it. Rebuild after changing `data.js`,
`app.js` or `network.html`:

```powershell
$html = [IO.File]::ReadAllText("network.html")
$html = $html.Replace('<script src="data.js"></script>',  "<script>`n" + [IO.File]::ReadAllText("data.js") + "`n</script>")
$html = $html.Replace('<script src="app.js"></script>',   "<script>`n" + [IO.File]::ReadAllText("app.js")  + "`n</script>")
[IO.File]::WriteAllText("whoknewwhom.html", $html, (New-Object Text.UTF8Encoding($false)))
```

## The columns

**people.csv**

- `id` — short stable key used by `links.csv`
- `kind` — `person`, `org` or `place`
- `field` — one of seven fields of activity: `nat`, `press`, `trade`, `suff`, `reform`,
  `civic`, `arts`
- `active_from` / `active_to` — the years used by the decade slider
- `active_source` — `workbook` where the spreadsheet's own "Decades active" column
  states it, `inferred` where it was derived from a lifespan. Never treat an inferred
  span as a record.
- `data_note` — a problem found in the source data: a duplicate ID, a missing record, a
  name that contradicts another row
- `workbook_id` — the original People-sheet ID, or blank where the row has none

**links.csv**

- `evidence` — `documented` (a workbook row says it), `verify` (the workbook flags it as
  unconfirmed), `interpretive` (a hypothesis the workbook offers for testing)
- `note` — what the workbook actually says, including the REL / TL reference where there
  is one

## Known problems in the source data

These are carried through as `data_note` values rather than silently corrected, because
deciding them is the workshop's job:

- **Duplicate records.** John Edward Taylor (200013 / 200100), John Shuttleworth
  (200014 / 200102), Absalom Watkin (200015 / 200103), Joseph Brotherton (200037 / 200107).
  200016 merges Thomas and Richard Potter into one row and duplicates 200104.
- **Mary / Martha Brotherton.** 200038 and 200087 share dates and are probably one person.
- **Name conventions.** Richard Cobden's row names his wife "Catherine Anne Williams";
  her own row (200091) calls her Cobden.
- **Ten rows have no ID**, three use `sw`.
- **Thirteen people are named in the events and relationship text but have no record**:
  Elizabeth Wolstenholme-Elmy, Richard Pankhurst, Sarah Dickenson, Agnes Pochin, Josephine
  Butler, Emily Davies, Anne Clough, Priscilla Bright McLaren, Anne Robertson, and the
  naturalists John Curtis, William Henry Pearson, Thomas Brittain, James Cash.
- **Column drift.** In the source People sheet the Politics column carries marriage
  narratives on many rows, while `Relationship / wife` sits empty.
- **Scope.** Shelagh Delaney (1938–2011), Kate Isitt and Marie Stopes sit unflagged
  alongside Peterloo-era figures; the Timeline sheet has a scope flag, People does not.
- **Date conflict.** John Leigh Philips: a University page gives 1761–1841, the Museum
  archive 1761–1814.

## Editing

The published page has a Spreadsheet tab. Edits are stored per row in the artifact's shared
store, so several people can work at once and everyone sees the same data; they do not
overwrite `data.js`. To fold edits back into this repo, export CSV from the page, or ask
Claude to read the store and regenerate `data.js`.
