#!/bin/bash
# Deploy the 90-Day CISSP Challenge server on a single Azure VM (Ubuntu 24.04).
# Prereqs: az CLI logged in (az login).
#
#   ./deploy-vm.sh
#
# Optional env: LOCATION (default eastus), VM_SIZE (Standard_B1s),
#               APP_PASSWORD (login password), BRANCH (main)
set -euo pipefail

RG="${RG:-cissp-90-day-rg}"
LOCATION="${LOCATION:-eastus}"
VM_SIZE="${VM_SIZE:-Standard_B1s}"
NAME="cissp-90-day"
HERE="$(cd "$(dirname "$0")" && pwd)"
MY_IP="$(curl -s https://checkip.amazonaws.com)"

CUSTOM_DATA="$(mktemp)"
{
  echo '#!/bin/bash'
  echo "export BRANCH='${BRANCH:-main}'"
  echo "export APP_PASSWORD='${APP_PASSWORD:-}'"
  tail -n +2 "$HERE/../cloud-init.sh"
} > "$CUSTOM_DATA"

az group create --name "$RG" --location "$LOCATION" --output none
echo "Resource group: $RG"

az vm create --resource-group "$RG" --name "$NAME" \
  --image Ubuntu2404 --size "$VM_SIZE" \
  --admin-username azureuser --generate-ssh-keys \
  --public-ip-sku Standard \
  --nsg-rule NONE \
  --custom-data "$CUSTOM_DATA" \
  --output table
rm -f "$CUSTOM_DATA"

# Open HTTP to the world, SSH only from your current IP.
az vm open-port --resource-group "$RG" --name "$NAME" --port 80 --priority 1001 --output none
NSG="$(az network nsg list --resource-group "$RG" --query '[0].name' --output tsv)"
az network nsg rule create --resource-group "$RG" --nsg-name "$NSG" --name allow-ssh-from-me \
  --priority 1002 --access Allow --protocol Tcp --direction Inbound \
  --source-address-prefixes "$MY_IP" --destination-port-ranges 22 --output none

IP="$(az vm show --resource-group "$RG" --name "$NAME" --show-details --query publicIps --output tsv)"
echo
echo "Public IP : $IP"
echo "URL       : http://$IP/   (give cloud-init ~2 minutes on first boot)"
echo "SSH       : ssh azureuser@$IP"
echo "Logs      : sudo journalctl -u cissp-90-day -f   |  sudo tail -f /var/log/cloud-init-output.log"
echo "Tear down : az group delete --name $RG --yes --no-wait"
