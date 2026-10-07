# compliance1

| Folder / file | What it is | Hosting |
|---------------|------------|---------|
| `index.html`, `ARB_GRC_Tracker.xlsx` | ARB Cybersecurity GRC compliance tracker (single-page app) | GitHub Pages root |
| [`cissp/`](cissp/README.md) | 90-Day CISSP Challenge tracker: one static page + Supabase database, like the Sylvara chalet system | Netlify (`netlify.toml` publishes `cissp/`), or GitHub Pages at `/cissp/` |

See `cissp/README.md` for the three setup steps: run `cissp/supabase.sql`,
set the password, drag the folder onto Netlify.
