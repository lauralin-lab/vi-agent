# /dev-info — 查看 Dev 环境状态

查看所有 dev 环境实例的运行状态、版本信息和部署详情。

## 配置

- **服务器 IP**: `34.56.23.173`

## SSH 连接

和 `/dev` 相同的 SSH key 检测逻辑:
```bash
# 按优先级检测本地 SSH key
for key in ~/.ssh/gcp_ssh_key ~/.ssh/id_ed25519 ~/.ssh/id_rsa ~/.ssh/id_ecdsa; do
  if [ -f "$key" ]; then SSH_KEY="$key"; break; fi
done
SSH_CMD="ssh -A -i $SSH_KEY liyasong@34.56.23.173"
```

如果连接失败，提示用户联系管理员添加 SSH key。

## 执行流程

### Step 1: 从服务器获取信息

```bash
$SSH_CMD << 'REMOTE'
echo "===REGISTRY==="
cat /opt/vi-agent/registry.json 2>/dev/null || echo '{"instances":{}}'

echo ""
echo "===CONTAINERS==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null

echo ""
echo "===RESOURCES==="
free -h | head -2
echo ""
df -h / | tail -1

echo ""
echo "===DOCKER_STATS==="
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" 2>/dev/null | head -40
REMOTE
```

### Step 2: 格式化输出

**从 `docker ps` 的容器名和端口中自动提取实例信息**（不依赖 registry.json，因为可能为空）。

解析规则:
- 容器名格式: `{project-name}-{service}-1`，如 `vi-agent-liya-api-server-1` 或 `casey-api-server-1`
- 从端口映射中提取: `0.0.0.0:3101->8000/tcp` → frontend/api/gateway 端口

输出格式:

```
## 🖥 服务器状态
   IP: 34.56.23.173 | CPU: {load} | 内存: {used}/{total} ({pct}%) | 磁盘: {used}/{total}

## 📦 实例列表 ({count} 个运行中)

| Name | Frontend | API | API Docs | Gateway | Status | 内存 |
|------|----------|-----|----------|---------|--------|------|
| liya | http://34.56.23.173:3100 | http://34.56.23.173:3101 | http://34.56.23.173:3101/docs | :3102 | ✅ all healthy | ~660M |
| felisa | http://34.56.23.173:3200 | http://34.56.23.173:3201 | http://34.56.23.173:3201/docs | :3202 | ✅ all healthy | ~985M |

## 📊 资源详情
   每实例约 650M-1.1G 内存，realtime 服务是主要消耗者
   可用容量: 还能部署约 {N} 个实例

## ⚠️ 注意事项
   (如有异常: 内存接近 limit、服务 unhealthy、端口缺失等)
```

**关键: 访问链接必须是完整的 `http://34.56.23.173:{port}` 格式**，包括:
- Frontend URL
- API URL
- API Docs URL (`{API_URL}/docs`)
- Gateway URL

### Step 3: 健康检查（可选）

如果用户需要详细状态，对每个实例做快速健康检查:
```bash
$SSH_CMD "curl -sf http://localhost:<API_PORT>/health && echo ' OK' || echo ' FAIL'"
```

## 错误处理

- SSH 连接失败: SSH key 可能没加到服务器，联系管理员
- 无运行中的容器: 提示先运行 `/dev` 部署实例
- registry.json 为空: 正常情况（旧实例不在 registry 中），从 docker ps 解析
