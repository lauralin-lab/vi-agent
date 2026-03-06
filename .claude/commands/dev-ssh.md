# /dev-ssh — SSH Direct Deploy

Deploy dev instance by SSH-ing to the server, pulling code, and building locally.
Bypasses Docker Hub (no rate limits). Faster iteration than GitHub Actions.

**Config file: `.dev.local`** (gitignored, persists across sessions).

**Argument routing:**

| Input | Action |
|-------|--------|
| (empty) | Full deploy: push, pull, build all services, restart |
| `api-server frontend ...` | Deploy only specified services |
| `status` | Show running containers on server |
| `logs [service] [lines]` | Tail container logs |
| `restart [service...]` | Restart without rebuild |
| `config` | Show current `.dev.local` values |
| `help` or `-h` | Show step-by-step plan with current config values |
| `KEY=VALUE ...` | Update `.dev.local` and deploy |

If argument is `help` or `-h`, jump to **Operation Help**.

---

## Operation Help

Show a concrete step-by-step plan using **actual values** from `.dev.local`. If `.dev.local` doesn't exist, show placeholders and note that first run will prompt for setup.

```bash
SCRIPT_DIR=".claude/commands/scripts"
CONFIG_OUTPUT=$(bash "$SCRIPT_DIR/dev-ssh.sh" config 2>&1)
REF=$(git rev-parse --abbrev-ref HEAD)
```

Parse CONFIG_OUTPUT for values. Then output:

```
/dev-ssh — SSH Direct Deploy
═══════════════════════════════════════════════════════

Deploy steps:
  1. git push origin {REF}
     Push current branch to GitHub

  2. ssh -A -i {SSH_KEY} {SERVER_USER}@{SERVER_IP}
     Connect to server with SSH agent forwarding (for git auth)

  3. cd {WORK_DIR}/src && git fetch && checkout {REF}
     Pull latest code on server (clones fresh if first time)

  4. docker build (per service)
     Build Docker images locally on the server:
       - api-server  (copies shared skills into build context)
       - frontend    (Vite production build)
       - nanoclaw    (TypeScript build)
       - vi-realtime (Python LiveKit agent)

  5. docker compose up -d --force-recreate
     Restart containers with newly built images

  6. curl http://localhost:{API_PORT}/health
     Wait for API server to be healthy

Config ({config_status}):
  DEV_NAME     = {DEV_NAME}
  SERVER       = {SERVER_USER}@{SERVER_IP}
  SSH_KEY      = {SSH_KEY}
  WORK_DIR     = {WORK_DIR}
  BASE_PORT    = {BASE_PORT}
  Frontend     = http://{SERVER_IP}:{FRONTEND_PORT} | https://{SERVER_IP}:{FRONTEND_HTTPS_PORT}
  API          = http://{SERVER_IP}:{API_PORT}
  NanoClaw     = http://{SERVER_IP}:{NANOCLAW_PORT}
  Config file  = .dev.local (gitignored)

Usage:
  /dev-ssh                          Deploy all services
  /dev-ssh api-server               Rebuild only api-server
  /dev-ssh api-server frontend      Rebuild api-server + frontend
  /dev-ssh status                   Show running containers
  /dev-ssh logs api-server 50       Tail 50 lines of api-server logs
  /dev-ssh restart                  Restart without rebuild
  /dev-ssh config                   Show config values
  /dev-ssh BASE_PORT=3400           Change config and deploy
```

If `.dev.local` is missing, replace values with `<not set>` and add:
```
⚠ No .dev.local found. Run /dev-ssh to start interactive setup.
```

Then **STOP** (help is informational only, does not deploy).

---

## Step 0: Load Config

Read `.dev.local` from the repo root. It's a simple KEY=VALUE file:

```
DEV_NAME=szj
SSH_KEY=/Users/neil/.ssh/id_rsa
SERVER_USER=szj
SERVER_IP=34.172.9.61
WORK_DIR=/opt/vi-agent/instances/szj
BASE_PORT=3300
REPO_URL=ssh://git@github.com/flair-home-stylist/vi_agent.git
```

```bash
SCRIPT_DIR=".claude/commands/scripts"
CONFIG_OUTPUT=$(bash "$SCRIPT_DIR/dev-ssh.sh" config 2>&1)
```

**If `.dev.local` is missing or has missing keys**, run the **Interactive Setup** (Step 0a).
If config is complete, skip to Step 1.

### Step 0a: Interactive Setup

Use `AskUserQuestion` to collect each missing value. Save answers to `.dev.local` immediately so they persist.

**Collection order and defaults:**

1. **DEV_NAME** — your name/alias on the server
   ```
   question: "What is your dev instance name on the server?"
   options:
     - label: "szj"
     - label: "xxl"
     - label: "neil"
     - label: "Enter custom name"
   ```

2. **SERVER_IP** — the dev server IP
   ```
   question: "What is the dev server IP address?"
   options:
     - label: "34.172.9.61"
       description: "Current shared dev VM"
     - label: "Enter custom IP"
   ```

3. **SERVER_USER** — SSH username (default: same as DEV_NAME)
   ```
   question: "SSH username on the server?"
   options:
     - label: "{DEV_NAME}"
       description: "Same as your dev name"
     - label: "Enter custom username"
   ```

4. **SSH_KEY** — path to SSH private key
   ```
   question: "Path to your SSH private key?"
   options:
     - label: "~/.ssh/id_rsa"
     - label: "~/.ssh/id_ed25519"
     - label: "Enter custom path"
   ```
   Expand `~` to `$HOME`. Verify the file exists with `ls`.

5. **WORK_DIR** — instance directory on server (default: `/opt/vi-agent/instances/{DEV_NAME}`)

