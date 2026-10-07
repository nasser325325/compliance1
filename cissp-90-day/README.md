# 90-Day CISSP Challenge — web server

A small, self-hosted web app that turns the 90-day CISSP study plan into a daily
tracker, plus step-by-step instructions to run it on **AWS**, **Azure** and
**Google Cloud**. Deploying it is itself a hands-on lab for several CISSP domains
(network segmentation, least privilege, hardening, logging).

```
cissp-90-day/
├── server.js            zero-dependency Node.js web server + JSON API
├── plan.js              the 90-day plan as data (13 weeks, 90 days, every task)
├── store.js             Excel-backed database (data/cissp-tracker.xlsx)
├── xlsx-lite.js         tiny .xlsx reader/writer built on Node's zlib (no npm packages)
├── public/              tracker UI (index.html, styles.css, app.js)
├── test.js              smoke test (npm test)
├── Dockerfile           container image for App Runner / Container Apps / Cloud Run
└── deploy/
    ├── cloud-init.sh    one bootstrap script that works on all three clouds' VMs
    ├── tunnel.sh        expose the desktop server to your phone via a free Cloudflare tunnel
    ├── aws/             deploy-ec2.sh + README (EC2 and App Runner)
    ├── azure/           deploy-vm.sh  + README (VM and Container Apps)
    └── gcp/             deploy-gce.sh + README (Compute Engine and Cloud Run)
```

## What the tracker does

- **Today view** — the tasks for the current day of the challenge with checkboxes,
  a questions-worked counter, a notes box, and this week's domain focus + acronyms.
- **12-Week Plan** — every week expandable into its seven days; the current day is
  outlined, completed days turn green.
- **Checkpoints** — whether the Wednesday quiz, Saturday timed block and Sunday
  review were done each week, and questions worked vs the weekly target.
- **Practice Exams** — week-11 scores by domain; anything under 70 % is flagged
  red with a "consider delaying the exam" warning, 75 %+ is green.
- **Dashboard** — day N of 90, % tasks done, questions toward 2,000, hours toward
  135, and the computed exam date (Saturday of week 12).

- **Data & Access** — where the Excel database lives, a download button for it,
  and the addresses to open the tracker from your phone or another computer.
- **Night mode** — the moon/sun button in the header cycles Auto (follows your
  device) → Night → Day. The choice is remembered per browser.

Progress is saved on the server (`PUT /api/progress`) and mirrored to the browser's
localStorage; whichever copy is newer wins on load, so a flaky connection never
loses a tick.

## The Excel database

The server's only data store is a real workbook, `data/cissp-tracker.xlsx`,
written atomically on every save and read back on every load. No npm packages:
`xlsx-lite.js` builds and parses the file with Node's built-in zlib.

| Sheet | Columns |
|-------|---------|
| Settings | Key, Value (`start_date`, `updated_at`) |
| Tasks | Day, Week, DayName, TaskNo, Task, Minutes, Type, **Done**, CompletedAt — all 90 days pre-filled |
| Questions | Day, Week, Questions |
| Scores | Exam, DomainCode, Domain, Score |
| Notes | Day, Note |

Because every day and task is already a row, the workbook works as a checklist on
its own: open it in Excel, set **Done** to `TRUE` (or `yes`, `x`, `1`), type a
note or a score, save, and the web app shows the change on its next load. The
**Download Excel workbook** button on the Data & Access tab fetches the current
file; a v1 `progress.json` is migrated into the workbook automatically.

## Opening it when you are away from your desktop

The Data & Access tab shows the live addresses. Three options, from simplest to
most private:

1. **Cloud server** — deploy with any script in `deploy/` (Step 3 below). You get
   a permanent public URL. Always set `APP_PASSWORD`.
2. **Tunnel from your desktop** — keep `node server.js` running at home and run
   `deploy/tunnel.sh`. It prints a public `https://….trycloudflare.com` link that
   forwards to your desktop while the script runs. Needs `cloudflared` installed
   (the script tells you how) and `APP_PASSWORD` set on the server.
3. **Private network** — install Tailscale on the desktop and your phone. The
   LAN address shown on the Data & Access tab then works from anywhere, and no
   port is opened to the internet.

Same Wi-Fi only? Open the LAN address the tab lists (also printed when the
server starts). If it does not load, allow the port through the desktop firewall.
Set `PUBLIC_URL=https://your-address` on the server to show it on that tab.

## The plan baked in

