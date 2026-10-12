# UYAP Dosyalama ve Evrak Asistanı

**A Chrome extension for the UYAP Attorney Portal: bulk, chronological archiving and printing of court documents, a 30-day hearing list, and one-click mobile-signature login.**

Formerly *UYAP Arşiv* and *UYAP Yardımcısı*; settings, records and the `UYAP Arsiv` download folder carry over unchanged.

[Türkçe README →](README.tr.md)

Turkish lawyers reach their case files through
[avukat.uyap.gov.tr](https://avukat.uyap.gov.tr). The portal hands over one document
at a time: archiving a file of two hundred documents means two hundred clicks, and
what lands in `Downloads` is an unordered pile under portal-generated names.

This extension downloads a whole case file in **date order**, into a single folder
whose own alphabetical sort reproduces the chronology.

```
UYAP Arsiv/
└── 2026-1234 Örnekköy 3. Asliye Ceza Mahkemesi - Ceza Dava Dosyası/
    ├── 001_2020-01-04_2020-999(CBS Sorusturma Dosyası)_Kolluk Kuvveti İhbar Evrakı.pdf
    ├── 002_2026-07-03_İfade Tutanağı_[Müdafii MERT BAYUR].udf
    ├── 003_2026-07-27_Genel Karar-Müzekkere.udf
    ├── 004_2026-07-27_Ek 01 · Kolluktan Gelen Fezleke Yazısı.pdf
    └── 005_2026-08-20_Tensip Zaptı.udf
```

The numeric prefix is the point. Five years from now the archive still reads in order
without this extension, without a viewer, without a database. Documents from linked
case files carry that file's number in their name; attachments follow the document
they belong to.

## What it does

- **Lists** every document of the open case file, oldest first, including linked
  soruşturma and talimat files and the attachments hanging off each document.
- **Shows what is new.** Documents filed since you last looked at the case file are
  marked, and can be selected in one click. Each case file's history — when it
  was listed, downloaded and printed — is shown in the panel.
- **Filters** by document type. A type you never want can be excluded permanently, so
  the rule applies to every case file you open afterwards.
- **Skips duplicates** by content hash — the same attachment repeated across twenty
  documents is downloaded once, and printed once.
- **Narrows** a long file by free-text search and date range.
- **Searches inside documents.** Once the contents have been scanned, the search box
  also looks inside UDF, PDF (including PDFs encrypted without a password), Word,
  Excel, KEP, HTML and EYP documents, and shows the passage it found. Turkish letters
  and case do not matter. The text is held in the page's memory only.
- **Prints** the selection as one merged document, in order, whatever format each
  document arrives in. UDF documents are rendered to PDF, PDFs are copied page for
  page, images and multi-page TIFF scans are placed on pages, and EYP packages are
  opened and their contents merged. HTML documents the portal generates, docx, eml
  and plain text are rendered as text; xlsx spreadsheets are printed as columns, or
  as records when too wide for the page. The page order can be reversed so a
  printed stack files correctly with the oldest document at the bottom, and a
  document whose last page carries only its signature block is fitted onto the
  previous one. An optional cover page identifies the file and leaves ruled space
  for parties, hearing dates and notes to be filled in by hand. An optional
  contents page gives the page each document starts on and links to it on
  screen; every document is a bookmark in the viewer's side panel, and every
  page is numbered.
- **Writes a spreadsheet index.** `000_Evrak Dizini.xlsx` at the head of the folder
  lists every document of the case file with its status; it filters, and each file
  name opens the document. Can be turned off in the settings.
- **Resumes.** A download or print stopped by a cancel, an expired session or a UYAP
  block is remembered per case file, and the panel offers **Kaldığı Yerden Devam Et**.
  Documents already on disk — or, for a print, still held in the page's memory — are
  not asked for again. While a UYAP wait is running the button is disabled and says
  how many minutes are left; **Beklemeyi Kaldır** reopens it at once.
- **Logs in with one click** (optional). Save your kimlik no, mobile-signature
  number and operator once in the popup; on UYAP's login page the panel then
  shows a **Giriş Yap** button that opens e-Devlet's mobile-signature form, fills
  it in, sends it and presses **İmzala**. All that is left is confirming on your
  phone.
- **Lists your hearings.** After you log in, the panel's **Duruşmalar** section fetches
  your hearings and site inspections for the 30 days starting today on its own; it
  does not ask again while the list it has is from today and under an hour old. The full
  table opens on a page of its own, day by day; it prints and exports to Excel.

## Why another one

There are several UYAP bulk downloaders on the Chrome Web Store. Almost all keep their
code hidden and some require a paid account. A tool that handles privileged client
documents should be open to inspection by the person relying on it, so this one's
source is public to read. It has no server and no account, and talks to nothing but
UYAP itself. The optional quick login fills in e-Devlet's own form in your tab.
Nothing is sent anywhere else.

## How it works

| Piece | Role |
|---|---|
| `src/inject/net-hook.js` | Page world. Watches the portal's own requests so the panel can replay them, and holds the session headers in memory. Initiates nothing. |
| `src/content/bridge.js` | Replays those requests from the portal's own origin, so UYAP sees what it would see if you had clicked. |
| `src/content/panel.js` | The panel: listing, filtering, the download and print runs. |
| `src/content/hizli-giris.js` | The quick-login section the panel shows on UYAP's login page; takes you to e-Devlet's mobile-signature form. |
| `src/content/edevlet-giris.js` | Fills that form and presses İmzala, only for a UYAP login started from the panel in the last 90 seconds. |
| `src/lib/preset.js` | Reads the response: where the documents are, which key holds the date, which id the download endpoint wants. |
| `src/lib/gorsel.js` | Puts scans into the PDF fast and losslessly; in the merged output, keeps one copy of each font and compresses the text. |
| `src/lib/engel.js` | Recognises UYAP's "access temporarily suspended" answer; stops the run and holds off new bulk runs for a while. |
| `src/lib/nabiz.js` | The "working or stuck?" line during long runs: elapsed time, the document being waited on, a stall warning. |
| `src/lib/queue.js` | Paces requests, backs off when the server pushes back, speeds up again when it stops. |
| `src/lib/naming.js` | Turns a document into a file name that still makes sense years later. |
| `src/lib/udf.js` | Reads UDF — UYAP's own document format — and renders it. |
| `src/lib/pdf.js` | Writes PDF with an embedded Turkish font, for printing UDF documents. |
| `src/lib/zip.js` | Writes a ZIP, when the whole case file is wanted as one download. |
| `src/lib/dizin.js` | Contents page, bookmarks and page numbers for the merged printout. |
| `src/lib/gecmis.js` | A case file's history of listings, downloads and printouts. |
| `src/lib/excel.js` | Writes the spreadsheet index, `000_Evrak Dizini.xlsx`. |
| `src/lib/pdfmetin.js` | Extracts the text of a PDF, for the in-document search. |
| `src/lib/pdfsifre.js` | Opens PDFs encrypted without a password (RC4, AES-128). |
| `src/lib/arama.js` | Turkish-insensitive matching and the passage to highlight. |
| `src/lib/mobilimza.js` | Checks and masks the quick-login details. |
| `src/content/durusmalar.js` | The panel's hearing section: the 30-day query and the list. |
| `src/lib/durusma.js` | Works out the query range and reads the hearing response. |
| `src/popup/durusmalar.html` | The hearing table: by day, printable, exportable to Excel. |
| `src/background/service-worker.js` | Writes to disk, raises notifications, attaches the e-Devlet script once you allow it, opens the hearing table. Never touches the network. |
| `presets/*.json` | The endpoint map — see below. |

### The endpoint map

UYAP's internal API is undocumented and changes when the portal is updated.
Hard-coding endpoints in the source would mean a broken extension and a release cycle
every time. The map lives in a JSON preset instead, and little in it is fixed: the
list request is replayed verbatim from the one the portal itself issued, and the
response shape — where the documents are, which key holds the date — is re-derived
from each live response.

Downloads follow the same principle. Four id combinations are tried, and if a
document is still refused the portal's own download request is reused as a
template with this document's ids swapped in — so a parameter this extension has
never heard of still travels with the request. Documents from some linked files
turned out to need exactly that.

That search is for a file's first documents. Once a combination is known to work for
a file, its later documents skip the other combinations, and attempts are spaced at
the normal pace. A refusal is taken as the answer, not retried. A file that refused
two documents every way and gave none is not asked for its remaining documents until
it is listed again; their rows say why.

When UYAP changes, one preset PR fixes everyone's install. There is no in-app mapping
editor: one existed during development, and a configuration screen within reach of a
working install is mostly a way to break it by accident. The method for refreshing the
map by hand is in [`docs/ENDPOINT-DISCOVERY.md`](docs/ENDPOINT-DISCOVERY.md).

### Turkish text in PDF

A PDF's built-in fonts have no Ğ, İ or Ş, so any generator that leans on them turns
`Örnekköy 3. Asliye Ceza Mahkemesi` into mojibake. `fonts/` holds Liberation Serif —
metric-compatible with the Times New Roman UYAP's documents ask for — subset to the
characters Turkish legal text uses, plus the metrics the writer needs. Rebuild with
`python3 tools/build-fonts.py`; the output is committed, so a normal install needs no
build step.

## Install

Install it from the Chrome Web Store (the store link will be added here once it is
published). Then:

1. Open a case file in the portal, go to its **Evrak** tab, and use the panel
2. Optional: for the one-click mobile-signature login, click the toolbar icon,
   press **Kur** under "Mobil İmza ile Hızlı Giriş", save your details and allow
   access to `giris.turkiye.gov.tr` when Chrome asks

From source, for development: `git clone https://github.com/MERBACO/uyap-evrak-asistani.git`,
then `chrome://extensions` → **Developer mode** → **Load unpacked** → the repo folder.

No build step and no package installation: everything needed is committed, including
the two third-party libraries, pdf-lib and UTIF (see `vendor/README.md` for what they are and why).

## Scope and limits

- Works only on case files you are already authorised to see. It bypasses no
  authentication and reveals nothing the portal would not show you on a click.
- Requests are deliberately paced. Fast is not the goal; not degrading a shared public
  system is. Download, print and content scan all ask for documents one at a time,
  3–4.5 s apart (about 16 a minute); there is no speed setting. The time the current
  selection will take is shown above the download and print buttons. While a run is
  going, a line under the status updates every second and turns yellow if one
  document takes over 45 s or nothing moves for 75 s.
- Past some rate UYAP suspends access with an "erişiminiz geçici olarak
  durdurulmuştur" page. The extension recognises it and never saves or prints it as a
  document. With the setting **UYAP "erişiminiz durduruldu" yanıtı verince bir süre bekle**
  on (the default) the run stops at once and no new bulk run starts for 15 minutes —
  1 hour, 4 hours, at most 12 hours after repeated blocks — and later runs go slower.
  **Beklemeyi Kaldır** lifts the wait immediately. With the setting off the extension
  never stops or waits on its own (the hearing query included): a refused document
  is marked with the server's answer and the run continues. Either way the panel
  quotes UYAP's own text under its message.
- A printed or converted UDF is a **readable copy, not the signed original**: the
  electronic signature inside a UDF cannot be carried into a PDF. Where the original
  is required, use the UDF file itself.
- Formats other than those listed above (UDF, PDF, PNG, JPEG, TIFF, EYP, HTML,
  xlsx, docx, eml, plain text) cannot be placed in the merged printout. They get a
  marker page saying so, and must be printed from their own viewer.
- Very large scanned documents can exceed Chrome's data-URL download ceiling. Those
  are reported per document.
- Printing holds every selected document in memory until the merged file is closed;
  past roughly 350 MB the run stops and asks for a smaller selection.

## Privacy

No telemetry, no analytics, no remote endpoint. Downloaded documents go straight to
your own disk; the endpoint map and your preferences stay in `chrome.storage.local`.
So do the quick-login details if you set them up — kimlik no, GSM number and
operator, no password or PIN — and they are typed only into e-Devlet's form. So
does the last hearing list.

Court documents contain personal data. Under Turkish data-protection law (KVKK) the
lawyer remains the data controller for everything downloaded — encrypt the disk, and
strip client details from anything attached to a bug report.

## Contributing

Bug reports and suggestions are welcome as GitHub issues; strip client details
from any screenshot or console log first. The code is published under an
all-rights-reserved licence, so code contributions (pull requests) are not accepted
for now.

`node tools/check-dead-declarations.mjs` catches a mistake this project made three
times: a `const` written after a factory function's `return`, which parses fine and
throws only when a button is pressed.

All of these run in CI:

| | |
|---|---|
| `tools/check-dead-declarations.mjs` | a `const` after a factory's `return` |
| `tools/check-unused.mjs` | exports, events and messages nothing consumes; a function defined twice in one file |
| `tools/check-docs.mjs` | broken paths and removed features still described |
| `tools/check-manifest.mjs` | declared files, page-reachable resources, permissions |
| `tools/test-e2e.mjs` | the libraries end to end; pass a `.udf` to include UDF and PDF |
| `tools/test-panel.mjs` | the panel itself, in headless Chrome against a fake portal: listing, new-document badges, history, download, print; the quick-login section with its e-Devlet half; the popup's setup; the hearing section and table page. Skipped without Chrome (`CHROME_PATH`) |
| `eslint .` | undefined names, dead bindings — the class `node --check` cannot see |

`npm run check` runs them all.

## Publishing

[`docs/YAYINLAMA.md`](docs/YAYINLAMA.md) holds the store listing copy, the
permission justifications the review asks for, and a release checklist.

## Licence

All rights reserved © 2026 Av. Mert Bayur. The source is public to read; it may not
be copied, modified, distributed or sold without written permission. See
[`LICENSE`](LICENSE). Not affiliated with the Ministry of Justice or UYAP.
Privacy policy: [`PRIVACY.md`](PRIVACY.md).
Bundled third-party components keep their own licences: `vendor/LICENSE-pdf-lib.md`
(MIT), `vendor/LICENSE-utif.txt` (MIT) and `fonts/LICENSE-LiberationSerif.txt` (SIL OFL).
