# CodeRing Brochure Site

Static brochure site for CodeRing, LLC, hosted on GitHub Pages.

## Layout

- `docs/`: the published site (GitHub Pages serves this folder)
  - `index.html`: the single-page site
  - `assets/`: logo, favicon, and the capability statement PDF
- `capability-statement/`: source for the capability statement PDF (not published)
  - `capability-statement.html`: edit this to change the PDF
  - `build-pdf.sh`: regenerates `docs/assets/CodeRing_Capability_Statement.pdf` using headless Chrome

## Updating

- **Site:** edit `docs/index.html`, then commit and push. GitHub Pages redeploys automatically.
- **Capability statement:** edit `capability-statement/capability-statement.html`, then run `bash capability-statement/build-pdf.sh` from Git Bash, then commit and push the regenerated PDF.
