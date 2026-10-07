# compliance1

| Folder / file | What it is | Free URL once GitHub Pages is enabled |
|---------------|------------|----------------------------------------|
| `index.html`, `ARB_GRC_Tracker.xlsx` | ARB Cybersecurity GRC compliance tracker (single-page app) | `https://nasser325325.github.io/compliance1/` |
| `cissp/` | 90-Day CISSP Challenge tracker, static copy generated from `cissp-90-day/` (do not edit by hand) | `https://nasser325325.github.io/compliance1/cissp/` |
| [`cissp-90-day/`](cissp-90-day/README.md) | Source of the CISSP tracker: Node web server with an Excel database, plus AWS / Azure / Google Cloud deploy guides | |

## Enable free hosting (GitHub Pages)

1. **Settings → Pages** on this repository.
2. **Source: Deploy from a branch** → branch `main` → folder `/ (root)` → Save.
3. After about a minute both URLs above are live. Every push to `main` updates them.

The CISSP tracker in `cissp/` needs no server: progress is kept in the browser and
can be downloaded or imported as an Excel workbook. To run it with a server (one
shared Excel database for all your devices), see `cissp-90-day/README.md`.
