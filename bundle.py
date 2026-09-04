"""Inline data.js and app.js into network.html to make the one-file page.

Writes whoknewwhom.html (the file to publish as an artifact) and index.html
(the identical copy GitHub Pages serves). Run after build.py.
"""
import io
import os
import re

shell = io.open('network.html', encoding='utf-8').read()
data = io.open('data.js', encoding='utf-8').read()
app = io.open('app.js', encoding='utf-8').read()

# A literal </script> inside the inlined JS would close the tag early. Neither file
# has one today, but split it defensively rather than trust that.
def safe(js):
    return js.replace('</script>', '<\\/script>')

out = shell.replace(
    '<script src="data.js"></script>\n<script src="app.js"></script>',
    '<script>\n' + safe(data) + '</script>\n<script>\n' + safe(app) + '</script>')

if '<script src="data.js">' in out:
    raise SystemExit('bundle: the script tags in network.html did not match')

# Visit counting, if any set, goes into the Pages copy only. The published artifact
# cannot make an outbound request of any kind, so a snippet there would be dead weight
# that also implied the page was being counted when it was not.
snippet = ''
if os.path.exists('analytics.html'):
    raw = io.open('analytics.html', encoding='utf-8').read()
    marker = '<!-- ---- paste below this line ---- -->'
    snippet = raw.split(marker, 1)[1].strip() if marker in raw else ''
if snippet:
    snippet = '<script>window.__COUNTED__ = true;</script>\n' + snippet + '\n'
    print('analytics: a snippet is set, going into index.html only')
else:
    print('analytics: none set, nothing is counted')

# whoknewwhom.html is the artifact upload: claude.ai supplies the doctype and head.
# index.html is served raw by GitHub Pages, so it needs the full document itself —
# without a doctype the browser goes into quirks mode and the height:100% grid collapses.
PAGE = ('<!doctype html>\n<html lang="en-GB">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
        '<meta name="description" content="Who knew whom in Victorian Manchester: '
        'people, specimens and knowledge moving between workplaces, societies, fields, '
        'private collections and museums.">\n%s\n%s</head>\n<body>\n%s\n</body>\n</html>\n')

head, rest = out.split('<style>', 1)
rest = '<style>' + rest
body_start = rest.index('<div class="app">')

for name, text in (
    ('whoknewwhom.html', out),
    ('index.html', PAGE % (head + rest[:body_start], snippet, rest[body_start:])),
):
    with io.open(name, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    print('wrote %s  %d KB' % (name, len(text.encode('utf-8')) // 1024))

print('nodes %s, links %s' % (
    len(re.findall(r'\n\{"id":', data.split('const NODES')[1].split('const LINKS')[0])),
    len(re.findall(r'\n\{"id":', data.split('const LINKS')[1]))))
