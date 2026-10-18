#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 droplet. Run as root ON THE DROPLET:
#   bash bootstrap-droplet.sh
# Safe to re-run.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y docker.io docker-compose-v2 ufw cron unattended-upgrades

# 2 GB of swap: on a 2 GB droplet this is what stops a memory spike from killing Postgres.
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
sysctl -w vm.swappiness=10 >/dev/null
grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=10' >> /etc/sysctl.conf

# Host firewall as a second layer behind the DigitalOcean cloud firewall.
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

systemctl enable --now docker
mkdir -p /opt/penspan /var/backups/penspan
echo "Bootstrap done. Next: copy the code to /opt/penspan, create .env, run deploy/deploy.sh."
