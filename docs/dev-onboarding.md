# Dev Environment — New User Onboarding

## For New Team Members

### 1. Prerequisites (local machine)

- SSH key pair (e.g. `~/.ssh/id_ed25519`)
- GitHub CLI authenticated: `gh auth login`
- Git identity configured: `git config user.name "your-name"`

### 2. Get Server Access

Send your **SSH public key** to the admin (e.g. via Slack):

```bash
cat ~/.ssh/id_ed25519.pub
```

The admin will create your Linux account on the server. Once done, verify:

```bash
ssh -i ~/.ssh/id_ed25519 <your-username>@34.172.9.61 "echo ok"
```

### 3. Configure Local Dev Environment

```bash
# Save your config (one-time)
bash deploy/dev-environment/dev.sh --save-config --name <your-handle> --user <your-server-username>

# Verify
bash deploy/dev-environment/dev.sh --show-config
```

The `--user` flag sets your SSH username for the server. If your local username
matches your server username, you can skip `--user` (it defaults to `$(whoami)`).

### 4. Deploy

```bash
# See available versions
bash deploy/dev-environment/dev.sh --show-versions

# Deploy from Docker Hub (fastest)
bash deploy/dev-environment/dev.sh --tag <TAG> --mode image

# Or build from current HEAD
bash deploy/dev-environment/dev.sh --mode head
```

Or use the Claude skill: `/dev`

---

## For Admins

### Adding a New User to the Server

SSH into the server and run the provisioning script:

```bash
ssh <admin-user>@34.172.9.61

# On the server:
sudo bash /opt/vi-agent/templates/add-dev-user.sh <username> '<ssh_public_key>'
```

This creates a Linux user with:
- `vi-agent` group membership (shared access to `/opt/vi-agent/`)
- `docker` group membership (can run docker commands)
- SSH key configured
- Personal repos directory at `~/vi-agent-repos/`

### Permission Model

```
/opt/vi-agent/
├── templates/       # group: vi-agent, setgid — all members can read/write
├── instances/       # group: vi-agent, setgid — each user's instance dir
│   ├── alice/       # created by create-instance.sh during deploy
│   └── bob/
└── registry.json    # group: vi-agent — shared state
```

- **Group**: `vi-agent` — all dev team members belong to this group
- **setgid**: Directories have setgid bit set so new files inherit the group
- **Docker**: All users can run `docker compose` commands for any instance
- **Isolation**: Each user deploys to their own instance directory with separate ports

### Syncing the Script to the Server

The `add-dev-user.sh` script lives in the repo at `deploy/dev-environment/add-dev-user.sh`.
It gets synced to `/opt/vi-agent/templates/` automatically when any user runs `/dev`.

To sync manually:

```bash
scp deploy/dev-environment/add-dev-user.sh <admin-user>@34.172.9.61:/opt/vi-agent/templates/
```

### Migrating Existing Setup

If the server currently has a single shared user (e.g. `liyasong`), run:

```bash
# 1. Create vi-agent group and fix /opt/vi-agent permissions
sudo groupadd vi-agent
sudo chgrp -R vi-agent /opt/vi-agent/templates/ /opt/vi-agent/instances/ /opt/vi-agent/registry.json
sudo chmod -R g+rwX /opt/vi-agent/templates/ /opt/vi-agent/instances/
sudo chmod g+s /opt/vi-agent/templates/ /opt/vi-agent/instances/
sudo chmod g+rw /opt/vi-agent/registry.json

# 2. Add existing user to the groups
sudo usermod -aG vi-agent,docker liyasong

# 3. Create accounts for other team members
sudo bash /opt/vi-agent/templates/add-dev-user.sh raymond 'ssh-ed25519 AAAA...'
```
