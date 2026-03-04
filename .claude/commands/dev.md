# /dev — 创建个人 Dev 环境

你是一个 Dev 环境部署助手。大部分逻辑已内置在 `deploy/dev-environment/dev.sh` 脚本中。
**你的工作只是：读取脚本输出 → 处理需要用户决策的部分 → 调用脚本执行。**

---

## 配置

- **服务器 IP**: `34.172.9.61`
- **服务器用户**: 从 `.dev.local` 的 `SERVER_USER` 读取，默认为 `$(whoami)`（每人用自己的 Linux 账户 SSH）
- **本地持久化配置**: `.dev.local`（已在 `.gitignore` 的 `*.local` 规则中，不会提交）
- **脚本入口**: `deploy/dev-environment/dev.sh`

---

## 执行流程

### Step 1: 加载或初始化本地配置

```bash
bash deploy/dev-environment/dev.sh --show-config
```

输出示例：
```
STATUS=ok          # 或 STATUS=missing-name
DEV_NAME=casey
SSH_KEY=/Users/casey/.ssh/id_ed25519
SERVER=<SERVER_USER>@34.172.9.61
CONFIG_FILE=/path/to/.dev.local
```

**如果 `STATUS=missing-name`**：使用 AskUserQuestion 询问：

1. **你的团队 handle 是什么？**（仅小写字母，如 casey, alice, bob）
   - 用于命名容器、数据库、端口分配、代码目录

然后保存：
```bash
bash deploy/dev-environment/dev.sh --save-config --name <NAME>
```

如果检测到多个 SSH key，用 AskUserQuestion 让用户选择，再加 `--key /path/to/key`。

---

### Step 2: 选择版本

```bash
bash deploy/dev-environment/dev.sh --show-versions
```

输出显示：Docker Hub 已有 tags + 本地 git tags。

**使用 AskUserQuestion 询问**（如果用户没有直接说明版本）：

1. **部署哪个版本？**
   - 选项 A: Docker Hub 已有镜像（最快，秒级）→ 选具体 tag
   - 选项 B: 从 git tag 构建新镜像（服务器上 build + push，需要几分钟）
   - 选项 C: 从当前 HEAD 构建（无需打 tag，自动生成 `head-YYYYMMDD-COMMIT`）

---

### Step 3: 部署

调用一条命令完成所有操作（SSH 测试、pre-flight、模板同步、.env 上传、构建（如需）、部署、测试）：

**Mode A — Docker Hub pull（推荐）:**
```bash
bash deploy/dev-environment/dev.sh --tag <TAG> --mode image
```

**Mode B — 从 git tag 在服务器构建:**
```bash
bash deploy/dev-environment/dev.sh --tag <GIT_TAG> --mode build
```

**Mode C — 从当前 HEAD 构建:**
```bash
bash deploy/dev-environment/dev.sh --mode head
```

脚本会自动处理：
- 验证 SSH 连接（失败则提示参考 `docs/dev-onboarding.md`）
- pre-flight（检查未提交/未推送的代码）
- 同步最新 deploy 脚本到服务器
- 从本地 `.env` 读取并上传 API keys
- 构建镜像（Mode B/C）
- 调用服务器端 `create-instance.sh` 部署
- 运行 `test-instance.sh` 验证

---

### Step 4: 展示结果

脚本输出包含访问地址和测试结果。格式化后展示给用户：

```
✅ <DEV_NAME> 的 vi-agent 实例已部署完成！

📍 访问地址:
   Frontend:  https://34.172.9.61:<FRONTEND_HTTPS_PORT>  (HTTPS — camera works)
   Frontend:  http://34.172.9.61:<FRONTEND_PORT>
   API:       http://34.172.9.61:<API_PORT>
   API Docs:  http://34.172.9.61:<API_PORT>/docs
   Gateway:   http://34.172.9.61:<GATEWAY_PORT>

📦 版本: <TAG> | 模式: <MODE> | 时间: <TIMESTAMP>
🧪 测试: <RESULTS>
```

---

## 首次使用

新成员需要在服务器上拥有独立 Linux 账户。详见 `docs/dev-onboarding.md`。

---

## 关于版本存储和磁盘膨胀

- **registry.json**（服务器 `/opt/vi-agent/registry.json`）：只存每个实例的当前状态，覆盖写，无历史 → **不会膨胀**
- **Docker Hub**：每次 build 会推送新 tag → tag 会积累。定期在 hub.docker.com 手动删除旧 tag
- **服务器 git clone**（`~/vi-agent-repos/<name>/`）：每人一份，随时间增大。定期 `git gc` 或重新 clone
- **查看当前版本**: `bash deploy/dev-environment/dev.sh --show-versions`

---

## 错误处理

| 错误 | 原因 | 解决 |
|------|------|------|
| SSH 连接失败 | SSH key 未加到服务器 | 参考 `docs/dev-onboarding.md` |
| GitHub 拉取失败 | SSH Agent Forwarding 未生效 | 确保用了 `-A` flag (脚本已内置) |
| Missing .env keys | 本地 `.env` 未配置 | 复制 `.env.example` 并填写 |
| No available slots | 服务器 slot 已满（最多9个） | 先销毁一个旧实例 |
| Docker Hub push 失败 | 服务器未登录 Docker Hub | SSH 进服务器执行 `docker login` |
