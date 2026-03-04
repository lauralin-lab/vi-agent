# /dev-info — 查看 Dev 环境状态

查看所有 dev 环境实例的运行状态、版本信息、部署详情和服务器磁盘用量。

## 执行流程

### Step 1: 加载 SSH 配置

```bash
bash deploy/dev-environment/dev.sh --show-config
```

从输出中读取 `SSH_KEY`。如果 `STATUS=missing-name`，仍可继续（只需要 SSH_KEY 来连服务器）。

### Step 2: 获取版本和磁盘信息

```bash
bash deploy/dev-environment/dev.sh --show-versions
```

输出包含：
- Docker Hub 已有 tags（含大小和更新时间）
- 本地 git tags
- 服务器磁盘用量（`df -h /`）
- Docker 镜像/容器/卷总占用（`docker system df`）
- 各实例的当前部署版本（从 registry.json 读取）

### Step 3: 获取容器运行状态

使用 Step 1 中的 `SSH_KEY`：

```bash
SSH_KEY=<from dev.sh --show-config>
SERVER=$(bash deploy/dev-environment/dev.sh --show-config 2>/dev/null | grep '^SERVER=' | cut -d= -f2)
ssh -A -i $SSH_KEY $SERVER << 'REMOTE'
echo "===CONTAINERS==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null

echo ""
echo "===DOCKER_STATS==="
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" 2>/dev/null | head -40
REMOTE
```

### Step 4: 格式化输出

结合 `--show-versions` 的实例列表和容器状态，输出：

```
## 🖥 服务器状态
   IP: 34.172.9.61 | 磁盘: {used}/{total} ({pct}%) | Docker: {images}GB images / {containers}MB containers

## 📦 实例列表 ({count} 个运行中)

| Name | Frontend (HTTPS) | Frontend (HTTP) | API | Gateway | Tag | Status | 内存 |
|------|------------------|-----------------|-----|---------|-----|--------|------|
| liya | https://34.172.9.61:3110 | http://34.172.9.61:3100 | :3101 | :3102 | dev-20260303-... | ✅ | ~660M |

## 📊 资源详情
   每实例约 650M-1.1G 内存
   可用容量: 还能部署约 {N} 个实例

## ⚠️ 注意事项
   (如有: 内存接近 limit、服务 unhealthy、磁盘 >80% 等)
```

**关键**: 访问链接必须是完整 URL。HTTPS 端口 = Frontend HTTP 端口 + 10（如 3100 → 3110）。

### Step 5: 磁盘告警（可选）

如果 `docker system df` 显示镜像占用超过 20GB，提示用户：
```
⚠️ Docker 镜像占用 {N}GB。运行以下命令清理旧 tag：
   bash deploy/dev-environment/dev.sh --cleanup --keep 5 --dry-run
   # 确认后去掉 --dry-run 实际执行
```

## 错误处理

- SSH 连接失败: 联系管理员添加 SSH key
- 无运行中的容器: 提示先运行 `/dev` 部署实例
- registry.json 为空: 正常（旧实例），从 docker ps 解析容器信息
