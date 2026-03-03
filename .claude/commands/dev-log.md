# /dev-log — 查看 Dev 环境日志

查看某个 dev 环境实例的服务日志。

## SSH 连接

从本地 `.dev.local` 读取配置（和 `/dev` 共享）：

```bash
bash deploy/dev-environment/dev.sh --show-config
```

从输出中读取 `SSH_KEY`。如果 `.dev.local` 不存在，按优先级检测：
```
~/.ssh/gcp_ssh_key → ~/.ssh/id_ed25519 → ~/.ssh/id_rsa → ~/.ssh/id_ecdsa
```

**注意**: 不要硬编码 `~/.ssh/gcp_ssh_key`，不同用户的 key 路径不同。

## 参数

`/dev-log` 可接受可选参数:
- `/dev-log casey` — 直接查看 casey 的日志
- `/dev-log casey api` — 查看 casey 的 api-server 日志
- `/dev-log` — 交互式选择

## 执行流程

### Step 1: 获取 SSH key 和确定查看目标

```bash
# 读取本地配置
bash deploy/dev-environment/dev.sh --show-config
```

如果没有提供实例参数，使用 AskUserQuestion 询问:

1. **查看谁的日志?**
   - SSH 到服务器读取 registry.json 获取所有实例名称
   - ```bash
     ssh -A -i $SSH_KEY liyasong@34.172.9.61 "cat /opt/vi-agent/registry.json"
     ```
   - 列出选项让用户选择

2. **查看哪个服务?**
   - 选项: all (所有), api-server, frontend, vi-gateway, vi-realtime, postgres, redis

3. **显示多少行?**
   - 选项: 50 (快速), 100 (默认), 200, 500

### Step 2: 获取日志

```bash
ssh -A -i $SSH_KEY liyasong@34.172.9.61 \
  "cd /opt/vi-agent/instances/<NAME> && docker compose logs --tail <LINES> <SERVICE> 2>&1"
```

### Step 3: 展示日志

直接输出日志内容。如果日志很长，只展示最后部分并提示增加行数。

## 常用场景

- `/dev-log liya api` — 排查 API 报错
- `/dev-log liya` — 查看所有服务日志
- `/dev-log` — 交互式选择

## 错误处理

- 实例不存在: 提示可用实例名称
- 实例已停止: 提示用 `docker compose logs`（不带 `-f`）查看历史
