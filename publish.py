"""Push each built edition to its own repository, where GitHub Pages serves it.

    python build.py && python bundle.py && python publish.py

The code and the data live here, in manchesterhistory. The two edition repositories hold
nothing but the built page, so there is only ever one place to make a change:

    visioninglab/manchesterhistories      https://visioninglab.github.io/manchesterhistories/
    visioninglab/manchesterhistories_wip  https://visioninglab.github.io/manchesterhistories_wip/

Each is checked out next to this folder the first time it is published, and after that
only the page is copied across and committed when it has actually changed.
"""
import io
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ORG = "visioninglab"
TARGETS = ["manchesterhistories", "manchesterhistories_wip"]
SOURCE = "https://github.com/%s/manchesterhistory" % ORG

README = """# {name}

The built page for **Who Knew Whom**, {what}.

Nothing here is edited by hand. The data, the code and the build all live in
[{org}/manchesterhistory]({src}); this repository is written by its `publish.py`.

Live at https://{org}.github.io/{name}/
"""
WHAT = {
    "manchesterhistories": "the public edition: the network, the map and the timeline",
    "manchesterhistories_wip": "the work-in-progress edition, with the open research "
                               "threads, the table and every filter",
}


def run(cmd, cwd):
    print("  $ " + " ".join(cmd))
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.stderr.write(r.stdout + r.stderr)
        raise SystemExit("failed: " + " ".join(cmd))
    return r.stdout


def publish(name, message):
    built = os.path.join(HERE, "dist", name, "index.html")
    if not os.path.exists(built):
        raise SystemExit("%s: nothing built - run bundle.py first" % name)
    checkout = os.path.join(os.path.dirname(HERE), name)
    if not os.path.isdir(os.path.join(checkout, ".git")):
        run(["git", "clone", "https://github.com/%s/%s.git" % (ORG, name), checkout],
            os.path.dirname(HERE))
    # Commit as whoever commits here, so the edition repos carry the same authorship.
    for key in ("user.name", "user.email"):
        val = run(["git", "config", key], HERE).strip()
        if val:
            run(["git", "config", key, val], checkout)

    shutil.copyfile(built, os.path.join(checkout, "index.html"))
    with io.open(os.path.join(checkout, "README.md"), "w", encoding="utf-8",
                 newline="\n") as f:
        f.write(README.format(name=name, org=ORG, src=SOURCE, what=WHAT[name]))
    # Plain HTML: skip the Jekyll pass Pages would otherwise run over it.
    io.open(os.path.join(checkout, ".nojekyll"), "w").close()

    run(["git", "add", "-A"], checkout)
    if not run(["git", "status", "--porcelain"], checkout).strip():
        print("%s: already up to date" % name)
        return
    run(["git", "commit", "-q", "-m", message + "\n\nBuilt from " + SOURCE + "\n\n"
         "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"], checkout)
    run(["git", "push", "-q", "origin", "HEAD"], checkout)
    print("%s: published" % name)


if __name__ == "__main__":
    msg = sys.argv[1] if len(sys.argv) > 1 else "Rebuild from manchesterhistory"
    for t in TARGETS:
        publish(t, msg)
