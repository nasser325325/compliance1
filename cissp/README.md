# 90-Day CISSP Challenge — tracker

One static page + a Supabase table, hosted on Netlify. The same setup as the
Sylvara chalet system: free, nothing to run, and your progress is the same on
every device because it lives in the database.

```
cissp/
├── index.html     the whole app (HTML + CSS + JS, plan built in)
└── supabase.sql   creates the table and its access policies
```

## Step 1 — Database (Supabase, 2 minutes)

1. Open your Supabase project (the chalet one works; the tracker gets its own table).
2. **SQL Editor → New query**, paste the contents of `supabase.sql`, **Run**.
   This creates the table `cissp_progress` and lets the public key read and write it,
   exactly like the chalet tables. The last line turns on live updates between
   devices; if it errors, ignore it.
3. If you use a different Supabase project, open `index.html` and change the two
   lines at the top of the script:

```js
const SUPABASE_URL = 'https://....supabase.co';
const SUPABASE_KEY = 'sb_publishable_...';
```

## Step 2 — Password

At the top of the script in `index.html`:

```js
const PASS = '1234';   // change the password here
```

It is asked once per browser session, like the chalet admin page.

## Step 3 — Hosting (Netlify, free)

**Fastest: Netlify Drop.** Go to https://app.netlify.com/drop and drag the `cissp`
folder onto the page. You get a `https://<name>.netlify.app` address in seconds.
Rename the site under *Site settings → Site details → Change site name*.

**Automatic updates: connect the repo.** On Netlify choose *Add new site → Import
an existing project → GitHub → compliance1*. The `netlify.toml` at the repo root
already sets the publish folder to `cissp`, so leave the build command empty and
deploy. Every push to `main` redeploys.

Also works unchanged on GitHub Pages
(`https://nasser325325.github.io/compliance1/cissp/` once Pages is enabled on
`main` / root), or any static host.

## Using it

- **Set the start date** in the top-right card. Day N of 90, the current week and
  the exam date (Saturday of week 12) follow from it.
- **Today**: tick the day's tasks, log questions worked, keep notes. Arrows move
  between days.
- **12-Week Plan**: every week with its domain focus, acronyms and all seven days.
- **Checkpoints**: Wednesday quiz, Saturday timed block, Sunday review, per week.
- **Practice Exams**: week-11 scores by domain; under 70 % is flagged red.
- **Night mode**: the moon/sun button cycles Auto → Night → Day.
- **Sync dot** (top right): green = saved to Supabase, amber = saving, red = the
  database could not be reached, progress is kept in this browser and re-sent
  when the connection returns. Changes made on another device appear live.

## Add it to your phone

Open the Netlify address in Safari or Chrome and choose **Add to Home Screen**.
It opens full-screen like an app.