6. **BASE_PORT** — first port number; others are derived automatically:
   - `BASE_PORT` = frontend HTTP
   - `BASE_PORT + 10` = frontend HTTPS
   - `BASE_PORT + 1` = API
   - `BASE_PORT + 2` = NanoClaw
   ```
   question: "Base port for your instance? (frontend HTTP port; API = base+1, HTTPS = base+10)"
   options:
     - label: "3300"
       description: "Slot 3: frontend=3300, API=3301, HTTPS=3310"
     - label: "3400"
       description: "Slot 4: frontend=3400, API=3401, HTTPS=3410"
     - label: "3500"
       description: "Slot 5: frontend=3500, API=3501, HTTPS=3510"
     - label: "Enter custom port"
   ```

After collecting all values, write `.dev.local`:
```bash
cat > .dev.local << 'EOF'
# Dev SSH deploy config — auto-generated, edit freely
# Used by /dev-ssh skill. Gitignored (*.local).
DEV_NAME={value}
SSH_KEY={value}
SERVER_USER={value}
SERVER_IP={value}
WORK_DIR={value}
BASE_PORT={value}
REPO_URL={auto-detect from git remote, convert HTTPS to SSH}
EOF
```

Tell user: "Config saved to `.dev.local`. This persists across sessions."

---

## Step 1: Identity + Target

```bash
REF=$(git rev-parse --abbrev-ref HEAD)
```

Read `.dev.local` values. Show:
```
Will deploy branch `{REF}` to {SERVER_USER}@{SERVER_IP}:{WORK_DIR}
  Instance: {DEV_NAME}
  Services: {from arguments, or all: api-server, frontend, nanoclaw, vi-realtime}
```

**Argument parsing:**
- `/dev-ssh` → deploy all app services (api-server, frontend, nanoclaw, vi-realtime)
- `/dev-ssh api-server frontend` → deploy only specified services
- `/dev-ssh status` → show container status
- `/dev-ssh logs [service] [lines]` → tail logs
- `/dev-ssh restart [service...]` → restart without rebuild
- `/dev-ssh config` → show current config

If user passes arguments that look like KEY=VALUE pairs (e.g., `DEV_NAME=szj`), treat them as **config overrides** — update `.dev.local` with the new values before proceeding.

---

## Step 2: Push + Pull + Build + Restart

Run the deploy script:

```bash
bash .claude/commands/scripts/dev-ssh.sh deploy [services...]
```

The script does:
1. **Push** current branch to origin
2. **SSH** to server with agent forwarding (`-A`)
3. **Pull** the branch (clone if needed, fetch+checkout if exists)
4. **Build** Docker images locally on the server for each service
5. **Restart** containers with `docker compose up -d --force-recreate`
6. **Health check** the API server

Parse the script output line by line. Key markers:
- `STEP=push` → "Pushing branch..."
- `STEP=pull` → "Pulling code on server..."
- `STEP=build:{service}` → "Building {service}..."
- `BUILT={service}` → "{service} built ✅"
- `STEP=restart` → "Restarting containers..."
- `HEALTH=ok` → "API healthy ✅"
- `HEALTH=timeout` → "⚠ API health check timed out"
- `ERROR=*` → show error and stop
- `DEPLOY_COMPLETE` → show summary

---

## Step 3: Show Results

```
{DEV_NAME} dev instance updated!

  Frontend (HTTPS): https://{SERVER_IP}:{BASE_PORT+10}
  Frontend (HTTP):  http://{SERVER_IP}:{BASE_PORT}
  API:              http://{SERVER_IP}:{BASE_PORT+1}
  API Docs:         http://{SERVER_IP}:{BASE_PORT+1}/docs
  NanoClaw:         http://{SERVER_IP}:{BASE_PORT+2}

  Branch:   {REF}
  Services: {list of rebuilt services}
  Method:   SSH direct build (no Docker Hub pull)
```

---

## Other Actions

### Status
```bash
bash .claude/commands/scripts/dev-ssh.sh status
```

### Logs
```bash
bash .claude/commands/scripts/dev-ssh.sh logs [service] [lines]
```

### Restart (no rebuild)
```bash
bash .claude/commands/scripts/dev-ssh.sh restart [service...]
```

### Config
```bash
bash .claude/commands/scripts/dev-ssh.sh config
```

---

## Config Override via Arguments

If the user passes KEY=VALUE in arguments, update `.dev.local` before running:

```bash
# For each KEY=VALUE in arguments:
if grep -q "^${KEY}=" .dev.local; then
  sed -i '' "s|^${KEY}=.*|${KEY}=${VALUE}|" .dev.local
else
  echo "${KEY}=${VALUE}" >> .dev.local
fi
```

This lets users do: `/dev-ssh BASE_PORT=3400` to change port and deploy in one command.

---

## Missing Config Recovery

If at ANY point a config value is missing or a connection fails:
1. Use `AskUserQuestion` to ask for the specific missing value
2. Save it to `.dev.local` immediately
3. Continue the deploy — never abort just because one value was missing

This makes the skill self-healing: each run either succeeds or improves `.dev.local` for next time.

---

## Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| `.dev.local` not found | First run | Interactive setup creates it |
| SSH connection refused | Wrong IP/user/key | Re-ask via AskUserQuestion, update `.dev.local` |
| Permission denied on server | File ownership | Script uses `sudo chown` automatically |
| Git push failed | Upstream conflict | `git pull --rebase origin {branch}` then retry |
| Docker build failed | Code error | Show build log, stop |
| Health check timeout | App crash | Show `docker compose logs --tail=20 api-server` |
| `git clone` permission denied | SSH key not forwarded | Ensure `ssh -A` (agent forwarding) is used |
