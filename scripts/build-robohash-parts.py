#!/usr/bin/env python3
"""
build-robohash-parts.py — one-off asset pipeline that turns a Robohash checkout
into Anemone's vendored part library (img/robohash/) plus its manifest.

This is NOT part of the app or `npm test`; it is the provenance record for the
committed assets. Run it again only to re-import a set or change PART_SIZE.

    pip install pillow
    git clone --depth 1 https://github.com/e1ven/Robohash.git /tmp/Robohash
    python3 scripts/build-robohash-parts.py /tmp/Robohash --set set4

Why re-encode rather than vendor upstream verbatim:

  * Upstream set4 is 66 PNGs at 1024x1024 = 8.3 MB. At 384x384 WebP it is
    0.66 MB, which is what a classroom of browsers actually has to download.
    384 is a compromise: tiles render at 128 and the zoom lightbox at 768, so
    the lightbox upscales 2x — fine for this soft, outlined, painted art.
  * Upstream part files are named `000#body0.png`. A literal `#` in a URL is a
    fragment delimiter and has to be percent-encoded everywhere it appears, so
    parts are renamed to plain indices here and the original filename is kept
    in the manifest for attribution/debugging.
  * Robohash picks a part per directory using a slice of a SHA; Anemone picks
    it with a gene. Both need the SAME stable index -> file mapping forever,
    or a saved genome (embedded in an exported PNG) would decode to a
    different cat later. The manifest is that pinned mapping.

Two orderings in upstream matter and are NOT the same:

  * the number BEFORE the '#' in a directory name is the hash-slot order;
  * the label AFTER it, sorted alphabetically, is the paste (z) order --
    `roboparts.sort(key=lambda x: x.split("#")[1])` in robohash.py.

Slots are emitted here already sorted into paste order, so the renderer just
iterates the list.

Also recorded per part: the alpha bounding box, normalised to 0..1. Anemone
rotates and scales each part about its OWN centre so that (say) jittered eyes
turn in place instead of swinging around the canvas centre.

Symlinked duplicates (set6 uses them for rarity weighting: an eye variant that
appears once among many `none-N.png` is correspondingly rare) are preserved as
distinct manifest ENTRIES pointing at one deduplicated FILE, so the rarity
distribution survives the import at no extra byte cost.
"""

import argparse
import io
import json
import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("This script needs Pillow:  pip install pillow")

PART_SIZE = 384          # px; see module docstring for why
WEBP_QUALITY = 88

# Per-set metadata. Licences differ per set and CC-BY requires attribution, so
# this rides in the manifest and is surfaced in the app (genome panel + About).
SETS = {
    "set4": {
        "label": "Cats",
        "artist": "David Revoy",
        "artistUrl": "https://www.peppercarrot.com/extras/html/2016_cat-generator/",
        "license": "CC-BY-4.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
    },
    "set1": {
        "label": "Robots",
        "artist": "Zikri Kader",
        "artistUrl": "https://github.com/e1ven/Robohash",
        "license": "CC-BY-3.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/3.0/",
    },
    "set2": {
        "label": "Monsters",
        "artist": "Hrvoje Novakovic",
        "artistUrl": "https://github.com/e1ven/Robohash",
        "license": "CC-BY-3.0",
        "licenseUrl": "https://creativecommons.org/licenses/by/3.0/",
    },
}


def slot_name(dirname):
    """`000#04accessories` -> `accessories` (strip both number prefixes)."""
    label = dirname.split("#", 1)[1] if "#" in dirname else dirname
    return label.lstrip("0123456789") or label


def paste_order(dirnames):
    """Upstream's z-order: sort by the label AFTER the '#'."""
    return sorted(dirnames, key=lambda d: d.split("#", 1)[1] if "#" in d else d)


