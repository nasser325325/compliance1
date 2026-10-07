# 90-Day CISSP Challenge — web server

A small, self-hosted web app that turns the 90-day CISSP study plan into a daily
tracker, plus step-by-step instructions to run it on **AWS**, **Azure** and
**Google Cloud**. Deploying it is itself a hands-on lab for several CISSP domains
(network segmentation, least privilege, hardening, logging).

```
cissp-90-day/
├── server.js            zero-dependency Node.js web server + JSON API
├── plan.js              the 90-day plan as data (13 weeks, 90 days, every task)
├── public/              tracker UI (index.html, styles.css, app.js)
├── test.js              smoke test (npm test)
├── Dockerfile           container image for App Runner / Container Apps / Cloud Run
└── deploy/
    ├── cloud-init.sh    one bootstrap script that works on all three clouds' VMs
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

Progress is saved on the server (`PUT /api/progress`) and mirrored to the browser's
localStorage; whichever copy is newer wins on load, so a flaky connection never
loses a tick.

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
| `DATA_DIR` | `./data` | where `progress.json` is written |
| `APP_PASSWORD` | *(empty)* | if set, HTTP Basic auth is required (any username) |

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
