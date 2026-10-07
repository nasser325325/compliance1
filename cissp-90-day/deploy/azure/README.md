# Deploy on Azure — step by step

Two routes. **Route A (Virtual Machine)** gives you a plain Ubuntu server.
**Route B (Container Apps)** builds the Dockerfile in the cloud and gives you a
managed HTTPS endpoint with zero servers.

Both assume the Azure CLI is installed and you have run `az login`. Use a
subscription where you are *Contributor* on a resource group, not *Owner* of the
whole tenant (Domain 5: least privilege).

---

## Route A — Ubuntu virtual machine (≈ 10 minutes)

### Step 1 — Run the deploy script

```bash
cd cissp-90-day/deploy/azure
LOCATION=eastus APP_PASSWORD='choose-a-strong-passphrase' ./deploy-vm.sh
```

What the script does, in order:

| # | Action | Why |
|---|--------|-----|
| 1 | Creates resource group `cissp-90-day-rg` | one container for everything, one command to delete it all |
| 2 | Creates VM `cissp-90-day` (Ubuntu 24.04, `Standard_B1s`) with `--generate-ssh-keys` | password logins disabled; key-based SSH only |
| 3 | Passes `deploy/cloud-init.sh` as `--custom-data` | installs Node 22, clones the repo, installs a hardened systemd unit |
| 4 | NSG rules: TCP 80 from anywhere, TCP 22 **only from your current IP** | deny-by-default network segmentation |
| 5 | Prints the public IP | |

### Step 2 — Open the tracker

Wait about two minutes for cloud-init, then browse to `http://<public-ip>/`.

### Step 3 — Verify from the shell (optional)

```bash
ssh azureuser@<public-ip>
sudo systemctl status cissp-90-day
sudo tail -f /var/log/cloud-init-output.log
curl -s http://127.0.0.1/healthz
```

### Step 4 — Update to a newer version later

```bash
ssh azureuser@<public-ip> 'sudo git -C /opt/cissp-90-day pull && sudo systemctl restart cissp-90-day'
```

### Step 5 — Tear down

```bash
az group delete --name cissp-90-day-rg --yes --no-wait
```

### Manual equivalent (Azure Portal)

1. **Create a resource → Virtual machine**. Resource group *new* `cissp-90-day-rg`, name `cissp-90-day`, image *Ubuntu Server 24.04 LTS*, size `B1s`.
2. **Administrator account** → SSH public key, username `azureuser`.
3. **Inbound port rules** → allow HTTP (80) and SSH (22). After creation, edit the SSH rule's *Source* to *My IP address*.
4. **Advanced tab → Custom data** → paste the contents of `deploy/cloud-init.sh`
   (optionally change `APP_PASSWORD=""` near the top).
5. Review + create → when deployed, copy the public IP → open `http://<ip>/`.

---

## Route B — Azure Container Apps (managed container, HTTPS included)

### Step 1 — Install the extension and register providers (once)

```bash
az extension add --name containerapp --upgrade
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.OperationalInsights
```

### Step 2 — Build and deploy straight from the source folder

```bash
cd cissp-90-day
az containerapp up \
  --name cissp-90-day \
  --resource-group cissp-90-day-rg \
  --location eastus \
  --environment cissp-env \
  --source . \
  --ingress external --target-port 8080 \
  --env-vars APP_PASSWORD='choose-a-strong-passphrase'
```

`az containerapp up` creates the resource group, a container registry, builds the
Dockerfile in Azure Container Registry, and deploys it. The command prints the
`https://…azurecontainerapps.io` URL at the end.

### Step 3 — Keep it cheap

```bash
az containerapp update --name cissp-90-day --resource-group cissp-90-day-rg --min-replicas 0 --max-replicas 1
```

Scale-to-zero means you pay nothing while you are not studying.

> **Persistence note.** Container Apps disks are ephemeral, so server-side
> progress resets on redeploy. The tracker mirrors progress to your browser and
> re-uploads the newer copy on load, which is enough for a single user. For strict
> durability, mount an Azure Files share at `/data`
> (`az containerapp env storage set` + a volume mount in the YAML) or use Route A.

### Tear down

```bash
az group delete --name cissp-90-day-rg --yes --no-wait
```