def build_set(src_root, set_name, out_root):
    set_dir = src_root / "robohash" / "sets" / set_name
    if not set_dir.is_dir():
        sys.exit(f"No such set: {set_dir}")

    subdirs = [d.name for d in set_dir.iterdir() if d.is_dir()]
    if not subdirs:
        sys.exit(f"{set_dir} has no part directories (set1 is nested per colour "
                 f"and needs a colour subdirectory — not supported yet)")

    slots = []
    total_bytes = 0

    for src_dir in paste_order(subdirs):
        name = slot_name(src_dir)
        files = sorted((set_dir / src_dir).iterdir())
        files = [f for f in files if f.suffix.lower() == ".png"]

        out_dir = out_root / set_name / name
        out_dir.mkdir(parents=True, exist_ok=True)

        entries = []
        written = {}          # realpath -> output filename (dedupes symlinks)

        for src in files:
            real = os.path.realpath(src)
            if real in written:
                # A symlinked duplicate: same file, its own manifest entry, so
                # the upstream rarity weighting is preserved.
                entries.append({"file": written[real], "src": src.name,
                                "bbox": entries[[e["file"] for e in entries].index(written[real])]["bbox"]})
                continue

            img = Image.open(src).convert("RGBA")

            # Alpha bbox in the ORIGINAL resolution, normalised — the pivot for
            # this part's rotation/scale.
            box = img.getchannel("A").getbbox()
            if box is None:
                bbox = None                      # fully transparent ("no pattern")
            else:
                w, h = img.size
                bbox = [round(box[0] / w, 4), round(box[1] / h, 4),
                        round(box[2] / w, 4), round(box[3] / h, 4)]

            out_name = f"{len(written):02d}.webp"
            small = img.resize((PART_SIZE, PART_SIZE), Image.LANCZOS)
            buf = io.BytesIO()
            small.save(buf, "WEBP", quality=WEBP_QUALITY, method=4)
            (out_dir / out_name).write_bytes(buf.getvalue())
            total_bytes += buf.tell()

            written[real] = out_name
            entries.append({"file": out_name, "src": src.name, "bbox": bbox})

        slots.append({"name": name, "srcDir": src_dir, "parts": entries})
        print(f"  {name:14s} {len(entries):3d} entries "
              f"({len(written)} unique files)")

    meta = dict(SETS.get(set_name, {}))
    meta.update({
        "size": PART_SIZE,
        "dir": f"img/robohash/{set_name}",
        "upstream": f"https://github.com/e1ven/Robohash (sets/{set_name})",
        "slots": slots,
    })
    print(f"  total {total_bytes / 1e6:.2f} MB")
    return meta


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("robohash", type=Path, help="path to a Robohash checkout")
    ap.add_argument("--set", action="append", dest="sets", default=None,
                    help="set to import (repeatable); default set4")
    ap.add_argument("--out", type=Path, default=None,
                    help="output img/robohash dir (default: repo img/robohash)")
    args = ap.parse_args()

    repo = Path(__file__).resolve().parent.parent
    out_root = args.out or (repo / "img" / "robohash")
    out_root.mkdir(parents=True, exist_ok=True)

    manifest = {}
    for set_name in (args.sets or ["set4"]):
        print(f"{set_name}:")
        manifest[set_name] = build_set(args.robohash, set_name, out_root)

    body = json.dumps({"version": 1, "sets": manifest}, indent=1)
    header = (
        "/*\n"
        " * robohash/manifest.js — GENERATED by scripts/build-robohash-parts.py.\n"
        " * Do not edit by hand; re-run the script instead.\n"
        " *\n"
        " * The pinned index -> file mapping for the vendored Robohash parts. A\n"
        " * genome stores one index per slot, so this ordering must never change:\n"
        " * a saved individual (its PTO trace, embedded in an exported PNG) would\n"
        " * otherwise decode to a different creature.\n"
        " *\n"
        " * Slots are in PASTE (z) order. `bbox` is the part's alpha bounding box\n"
        " * normalised to 0..1, used as the pivot when a part is scaled/rotated.\n"
        " *\n"
        " * A plain <script> assigning a global rather than JSON + fetch(), so the\n"
        " * app still works when index.html is opened over file://, where fetch()\n"
        " * of a local file is blocked.\n"
        " */\n"
    )
    (out_root / "manifest.js").write_text(
        header + "window.ROBOHASH_MANIFEST = " + body + ";\n")
    print(f"wrote {out_root / 'manifest.js'}")


if __name__ == "__main__":
    main()
