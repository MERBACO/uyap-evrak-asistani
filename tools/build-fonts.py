#!/usr/bin/env python3
"""
Subset Liberation Serif and extract the metrics the PDF writer needs.

Run once; the output is committed. It is a build step rather than runtime work
because parsing a TrueType file in the extension would mean shipping a TTF
parser for information that never changes.

Liberation Serif is used because it is metric-compatible with Times New Roman —
the family UYAP's own documents declare — and because the SIL Open Font License
permits redistribution inside another project.

    python3 tools/build-fonts.py
"""

import json
import pathlib
from fontTools import subset
from fontTools.ttLib import TTFont

KAYNAK = {
    "serif": "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
    "serif-bold": "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
}

# Generous on purpose: Turkish court documents are Latin, but party names,
# currency symbols and typographic quotes turn up constantly, and a character
# that is missing from the subset silently disappears from the PDF.
ARALIKLAR = [
    (0x0020, 0x00FF),  # Basic Latin + Latin-1 (covers Ç Ö Ü ç ö ü)
    (0x0100, 0x017F),  # Latin Extended-A (Ğ ğ İ ı Ş ş)
    (0x0180, 0x024F),  # Latin Extended-B
    (0x2000, 0x206F),  # punctuation, dashes, quotes
    (0x20A0, 0x20BF),  # currency, including ₺
    (0x2190, 0x21FF),  # arrows
    (0x2200, 0x22FF),  # maths
    (0x25A0, 0x25FF),  # geometric shapes
]

HEDEF = pathlib.Path(__file__).resolve().parent.parent / "fonts"


def main():
    HEDEF.mkdir(exist_ok=True)
    karakterler = [c for bas, son in ARALIKLAR for c in range(bas, son + 1)]
    olculer = {}

    for ad, yol in KAYNAK.items():
        font = TTFont(yol)
        subsetter = subset.Subsetter(
            options=subset.Options(
                layout_features=[],
                notdef_outline=True,
                recalc_bounds=True,
                drop_tables=["DSIG"],
            )
        )
        subsetter.populate(unicodes=karakterler)
        subsetter.subset(font)

        cikti = HEDEF / f"{ad}.ttf"
        font.save(cikti)

        # The PDF writer needs: which glyph draws a character, and how wide it is.
        alt = TTFont(cikti)
        cmap = alt.getBestCmap()
        glifler = alt.getGlyphOrder()
        indeks = {g: i for i, g in enumerate(glifler)}
        hmtx = alt["hmtx"]
        birim = alt["head"].unitsPerEm

        harita = {}
        genislik = {}
        for kod, glif in cmap.items():
            gid = indeks.get(glif)
            if gid is None:
                continue
            harita[str(kod)] = gid
            genislik[str(gid)] = round(hmtx[glif][0] * 1000 / birim)

        os = alt["OS/2"]
        olculer[ad] = {
            "dosya": f"{ad}.ttf",
            "unitsPerEm": birim,
            "ascent": round(alt["hhea"].ascent * 1000 / birim),
            "descent": round(alt["hhea"].descent * 1000 / birim),
            "capHeight": round(getattr(os, "sCapHeight", 700) * 1000 / birim),
            "italicAngle": alt["post"].italicAngle,
            "bbox": [
                round(alt["head"].xMin * 1000 / birim),
                round(alt["head"].yMin * 1000 / birim),
                round(alt["head"].xMax * 1000 / birim),
                round(alt["head"].yMax * 1000 / birim),
            ],
            "cmap": harita,
            "widths": genislik,
        }
        print(f"{ad:12} {cikti.stat().st_size // 1024:>4} KB · {len(harita)} karakter")

    (HEDEF / "metrics.json").write_text(
        json.dumps(olculer, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
    )
    print("metrics.json", (HEDEF / "metrics.json").stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
