# CI/CD Deployment Guide

## Branches

| Branch | Workflow | What happens |
|--------|----------|-------------|
| `develop` | CI only | Lint → Type-check → Build → Docker build check |
| `main` | CI/CD | Lint → Build → Docker push to GHCR → SSH deploy to VPS |

---

## GitHub Secrets to Configure

Go to: **GitHub Repo → Settings → Secrets and variables → Actions**

### Required Secrets

| Secret name | Description |
|-------------|-------------|
| `VPS_HOST` | VPS IP address (e.g. `123.45.67.89`) |
| `VPS_USER` | SSH username (e.g. `ubuntu` or `root`) |
| `VPS_SSH_KEY` | Private SSH key (run `cat ~/.ssh/id_rsa` on local machine) |
| `VPS_PORT` | SSH port — usually `22` (optional, defaults to 22) |
| `VPS_PROJECT_PATH` | Project path on VPS (e.g. `/home/ubuntu/kinedeo-backend`) |

> `GITHUB_TOKEN` is automatically available — no setup needed.

---

## First-time VPS Setup

SSH into your VPS and run these once:

```bash
# 1. Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# 2. Clone the repo
git clone https://github.com/YOUR_USERNAME/kinedeo-backend.git
cd kinedeo-backend

# 3. Create production env file
cp .env.production.example .env.production
nano .env.production    # fill in real values

# 4. First deploy (pulls image from GHCR)
docker compose -f docker-compose.prod.yml up -d
```

---

## How Deployment Works

1. You push to `main`
2. GitHub Actions runs lint + type-check + build
3. Docker image is built and pushed to `ghcr.io/YOUR_USERNAME/kinedeo-api:latest`
4. GitHub Actions SSHes into VPS
5. VPS pulls the new image and restarts containers with zero downtime
6. Old images are pruned automatically

---

## Manual Deploy (if needed)

```bash
# On VPS
cd /home/ubuntu/kinedeo-backend
git pull origin main
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker image prune -f
```
