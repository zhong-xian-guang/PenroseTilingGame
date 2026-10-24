"""Subset and rename the LINE Seed fonts for the Penrose Tiling Game.

Called by scripts/build-fonts.ts; not meant to be run by hand. Reads a JSON job
on stdin and prints a JSON report on stdout:

  job:    {"enZip", "twZip", "outDir", "charset": [code points]}
  report: {"en": [code points], "tw": [code points], "missing": [code points],
           "files": [{"family", "weight", "file"}]}

Latin goes to PTG Sans (from LINE Seed Sans EN); every other character that
LINE Seed TW has goes to PTG Sans TC. The name table is rewritten so neither
subset carries the original (reserved / trademarked) font names, as the SIL OFL
1.1 requires for Modified Versions.

Requires fontTools and brotli: python -m pip install fonttools brotli
"""

import io
import json
import os
import sys
import zipfile

from fontTools import subset
from fontTools.ttLib import TTFont

# Only the weights both families have: Thin, Regular, Bold, ExtraBold.
WEIGHTS = [
    # (css weight, style name, EN member, TW member)
    (100, "Thin", "LINESeedSans_Th.ttf", "LINESeedTW_TTF_Th.ttf"),
    (400, "Regular", "LINESeedSans_Rg.ttf", "LINESeedTW_TTF_Rg.ttf"),
    (700, "Bold", "LINESeedSans_Bd.ttf", "LINESeedTW_TTF_Bd.ttf"),
    (800, "ExtraBold", "LINESeedSans_XBd.ttf", "LINESeedTW_TTF_Eb.ttf"),
]
EN_DIR = "LINE_Seed_Sans_V1.003/Desktop/TTF/"
TW_DIR = "LINE Seed TW_ver02/TTF/"

FAMILIES = {"en": ("PTG Sans", "ptg-sans"), "tw": ("PTG Sans TC", "ptg-sans-tc")}

# Name IDs kept from the original: copyright, designer/vendor credits, license.
KEEP_NAME_IDS = {0, 5, 8, 9, 11, 12, 13, 14}


def load(zip_path, member):
    with zipfile.ZipFile(zip_path) as z:
        return TTFont(io.BytesIO(z.read(member)))


def rename(font, family, style):
    name = font["name"]
    version = name.getDebugName(5) or "Version 1.000"
    ribbi = style in ("Regular", "Bold")
    ps_name = f"{family.replace(' ', '')}-{style}"
    name.names = [n for n in name.names if n.platformID == 3 and n.nameID in KEEP_NAME_IDS]
    for name_id, value in (
        (1, family if ribbi else f"{family} {style}"),
        (2, style if ribbi else "Regular"),
        (3, f"{version.replace('Version ', '')};PTG;{ps_name}"),
        (4, f"{family} {style}"),
        (6, ps_name),
        (16, family),
        (17, style),
    ):
        name.setName(value, name_id, 3, 1, 0x409)


def make_subset(font, codepoints):
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.hinting = False
    options.notdef_outline = True
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=codepoints)
    subsetter.subset(font)
    font.flavor = "woff2"


def cmap_of(font):
    return set(font.getBestCmap().keys())


def main():
    # the job is UTF-8 JSON; sys.stdin would decode it with the locale encoding (cp950 on a zh-TW Windows)
    job = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    charset = set(job["charset"])
    out_dir = job["outDir"]
    os.makedirs(out_dir, exist_ok=True)

    en_cover = charset & cmap_of(load(job["enZip"], EN_DIR + WEIGHTS[1][2]))
    tw_cover = (charset - en_cover) & cmap_of(load(job["twZip"], TW_DIR + WEIGHTS[1][3]))
    missing = charset - en_cover - tw_cover

    files = []
    for weight, style, en_member, tw_member in WEIGHTS:
        for key, zip_path, member, cover in (
            ("en", job["enZip"], EN_DIR + en_member, en_cover),
            ("tw", job["twZip"], TW_DIR + tw_member, tw_cover),
        ):
            family, slug = FAMILIES[key]
            font = load(zip_path, member)
            make_subset(font, sorted(cover))
            rename(font, family, style)
            file_name = f"{slug}-{weight}.woff2"
            font.save(os.path.join(out_dir, file_name))
            files.append({"family": family, "weight": weight, "file": file_name})

    json.dump(
        {"en": sorted(en_cover), "tw": sorted(tw_cover), "missing": sorted(missing), "files": files},
        sys.stdout,
    )


if __name__ == "__main__":
    main()
