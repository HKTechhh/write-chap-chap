# Deploying Penspan to DigitalOcean

One Ubuntu 24.04 droplet in Frankfurt (`fra1`) runs the whole stack with Docker Compose:

| Container | What it does |
|---|---|
| `caddy` | Serves the React app, proxies `/api` and `/admin` to Django, gets HTTPS certificates automatically |
| `api` | Django + gunicorn. Runs migrations and `collectstatic` on start |
| `worker` | Celery worker: GPTZero scans, M-Pesa payouts |
| `beat` | Celery beat: hourly late fines and escrow auto-release, nightly tier recalculation |
| `redis` | Celery broker |
| `db` | Postgres 16 |

> **Everything below that touches your DigitalOcean account (`doctl ... create`) creates paid
> resources. These are commands for YOU to run. Nothing in this repo runs them for you.**

## Pick a size

| Phase | Droplet | Slug | Cost |
|---|---|---|---|
| **Testing, little traffic** | 2 GB / 1 vCPU / 50 GB | `s-1vcpu-2gb` | about $12/month |
| Launch, real users | 4 GB / 2 vCPU / 80 GB | `s-2vcpu-4gb` | about $24/month |

The defaults in `.env.example` and `docker-compose.prod.yml` are tuned for the 2 GB droplet
(2 gunicorn workers, 1 Celery process, 2 GB swap). Check current prices at
https://www.digitalocean.com/pricing/droplets before you buy.

