#!/bin/bash
# Deploy the 90-Day CISSP Challenge server on a single AWS EC2 instance.
# Prereqs: aws CLI v2 configured (aws configure), an EC2 key pair in the region.
#
#   KEY_NAME=my-key ./deploy-ec2.sh
#
# Optional env: AWS_REGION (default us-east-1), INSTANCE_TYPE (t3.micro),
#               APP_PASSWORD (login password), BRANCH (main)
set -euo pipefail

: "${KEY_NAME:?set KEY_NAME to an existing EC2 key pair name}"
REGION="${AWS_REGION:-us-east-1}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.micro}"
NAME="cissp-90-day"
HERE="$(cd "$(dirname "$0")" && pwd)"
MY_IP="$(curl -s https://checkip.amazonaws.com)/32"

# Latest Amazon Linux 2023 AMI, resolved from the public SSM parameter so it never goes stale.
AMI="$(aws ssm get-parameters --region "$REGION" \
  --names /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 \
  --query 'Parameters[0].Value' --output text)"
echo "AMI: $AMI"

# Security group: HTTP to the world, SSH only from your current IP.
SG_ID="$(aws ec2 describe-security-groups --region "$REGION" --filters Name=group-name,Values="$NAME-sg" \
  --query 'SecurityGroups[0].GroupId' --output text 2>/dev/null || true)"
if [ -z "$SG_ID" ] || [ "$SG_ID" = "None" ]; then
  SG_ID="$(aws ec2 create-security-group --region "$REGION" --group-name "$NAME-sg" \
    --description "CISSP 90-day tracker" --query GroupId --output text)"
  aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$SG_ID" --protocol tcp --port 80 --cidr 0.0.0.0/0
  aws ec2 authorize-security-group-ingress --region "$REGION" --group-id "$SG_ID" --protocol tcp --port 22 --cidr "$MY_IP"
fi
echo "Security group: $SG_ID"

# Inject optional overrides at the top of the user-data script.
USER_DATA="$(mktemp)"
{
  echo '#!/bin/bash'
  echo "export BRANCH='${BRANCH:-main}'"
  echo "export APP_PASSWORD='${APP_PASSWORD:-}'"
  tail -n +2 "$HERE/../cloud-init.sh"
} > "$USER_DATA"

INSTANCE_ID="$(aws ec2 run-instances --region "$REGION" \
  --image-id "$AMI" --instance-type "$INSTANCE_TYPE" --key-name "$KEY_NAME" \
  --security-group-ids "$SG_ID" --user-data "file://$USER_DATA" \
  --metadata-options HttpTokens=required \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME}]" \
  --query 'Instances[0].InstanceId' --output text)"
rm -f "$USER_DATA"
echo "Instance: $INSTANCE_ID (waiting for running state)"
aws ec2 wait instance-running --region "$REGION" --instance-ids "$INSTANCE_ID"

IP="$(aws ec2 describe-instances --region "$REGION" --instance-ids "$INSTANCE_ID" \
  --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)"
echo
echo "Public IP : $IP"
echo "URL       : http://$IP/   (give cloud-init ~2 minutes on first boot)"
echo "SSH       : ssh -i ~/.ssh/$KEY_NAME.pem ec2-user@$IP"
echo "Logs      : sudo journalctl -u cissp-90-day -f   |  sudo tail -f /var/log/cloud-init-output.log"
echo "Tear down : aws ec2 terminate-instances --region $REGION --instance-ids $INSTANCE_ID"
