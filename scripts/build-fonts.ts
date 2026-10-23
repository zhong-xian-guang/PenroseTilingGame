/**
 * Font build step: subsets LINE Seed Sans (EN) and LINE Seed TW down to the
 * characters the interface uses, renames them PTG Sans / PTG Sans TC and writes
 * WOFF2 files plus `fonts.css` into src/fonts/.
 *
 *   node scripts/build-fonts.ts          rebuild only if the character set changed
 *   node scripts/build-fonts.ts --force  always rebuild
 *
 * The character set comes from every locale file, the OFL text shown on the
 * About page, and EXTRA_TEXT below. When it matches src/fonts/manifest.json the
 * committed subsets are reused, so a normal build needs neither Python nor the
 * network. Otherwise the official zips are downloaded from https://seed.line.me/
 * into .cache/fonts/ and scripts/subset_fonts.py (fontTools) does the subsetting.
 *
 * Run by Node directly (type stripping), so imports carry the .ts extension.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectCharset, findUnsupportedSymbols, toUnicodeRange } from '../src/i18n/charset.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCALE_DIR = join(ROOT, 'src/i18n/locales');
const FONT_DIR = join(ROOT, 'src/fonts');
const OFL_FILE = join(FONT_DIR, 'OFL.txt');
const MANIFEST_FILE = join(FONT_DIR, 'manifest.json');
const CSS_FILE = join(FONT_DIR, 'fonts.css');
const CACHE_DIR = join(ROOT, '.cache/fonts');

/** Bump when the subsetting/renaming logic changes, to force a rebuild. */
const BUILD_VERSION = 1;

/** Glyphs written directly in components rather than in locale files. */
const EXTRA_TEXT = '+−';

const SOURCES = {
  en: { url: 'https://seed.line.me/src/images/fonts/LINE_Seed_Sans_EN.zip', file: 'LINE_Seed_Sans_EN.zip' },
  tw: { url: 'https://seed.line.me/src/images/fonts/LINE_Seed_TW.zip', file: 'LINE_Seed_TW.zip' },
};

interface Report {
  en: number[];
  tw: number[];
  missing: number[];
  files: { family: string; weight: number; file: string }[];
}

interface Manifest {
  version: number;
  charset: string;
  report: Report;
}

function readTexts(): string[] {
  const texts: string[] = [EXTRA_TEXT, readFileSync(OFL_FILE, 'utf8')];
  for (const file of readdirSync(LOCALE_DIR).filter((f) => f.endsWith('.json')).sort()) {
    const messages = JSON.parse(readFileSync(join(LOCALE_DIR, file), 'utf8')) as Record<string, string>;
    for (const [key, text] of Object.entries(messages)) {
      const bad = findUnsupportedSymbols(text);
      if (bad.length > 0) {
        console.warn(
          `[fonts] warning: ${file} "${key}" uses ${bad.join(' ')}, which neither LINE Seed font has; ` +
            'write「平方單位」/ a CSS superscript instead.',
        );
      }
      texts.push(text);
    }
  }
  return texts;
}

function readManifest(): Manifest | null {
  try {
    return JSON.parse(readFileSync(MANIFEST_FILE, 'utf8')) as Manifest;
  } catch {
    return null;
  }
}

async function ensureSource(key: keyof typeof SOURCES): Promise<string> {
  const { url, file } = SOURCES[key];
  const path = join(CACHE_DIR, file);
  if (existsSync(path)) return path;
  mkdirSync(CACHE_DIR, { recursive: true });
  console.log(`[fonts] downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`[fonts] download failed: ${url} → HTTP ${res.status}`);
  writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  return path;
}

function runPython(job: object): Report {
  const script = join(ROOT, 'scripts/subset_fonts.py');
  const candidates = [process.env.PYTHON, 'python3', 'python', 'py'].filter((c): c is string => !!c);
  for (const python of candidates) {
    const result = spawnSync(python, [script], {
      input: JSON.stringify(job),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (result.error) continue; // not installed under this name
    if (result.status !== 0) {
      // Missing fontTools, or the Windows "python3" app-store stub (exit 9009).
      if (result.status === 9009 || /No module named|ModuleNotFoundError|was not found/.test(result.stderr)) continue;
      throw new Error(`[fonts] ${python} subset_fonts.py failed:\n${result.stderr}`);
    }
    return JSON.parse(result.stdout) as Report;
  }
  throw new Error(
    '[fonts] the interface character set changed, so the font subsets must be rebuilt, but no Python with ' +
      'fontTools was found. Install it with `python -m pip install fonttools brotli` (or set PYTHON) and run ' +
      '`npm run fonts`.',
  );
}

function writeCss(report: Report) {
  const range = { 'PTG Sans': toUnicodeRange(report.en), 'PTG Sans TC': toUnicodeRange(report.tw) };
  const faces = report.files.map(
    ({ family, weight, file }) => `@font-face {
  font-family: '${family}';
  src: url('./${file}') format('woff2');
  font-weight: ${weight};
  font-style: normal;
  font-display: swap;
  unicode-range: ${range[family as keyof typeof range]};
}`,
  );
  writeFileSync(
    CSS_FILE,
    `/* Generated by scripts/build-fonts.ts; do not edit. Based on LINE Seed Sans and LINE Seed TW
   by LY Corporation, subset and renamed under the SIL OFL 1.1 (see OFL.txt). */\n\n${faces.join('\n\n')}\n`,
  );
}

function warnMissing(codepoints: number[]) {
  if (codepoints.length === 0) return;
  const chars = codepoints.map((c) => `${String.fromCodePoint(c)} (U+${c.toString(16).toUpperCase()})`);
  console.warn(`[fonts] warning: neither font has ${chars.join(', ')}; these fall back to a system font.`);
}

async function main() {
  const force = process.argv.includes('--force');
  const charset = collectCharset(readTexts());
  const charsetText = String.fromCodePoint(...charset);

  const previous = readManifest();
  const upToDate =
    !force &&
    previous?.version === BUILD_VERSION &&
    previous.charset === charsetText &&
    existsSync(CSS_FILE) &&
    previous.report.files.every((f) => existsSync(join(FONT_DIR, f.file)));
  if (upToDate) {
    warnMissing(previous.report.missing);
    console.log(`[fonts] subsets up to date (${charset.length} characters)`);
    return;
  }

  const [enZip, twZip] = [await ensureSource('en'), await ensureSource('tw')];
  console.log(`[fonts] subsetting ${charset.length} characters`);
  const report = runPython({ enZip, twZip, outDir: FONT_DIR, charset });
  warnMissing(report.missing);
  writeCss(report);
  const manifest: Manifest = { version: BUILD_VERSION, charset: charsetText, report };
  writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`[fonts] wrote ${report.files.length} WOFF2 files (EN ${report.en.length}, TC ${report.tw.length} chars)`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
