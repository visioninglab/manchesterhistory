"""Inline data.js and app.js into network.html, once per edition.

    python bundle.py

The same source is built three times:

    index.html                              the original address, kept working;
                                            the full edition
    dist/manchesterhistories/index.html     the public edition: network, map and
                                            timeline, and the reader's filters only
    dist/manchesterhistories_wip/index.html the full edition, marked as work in progress

There is one copy of the data and one copy of the code, so a correction made once
reaches every edition. What differs is a class on <html> - anything marked data-wip
is hidden in the public edition - and which visit counter each address reports to, so
the three can be told apart when the numbers are read back.

Run build.py first. Push the dist folders with publish.py.
"""
import io
import os
import re

OUTPUTS = [
    # path                                        edition   counter namespace
    ("index.html",                               "wip",    "wkw-mcr"),
    ("dist/manchesterhistories/index.html",      "public", "wkw-pub"),
    ("dist/manchesterhistories_wip/index.html",  "wip",    "wkw-wip"),
]

shell = io.open('network.html', encoding='utf-8').read()
data = io.open('data.js', encoding='utf-8').read()
app = io.open('app.js', encoding='utf-8').read()


def safe(js):
    """A literal </script> inside inlined JS would close the tag early. Neither file has
    one today, but split it defensively rather than trust that."""
    return js.replace('</script>', '<\\/script>')


out = shell.replace(
    '<script src="data.js"></script>\n<script src="app.js"></script>',
    '<script>\n' + safe(data) + '</script>\n<script>\n' + safe(app) + '</script>')
if '<script src="data.js">' in out:
    raise SystemExit('bundle: the script tags in network.html did not match')

# The counter, if any is set. Its namespace is swapped per address below.
counter = ''
if os.path.exists('analytics.html'):
    raw = io.open('analytics.html', encoding='utf-8').read()
    marker = '<!-- ---- paste below this line ---- -->'
    counter = raw.split(marker, 1)[1].strip() if marker in raw else ''

# Served raw by GitHub Pages, so each page needs the full document itself: without a
# doctype the browser drops into quirks mode and the height:100% grid collapses.
PAGE = ('<!doctype html>\n<html lang="en-GB" class="ed-%s">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
        '<meta name="description" content="Who knew whom in Victorian Manchester: '
        'people, specimens and knowledge moving between workplaces, societies, fields, '
        'private collections and museums.">\n%s\n%s</head>\n<body>\n%s\n</body>\n</html>\n')

head, rest = out.split('<style>', 1)
rest = '<style>' + rest
body_start = rest.index('<div class="app">')

for path, edition, ns in OUTPUTS:
    snippet = ''
    if counter:
        snippet = ('<script>window.__COUNTED__ = true; window.EDITION = "%s";</script>\n'
                   % edition + counter.replace('/wkw-mcr/', '/%s/' % ns) + '\n')
    else:
        snippet = '<script>window.EDITION = "%s";</script>\n' % edition
    page = PAGE % (edition, head + rest[:body_start], snippet, rest[body_start:])
    d = os.path.dirname(path)
    if d and not os.path.isdir(d):
        os.makedirs(d)
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(page)
    print('wrote %-42s %-6s  counter %-8s %d KB'
          % (path, edition, ns if counter else '-', len(page.encode('utf-8')) // 1024))

print('nodes %s, links %s' % (
    len(re.findall(r'\n\{"id":', data.split('const NODES')[1].split('const LINKS')[0])),
    len(re.findall(r'\n\{"id":', data.split('const LINKS')[1]))))
