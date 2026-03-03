# /dev-log — 查看 Dev 环境日志

查看某个 dev 环境实例的服务日志。

## 配置

- **服务器 IP**: `34.172.9.61`
- **管理员 SSH Key**: `~/.ssh/gcp_ssh_key`
- **管理员用户**: `liyasong`

## 参数

`/dev-log` 可以接受可选参数:
- `/dev-log casey` — 直接查看 casey 的日志
- `/dev-log casey api` — 查看 casey 的 api-server 日志
- `/dev-log` — 交互式选择

## 执行流程

### Step 1: 确定查看目标

如果没有提供参数，使用 AskUserQuestion 询问:

1. **查看谁的日志?**
   - SSH 到服务器读取 registry.json 获取所有实例名称
   - 列出选项让用户选择
   - 也可选 "default" 查看默认实例

2. **查看哪个服务的日志?**
   - 选项: all(所有服务), api-server, frontend, vi-gateway, vi-realtime, postgres, redis

3. **显示多少行?**
   - 选项: 50 (快速浏览), 100 (默认), 200, 500

### Step 2: 获取日志

```bash
# 查看指定实例的日志
ssh -i ~/.ssh/gcp_ssh_key liyasong@34.172.9.61 \
  "cd /opt/vi-agent/instances/<NAME> && docker compose logs --tail <LINES> <SERVICE> 2>&1"

# 如果是 default 实例
ssh -i ~/.ssh/gcp_ssh_key liyasong@34.172.9.61 \
  "cd /opt/vi-agent && docker compose logs --tail <LINES> <SERVICE> 2>&1"
```

### Step 3: 展示日志

直接输出日志内容。如果日志很长，只展示最后部分并提示用户可以增加行数。

## 常用场景

- `/dev-log liya api` — 排查 API 报错
- `/dev-log liya` — 查看所有服务日志（快速诊断）
- `/dev-log` — 交互式选择

## 错误处理

- 实例不存在: 提示可用的实例名称
- 实例已停止: 提示容器已停止，可以用 `docker compose logs` 查看历史日志
