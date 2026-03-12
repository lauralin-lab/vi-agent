# VI Agent Core — GCE Deployment

## Prerequisites

- GCP account with billing enabled
- `gcloud` CLI installed locally
- LiveKit Cloud account (or self-hosted LiveKit server)
- Google Gemini API key
- Anthropic API key

## Quick Deploy

### 1. Create GCE VM

```bash
gcloud compute instances create vi-agent \
  --zone=us-central1-a \
  --machine-type=e2-medium \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=50GB \
  --tags=http-server,https-server

# Open firewall
gcloud compute firewall-rules create vi-allow-http \
  --allow tcp:80,tcp:443,tcp:8000 \
  --target-tags=http-server
```

### 2. SSH and Setup

```bash
gcloud compute ssh vi-agent --zone=us-central1-a

# On the VM:
git clone <your-repo-url> /opt/vi-agent
cd /opt/vi-agent/agent-core
./deploy/setup-gce.sh
```

### 3. Configure Environment

```bash
cp .env.example .env
nano .env
# Fill in all API keys and secrets
```

### 4. Deploy

```bash
./deploy/deploy.sh
```

## Configuration

Required environment variables in `.env`:

| Variable | Description |
|----------|-------------|
| `LIVEKIT_URL` | LiveKit server URL (e.g., `wss://your-project.livekit.cloud`) |
| `LIVEKIT_API_KEY` | LiveKit API key |
| `LIVEKIT_API_SECRET` | LiveKit API secret |
| `GOOGLE_API_KEY` | Google Gemini API key |
| `ANTHROPIC_API_KEY` | Anthropic API key (for Claude Opus 4.6) |
| `JWT_SECRET` | Random secret for JWT signing |
| `POSTGRES_PASSWORD` | PostgreSQL password |

## Architecture

```
Internet → :80 (nginx/frontend) → /api/* → :8000 (FastAPI)
                                         → LiveKit Cloud ← vi-realtime (agent)
                                         → Redis ← nanoclaw (executor)
```

## Management

```bash
# View logs
docker compose logs -f

# Restart a service
docker compose restart vi-realtime

# Update and redeploy
git pull
docker compose build
docker compose up -d

# Stop everything
docker compose down
```

## Cost Estimate

- GCE e2-medium: ~$25/month
- LiveKit Cloud: Pay-per-use (~$0.01/min)
- Total infrastructure: ~$30-50/month
- API costs (Gemini + Claude): Usage-dependent