To move to 4 GB later, see [Scaling up](#scaling-up).

---

## 1. Install and sign in to doctl (on Kali)

```bash
cd ~
DOCTL_VERSION=$(curl -s https://api.github.com/repos/digitalocean/doctl/releases/latest | grep -oP '"tag_name": "v\K[^"]+')
wget "https://github.com/digitalocean/doctl/releases/download/v${DOCTL_VERSION}/doctl-${DOCTL_VERSION}-linux-amd64.tar.gz"
tar xf "doctl-${DOCTL_VERSION}-linux-amd64.tar.gz"
sudo mv doctl /usr/local/bin/
rm "doctl-${DOCTL_VERSION}-linux-amd64.tar.gz"
doctl version
```

Create an API token at https://cloud.digitalocean.com/account/api/tokens (read and write scope),
then:

```bash
doctl auth init          # paste the token when asked
doctl account get        # should print your email and a droplet limit
```

## 2. SSH key

```bash
ssh-keygen -t ed25519 -C "penspan" -f ~/.ssh/penspan_ed25519
doctl compute ssh-key import penspan-key --public-key-file ~/.ssh/penspan_ed25519.pub
doctl compute ssh-key list           # note the ID of penspan-key
```

## 3. Create the droplet (paid, you run it)

```bash
doctl compute droplet create penspan \
  --region fra1 \
  --image ubuntu-24-04-x64 \
  --size s-1vcpu-2gb \
  --ssh-keys <KEY_ID> \
  --enable-monitoring \
  --wait

doctl compute droplet list --format ID,Name,PublicIPv4,Memory,Region
```

Add `--enable-backups` to the create command for weekly DigitalOcean snapshots (about 20% extra).
For the 4 GB droplet use `--size s-2vcpu-4gb`.

## 4. Firewall: only 22, 80 and 443

```bash
doctl compute firewall create \
  --name penspan-fw \
  --droplet-ids <DROPLET_ID> \
  --inbound-rules "protocol:tcp,ports:22,address:0.0.0.0/0,address:::/0 protocol:tcp,ports:80,address:0.0.0.0/0,address:::/0 protocol:tcp,ports:443,address:0.0.0.0/0,address:::/0 protocol:udp,ports:443,address:0.0.0.0/0,address:::/0" \
  --outbound-rules "protocol:tcp,ports:all,address:0.0.0.0/0,address:::/0 protocol:udp,ports:all,address:0.0.0.0/0,address:::/0 protocol:icmp,address:0.0.0.0/0,address:::/0"
```

To lock SSH to your own IP, replace the port 22 source with `address:<YOUR_IP>/32`. The
bootstrap script also enables `ufw` on the droplet with the same ports.

## 5. DNS: A records for penspan.com and www

**Option A: DigitalOcean DNS.**

```bash
doctl compute domain create penspan.com
doctl compute domain records create penspan.com --record-type A --record-name @   --record-data <DROPLET_IP> --record-ttl 300
doctl compute domain records create penspan.com --record-type A --record-name www --record-data <DROPLET_IP> --record-ttl 300
doctl compute domain records list penspan.com
```

Then, at your domain registrar, set the nameservers to `ns1.digitalocean.com`,
`ns2.digitalocean.com` and `ns3.digitalocean.com`.

**Option B: keep DNS at your registrar or Cloudflare.** Add two A records, `@` and `www`, both
pointing at `<DROPLET_IP>`. If you use Cloudflare, set them to **DNS only** (grey cloud) until
the first HTTPS certificate has been issued.

Check propagation before deploying: `dig +short penspan.com` and `dig +short www.penspan.com`
should both print the droplet IP. Caddy cannot get a certificate until they do.

## 6. First deploy

All of these run from your Kali machine inside the repo, then on the droplet.

```bash
export DROPLET_IP=<DROPLET_IP>
SSH="ssh -i ~/.ssh/penspan_ed25519 root@$DROPLET_IP"

# 6.1  Bootstrap: Docker, swap, firewall. One time.
scp -i ~/.ssh/penspan_ed25519 deploy/bootstrap-droplet.sh root@$DROPLET_IP:/root/
$SSH 'bash /root/bootstrap-droplet.sh'

# 6.2  Copy the committed code to the droplet (no .git, no secrets, never touches .env)
git archive HEAD | $SSH 'tar -x -C /opt/penspan'

# 6.3  Create .env on the droplet with fresh random secrets, then fill in the rest
$SSH '/opt/penspan/deploy/init-env.sh'
$SSH -t 'nano /opt/penspan/.env'      # set ACME_EMAIL, DOMAIN, and any API keys you have

# 6.4  Build and start
$SSH '/opt/penspan/deploy/deploy.sh'
```

The first build takes a few minutes. When it finishes, open https://penspan.com.

```bash
# 6.5  Create your admin login (the demo accounts are off by default)
$SSH 'cd /opt/penspan && docker compose -f docker-compose.prod.yml --env-file .env exec api python manage.py createsuperuser'

# 6.6  Nightly database backup at 02:15
$SSH 'echo "15 2 * * * root /opt/penspan/deploy/backup-postgres.sh >> /var/log/penspan-backup.log 2>&1" > /etc/cron.d/penspan-backup'
$SSH '/opt/penspan/deploy/backup-postgres.sh'     # run once now to prove it works
```

`createsuperuser` makes a Django admin. Penspan's own admin role also needs
`role=admin`: sign in at https://penspan.com/admin/, open your user, and set **Role** to admin.

If you want demo data while testing, set `SEED_DEMO=true` in `.env` before step 6.4. Every demo
account shares the password published in the README, so turn it off and delete those users before
real traffic.

## 7. Later deploys

```bash
export DROPLET_IP=<DROPLET_IP>
SSH="ssh -i ~/.ssh/penspan_ed25519 root@$DROPLET_IP"

git archive HEAD | $SSH 'tar -x -C /opt/penspan'
$SSH '/opt/penspan/deploy/deploy.sh'
```

Only committed files are sent, so commit first. Migrations run automatically when the `api`
container starts.

## Everyday commands (on the droplet)

```bash
cd /opt/penspan
C="docker compose -f docker-compose.prod.yml --env-file .env"

$C ps                       # what is running
$C logs -f --tail=100 api   # also: worker, beat, caddy, db
$C restart worker
free -h                     # memory and swap
```

## Backups and restore

- `deploy/backup-postgres.sh` writes `/var/backups/penspan/penspan-<date>.sql.gz` nightly and keeps 14 days.
- Copy them off the droplet now and then: `scp -i ~/.ssh/penspan_ed25519 root@$DROPLET_IP:/var/backups/penspan/penspan-*.sql.gz ~/penspan-backups/`
- Restore (asks for confirmation, replaces the live database):
  `/opt/penspan/deploy/restore-postgres.sh /var/backups/penspan/<file>.sql.gz`
- Uploads live in the `media_data` Docker volume (or in Spaces, below). DigitalOcean droplet
  backups cover the volume; the `pg_dump` files cover the database.

## File uploads: use Spaces before real users

With no `AWS_*` values set, uploads are stored on the droplet disk and Caddy serves them at
`/media/...`. **Those URLs are not access-controlled.** That is fine for testing with fake
documents. Before you accept real KYC documents, deliverables or dispute evidence:

1. Create a Space in `fra1` (about $5/month) and an access key for it.
2. Fill in `AWS_STORAGE_BUCKET_NAME`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in `.env`.
   The endpoint and region are already set for `fra1`.
3. Run `deploy/deploy.sh`. Django then stores files privately and hands out time-limited signed URLs.

Files uploaded before the switch stay on the droplet and will not appear in Spaces.

## Payments

- **STK push callback:** set `MPESA_CALLBACK_URL=https://penspan.com/api/payments/mpesa/callback/`.
- **B2C payouts:** need a B2C shortcode, initiator name and a security credential from Safaricom.
  Safaricom's result and timeout callbacks are built automatically from your domain. They have
  to be reachable over public HTTPS, which they are once the site is up. Test in the Daraja
  sandbox (`MPESA_ENVIRONMENT=sandbox`) before setting `MPESA_B2C_ENABLED=True` with real money.

## Scaling up

Resize CPU and RAM only, so you can go back down later:

```bash
doctl compute droplet-action power-off <DROPLET_ID> --wait
doctl compute droplet-action resize <DROPLET_ID> --size s-2vcpu-4gb --wait    # no --resize-disk
doctl compute droplet-action power-on <DROPLET_ID> --wait
```

Then on the droplet edit `.env` to `GUNICORN_WORKERS=3`, `GUNICORN_THREADS=2`,
`CELERY_CONCURRENCY=2` and run `deploy/deploy.sh`. Past that, move Postgres to a DigitalOcean
Managed Database and point `DATABASE_URL` at it (remove `DB_SSLMODE: disable` from the compose file).

## Troubleshooting

| Symptom | Check |
|---|---|
| Browser shows a certificate error | `dig +short penspan.com` must equal the droplet IP; `$C logs caddy` |
| `deploy.sh` says API not healthy | `$C logs --tail=100 api`. Usual causes: empty `SECRET_KEY`, bad `.env` value |
| `400 Bad Request` from the API | `DOMAIN` in `.env` does not match the host you are visiting |
| Scans or payouts never run | `$C ps` shows `worker` and `redis` up; `$C logs worker` |
| Out-of-memory kills | `free -h`, `dmesg \| grep -i oom`; resize to 4 GB |