| Weeks | Content | Weight |
|-------|---------|--------|
| 1–2 | Domain 1 — Security and Risk Management | 16 % |
| 3 | Domain 2 — Asset Security | 10 % |
| 4–5 | Domain 3 — Security Architecture & Engineering (crypto gets 4–5 days) | 13 % |
| 6 | Domain 4 — Communication & Network Security | 13 % |
| 7 | Domain 5 — Identity & Access Management | 13 % |
| 8 | Domain 6 — Security Assessment & Testing | 12 % |
| 9 | Domain 7 — Security Operations | 13 % |
| 10 | Domain 8 — Software Development Security | 10 % |
| 11 | Two 125-question timed practice exams + weakest-domain remediation | |
| 12 | Refresher videos, own notes, rest, **exam Saturday** | |
| days 85–90 | Buffer: remediate any domain under 70 % | |

Daily cadence for weeks 1–10: Mon–Fri read 30–40 OSG pages (1.5 h), **Wed** add a
25-question quiz (30 min), **Sat** 50 mixed questions timed (90 min), **Sun**
re-read the week's notes (60 min). ~135 h and 2,000+ questions total.

## Step 1 — Run it locally

```bash
cd cissp-90-day
node server.js            # http://localhost:8080
npm test                  # smoke test every route
```

Requires Node.js 18+. No `npm install` — there are no dependencies.

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `8080` | listen port |
| `HOST` | `0.0.0.0` | bind address |
| `DATA_DIR` | `./data` | where `cissp-tracker.xlsx` is written |
| `APP_PASSWORD` | *(empty)* | if set, HTTP Basic auth is required (any username) |
| `PUBLIC_URL` | *(empty)* | public address to show on the Data & Access tab |

## Step 2 — Run it in a container

```bash
docker build -t cissp-90-day .
docker run -d -p 8080:8080 -v cissp-data:/data -e APP_PASSWORD=secret cissp-90-day
```

## Step 3 — Deploy to a cloud

Each guide has a **VM route** (full control, uses `deploy/cloud-init.sh`) and a
**managed-container route** (HTTPS included, no server to patch), plus a manual
console walk-through and tear-down commands.

| Cloud | VM route | Managed route | Guide |
|-------|----------|---------------|-------|
| AWS | EC2 (Amazon Linux 2023) | App Runner | [deploy/aws/README.md](deploy/aws/README.md) |
| Azure | Virtual Machine (Ubuntu 24.04) | Container Apps | [deploy/azure/README.md](deploy/azure/README.md) |
| Google Cloud | Compute Engine (Debian 12) | Cloud Run | [deploy/gcp/README.md](deploy/gcp/README.md) |

Fastest path on each:

```bash
# AWS
KEY_NAME=my-key APP_PASSWORD=secret ./deploy/aws/deploy-ec2.sh
# Azure
APP_PASSWORD=secret ./deploy/azure/deploy-vm.sh
# Google Cloud
APP_PASSWORD=secret ./deploy/gcp/deploy-gce.sh
```

> `cloud-init.sh` clones this repository from GitHub on the new VM. If the
> repository is private, either make it public, or replace `REPO_URL` with a URL
> that includes a read-only token, or `scp -r cissp-90-day` onto the VM and run the
> script's steps 3–4 by hand. It clones `main` by default; to deploy from another
> branch pass `BRANCH=<name>` to any of the deploy scripts.

## Step 4 — Optional: HTTPS on the VM routes

The managed routes (App Runner, Container Apps, Cloud Run) already terminate TLS.
On a VM, point a DNS name at the public IP, open TCP 443 in the security group /
NSG / firewall rule, and put Caddy in front:

```bash
sudo apt-get install -y caddy          # Ubuntu/Debian; dnf on Amazon Linux
sudo sed -i 's/^PORT=80$/PORT=8080/' /etc/cissp-90-day.env
sudo systemctl restart cissp-90-day
printf 'cissp.example.com {\n  reverse_proxy 127.0.0.1:8080\n}\n' | sudo tee /etc/caddy/Caddyfile
sudo systemctl restart caddy
```

Caddy obtains and renews a Let's Encrypt certificate automatically.

## Security choices (and the CISSP domain they illustrate)

| Choice | Domain |
|--------|--------|
| SSH allowed only from your current IP; HTTP from anywhere; nothing else | D4 segmentation, deny-by-default |
| Service runs as an unprivileged user with only `CAP_NET_BIND_SERVICE`; systemd `ProtectSystem=strict`, `NoNewPrivileges` | D3 least privilege, D7 hardening |
| IMDSv2-only on EC2, Shielded VM on GCE, key-only SSH on Azure | D3 trusted computing base |
| Security headers (CSP, nosniff, frame-ancestors none), 256 KB body limit, path-traversal guard, input whitelist on every saved field | D8 secure coding |
| Optional Basic auth with constant-time comparison | D5 authentication |
| `/healthz` liveness probe, `journalctl` logging | D7 monitoring |
| One-command tear-down per cloud | D1 asset lifecycle |
