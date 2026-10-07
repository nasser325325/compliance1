# Deploy on Google Cloud — step by step

Two routes. **Route A (Compute Engine)** is a plain Debian VM.
**Route B (Cloud Run)** builds the Dockerfile with Cloud Build and gives you a
managed HTTPS endpoint that scales to zero.

Both assume the `gcloud` CLI is installed, you have run `gcloud auth login`, and a
project is selected with billing enabled:

```bash
gcloud config set project YOUR_PROJECT_ID
```

---

## Route A — Compute Engine virtual machine (≈ 10 minutes)

### Step 1 — Run the deploy script

```bash
cd cissp-90-day/deploy/gcp
ZONE=us-central1-a APP_PASSWORD='choose-a-strong-passphrase' ./deploy-gce.sh
```

What the script does, in order:

| # | Action | Why |
|---|--------|-----|
| 1 | Enables the Compute Engine API | |
| 2 | Firewall rules scoped to network tag `cissp-90-day`: TCP 80 from anywhere, TCP 22 **only from your current IP** | deny-by-default segmentation |
| 3 | Creates an `e2-micro` Debian 12 **Shielded VM** (secure boot, vTPM, integrity monitoring) | Domain 3: trusted computing base in practice |
| 4 | Passes `deploy/cloud-init.sh` as the `startup-script` metadata | installs Node 22, clones the repo, installs a hardened systemd unit |
| 5 | Prints the public IP | |

`e2-micro` in a US region is inside the Always Free tier.

### Step 2 — Open the tracker

Wait about two minutes for the startup script, then browse to `http://<public-ip>/`.

### Step 3 — Verify from the shell (optional)

```bash
gcloud compute ssh cissp-90-day --zone us-central1-a
sudo systemctl status cissp-90-day
sudo journalctl -u google-startup-scripts -f
curl -s http://127.0.0.1/healthz
```

### Step 4 — Update to a newer version later

```bash
gcloud compute ssh cissp-90-day --zone us-central1-a \
  --command 'sudo git -C /opt/cissp-90-day pull && sudo systemctl restart cissp-90-day'
```

### Step 5 — Tear down

```bash
gcloud compute instances delete cissp-90-day --zone us-central1-a --quiet
gcloud compute firewall-rules delete cissp-90-day-http cissp-90-day-ssh --quiet
```

### Manual equivalent (Cloud Console)

1. **Compute Engine → VM instances → Create instance**. Name `cissp-90-day`, region `us-central1`, machine `e2-micro`.
2. **Boot disk** → Debian GNU/Linux 12.
3. **Firewall** → tick *Allow HTTP traffic*.
4. **Advanced options → Management → Automation (startup script)** → paste the contents of `deploy/cloud-init.sh`
   (optionally change `APP_PASSWORD=""` near the top).
5. Create → copy the External IP → open `http://<ip>/`.

---

## Route B — Cloud Run (managed container, HTTPS included)

### Step 1 — Enable the APIs (once)

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

### Step 2 — Deploy straight from the source folder

```bash
cd cissp-90-day
gcloud run deploy cissp-90-day \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --cpu 1 --memory 256Mi --min-instances 0 --max-instances 1 \
  --set-env-vars APP_PASSWORD='choose-a-strong-passphrase'
```

Cloud Build builds the Dockerfile, pushes it to Artifact Registry, and Cloud Run
prints the `https://cissp-90-day-….run.app` URL.

`--allow-unauthenticated` lets the browser reach it; the app's own
`APP_PASSWORD` basic-auth still protects the content. For IAM-based access instead,
drop that flag and open the URL through `gcloud run services proxy`.

### Step 3 — (Optional) durable progress with a Cloud Storage volume

```bash
gcloud storage buckets create gs://YOUR_PROJECT_ID-cissp-data --location us-central1
gcloud run services update cissp-90-day --region us-central1 \
  --add-volume name=data,type=cloud-storage,bucket=YOUR_PROJECT_ID-cissp-data \
  --add-volume-mount volume=data,mount-path=/data
```

The server writes `cissp-tracker.xlsx` to `/data`, which is now backed by the bucket
and survives redeploys. Without this step the browser-side mirror still keeps a
single user's progress.

### Tear down

```bash
gcloud run services delete cissp-90-day --region us-central1 --quiet
```
