#!/bin/bash
# Deploy the 90-Day CISSP Challenge server on a single Google Compute Engine VM (Debian 12).
# Prereqs: gcloud CLI logged in (gcloud auth login) and a project selected
#          (gcloud config set project YOUR_PROJECT_ID).
#
#   ./deploy-gce.sh
#
# Optional env: ZONE (default us-central1-a), MACHINE_TYPE (e2-micro),
#               APP_PASSWORD (login password), BRANCH (main)
set -euo pipefail

ZONE="${ZONE:-us-central1-a}"
MACHINE_TYPE="${MACHINE_TYPE:-e2-micro}"
NAME="cissp-90-day"
HERE="$(cd "$(dirname "$0")" && pwd)"
MY_IP="$(curl -s https://checkip.amazonaws.com)/32"

STARTUP="$(mktemp)"
{
  echo '#!/bin/bash'
  echo "export BRANCH='${BRANCH:-main}'"
  echo "export APP_PASSWORD='${APP_PASSWORD:-}'"
  tail -n +2 "$HERE/../cloud-init.sh"
} > "$STARTUP"

gcloud services enable compute.googleapis.com --quiet

# Firewall: HTTP to the world, SSH only from your current IP (both scoped by network tag).
gcloud compute firewall-rules describe "$NAME-http" >/dev/null 2>&1 || \
  gcloud compute firewall-rules create "$NAME-http" --allow tcp:80 --target-tags "$NAME" --source-ranges 0.0.0.0/0 --quiet
gcloud compute firewall-rules describe "$NAME-ssh" >/dev/null 2>&1 || \
  gcloud compute firewall-rules create "$NAME-ssh" --allow tcp:22 --target-tags "$NAME" --source-ranges "$MY_IP" --quiet

gcloud compute instances create "$NAME" \
  --zone "$ZONE" --machine-type "$MACHINE_TYPE" \
  --image-family debian-12 --image-project debian-cloud \
  --tags "$NAME" \
  --shielded-secure-boot --shielded-vtpm --shielded-integrity-monitoring \
  --metadata-from-file startup-script="$STARTUP" \
  --quiet
rm -f "$STARTUP"

IP="$(gcloud compute instances describe "$NAME" --zone "$ZONE" \
  --format 'get(networkInterfaces[0].accessConfigs[0].natIP)')"
echo
echo "Public IP : $IP"
echo "URL       : http://$IP/   (give the startup script ~2 minutes on first boot)"
echo "SSH       : gcloud compute ssh $NAME --zone $ZONE"
echo "Logs      : sudo journalctl -u cissp-90-day -f   |  sudo journalctl -u google-startup-scripts -f"
echo "Tear down : gcloud compute instances delete $NAME --zone $ZONE --quiet"
