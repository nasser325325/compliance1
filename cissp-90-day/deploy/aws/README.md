# Deploy on AWS — step by step

Two routes. **Route A (EC2)** is a plain Linux VM you fully control — the best
hands-on match for CISSP Domains 3, 4 and 7. **Route B (App Runner)** is a managed
container service with HTTPS built in and no server to patch.

Both assume the AWS CLI v2 is installed and `aws configure` has been run with an
IAM user/role that can create EC2 / ECR / App Runner resources. Never use the
root account for day-to-day work (Domain 5: least privilege).

---

## Route A — EC2 virtual machine (≈ 10 minutes)

### Step 1 — Create an SSH key pair (once)

```bash
aws ec2 create-key-pair --key-name cissp-key --query KeyMaterial --output text > ~/.ssh/cissp-key.pem
chmod 400 ~/.ssh/cissp-key.pem
```

### Step 2 — Run the deploy script

```bash
cd cissp-90-day/deploy/aws
KEY_NAME=cissp-key AWS_REGION=us-east-1 APP_PASSWORD='choose-a-strong-passphrase' ./deploy-ec2.sh
```

What the script does, in order:

| # | Action | Why |
|---|--------|-----|
| 1 | Looks up the latest Amazon Linux 2023 AMI from SSM Parameter Store | never deploys a stale, unpatched image |
| 2 | Creates security group `cissp-90-day-sg`: TCP 80 from anywhere, TCP 22 **only from your current IP** | network segmentation, deny-by-default |
| 3 | Launches a `t3.micro` with `HttpTokens=required` (IMDSv2 only) | blocks SSRF-style credential theft from the metadata service |
| 4 | Passes `deploy/cloud-init.sh` as user-data | installs Node 22, clones the repo, installs a hardened systemd unit |
| 5 | Prints the public IP | |

### Step 3 — Open the tracker

Wait about two minutes for cloud-init, then browse to `http://<public-ip>/`.
If you set `APP_PASSWORD`, the browser prompts for a login: any username, that password.

### Step 4 — Verify from the shell (optional)

```bash
ssh -i ~/.ssh/cissp-key.pem ec2-user@<public-ip>
sudo systemctl status cissp-90-day
sudo journalctl -u cissp-90-day -f
curl -s http://127.0.0.1/healthz
```

### Step 5 — Update to a newer version later

```bash
ssh -i ~/.ssh/cissp-key.pem ec2-user@<public-ip> \
  'sudo git -C /opt/cissp-90-day pull && sudo systemctl restart cissp-90-day'
```

### Step 6 — Tear down when the challenge is over

```bash
aws ec2 terminate-instances --instance-ids <instance-id>
aws ec2 delete-security-group --group-name cissp-90-day-sg
```

### Manual equivalent (AWS Console)

1. **EC2 → Launch instance** → name `cissp-90-day`, AMI *Amazon Linux 2023*, type `t3.micro`.
2. **Key pair** → select or create one.
3. **Network settings** → create security group: allow HTTP (80) from Anywhere, SSH (22) from *My IP*.
4. **Advanced details → User data** → paste the contents of `deploy/cloud-init.sh`
   (optionally change `APP_PASSWORD=""` near the top).
5. **Advanced details → Metadata version** → *V2 only (token required)*.
6. Launch → copy the Public IPv4 address → open `http://<ip>/`.

---

## Route B — App Runner (managed container, HTTPS included)

### Step 1 — Create an ECR repository and push the image

```bash
export AWS_REGION=us-east-1
export ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export ECR=$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

aws ecr create-repository --repository-name cissp-90-day --image-scanning-configuration scanOnPush=true
aws ecr get-login-password | docker login --username AWS --password-stdin $ECR

cd cissp-90-day
docker build -t $ECR/cissp-90-day:latest .
docker push $ECR/cissp-90-day:latest
```

`scanOnPush=true` runs a vulnerability scan on every image (Domain 6).

### Step 2 — Give App Runner permission to pull from ECR (once)

```bash
aws iam create-role --role-name AppRunnerECRAccessRole --assume-role-policy-document '{
  "Version":"2012-10-17","Statement":[{"Effect":"Allow",
  "Principal":{"Service":"build.apprunner.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
aws iam attach-role-policy --role-name AppRunnerECRAccessRole \
  --policy-arn arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess
```

### Step 3 — Create the service

```bash
aws apprunner create-service --service-name cissp-90-day --source-configuration "{
  \"AuthenticationConfiguration\": {\"AccessRoleArn\": \"arn:aws:iam::$ACCOUNT_ID:role/AppRunnerECRAccessRole\"},
  \"AutoDeploymentsEnabled\": true,
  \"ImageRepository\": {
    \"ImageIdentifier\": \"$ECR/cissp-90-day:latest\",
    \"ImageRepositoryType\": \"ECR\",
    \"ImageConfiguration\": {\"Port\": \"8080\",
      \"RuntimeEnvironmentVariables\": {\"APP_PASSWORD\": \"choose-a-strong-passphrase\"}}
  }}" \
  --health-check-configuration Protocol=HTTP,Path=/healthz \
  --instance-configuration Cpu=0.25vCPU,Memory=0.5GB
```

Then:

```bash
aws apprunner list-services --query 'ServiceSummaryList[?ServiceName==`cissp-90-day`].ServiceUrl' --output text
```

Open `https://<that-url>/`. TLS certificate, renewals and scaling are handled for you.

> **Persistence note.** App Runner containers have ephemeral disks, so server-side
> progress resets on redeploy. The tracker also mirrors progress to your browser's
> localStorage and re-uploads the newer copy on load, so a single-user setup still
> keeps its data. For strict durability use Route A (progress lives in
> `/var/lib/cissp-90-day/cissp-tracker.xlsx`) or back the data dir with EFS on ECS.

### Tear down

```bash
aws apprunner delete-service --service-arn $(aws apprunner list-services --query 'ServiceSummaryList[?ServiceName==`cissp-90-day`].ServiceArn' --output text)
aws ecr delete-repository --repository-name cissp-90-day --force
```
