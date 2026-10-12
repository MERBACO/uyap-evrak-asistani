# vendor/

Third-party code, committed rather than installed, because the extension has no
build step: what you read here is what runs in the browser.

## pdf-lib 1.17.1 — MIT (`LICENSE-pdf-lib.md`)

Used for one job the project cannot reasonably do itself: copying pages out of
existing PDF files into a merged document. Printing a case file in order means
putting UDF documents, scans and PDFs into a single print job, and a PDF's page
tree cannot be merged without parsing its object graph.

Text rendering is *not* delegated to it. `src/lib/pdf.js` writes the Turkish text
pages itself with an embedded subset font, which keeps that path auditable and
avoids pulling in fontkit as well.

## UTIF 3.1.0 — MIT (`LICENSE-utif.txt`)

Decodes TIFF. Browsers do not, and scanned court documents arrive as TIFF
constantly — without this they could only be marked as unprintable in the merged
bundle. Multi-page TIFFs are decoded page by page, since one file often holds a
whole scanned set.

One local change: an `export default UTIF;` line at the end. The file ships as
UMD and the panel loads it as an ES module. Note that the UMD wrapper assigns to
`self`, which exists in the page context where this runs but not in Node — a test
harness has to define it before importing.
