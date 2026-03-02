# /dev-info — 查看 Dev 环境状态

查看所有 dev 环境实例的运行状态、版本信息和部署详情。

## 配置

- **服务器 IP**: `34.56.23.173`
- **管理员 SSH Key**: `~/.ssh/gcp_ssh_key`
- **管理员用户**: `liyasong`

## 执行流程

### Step 1: 从服务器获取信息

SSH 到服务器获取 registry 和容器状态:

```bash
ssh -i ~/.ssh/gcp_ssh_key liyasong@34.56.23.173 << 'REMOTE'
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
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" 2>/dev/null | head -20
REMOTE
```

### Step 2: 格式化输出

将服务器数据整理为清晰的表格展示:

1. **环境总览**:
   - 服务器 IP、机器规格、总内存/已用内存、磁盘使用

2. **实例列表** (从 registry.json 读取):
   ```
   Name   | Version         | Frontend      | API           | Status  | Deployed           | By
   -------|-----------------|---------------|---------------|---------|--------------------|---------
   liya   | main@abc1234    | :3100         | :3101         | running | 2026-03-02 08:33   | liya
   casey  | feat/auth@def56 | :3200         | :3201         | running | 2026-03-02 10:00   | casey
   ```

3. **默认实例** (原始部署):
   - 端口: 80/8000/18789
   - 状态

4. **资源使用** (docker stats):
   - 每个容器的 CPU 和内存使用

5. **可用容量**:
   - 当前已部署实例数 / 最大建议数
   - 剩余内存是否足够新增实例

### Step 3: 同步到本地

将服务器 registry.json 的数据同步更新到 `.teamspace/environments/dev/registry.yml`

## 错误处理

- SSH 连接失败: 检查 `~/.ssh/gcp_ssh_key`
- 无 registry.json: 说明尚未初始化多租户环境，提示先运行 `/dev`
