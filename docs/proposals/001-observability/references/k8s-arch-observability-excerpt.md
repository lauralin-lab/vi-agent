# K8s 架构文档 — 可观测性相关摘录

> 摘自 `docs/k8s-production-architecture.md` v2.0 (2026-03-11)
> 仅保留与 trace/log/metric 直接相关的章节

---

## Phase 1 监控 (§4.8) — ≤50 用户

**技术栈**: GKE 内置 Cloud Monitoring + Cloud Logging（零额外部署）

**为什么 Phase 1 不用 Prometheus**: Cloud Monitoring 已经覆盖 CPU/Memory/Disk/Network 等基础指标，
且零运维。50 用户场景下，Cloud Monitoring 的 5 条 critical alert 足够。

**5 条 Critical 告警**:

| # | 告警名称 | 触发条件 |
|---|---------|---------|
| 1 | Sandbox Pod 创建失败率过高 | `rate(scheduler_pod_create_failures[5m]) / rate(scheduler_pod_create_total[5m]) > 0.1` |
| 2 | API Key Proxy 错误率过高 | `rate(proxy_5xx_total[5m]) / rate(proxy_requests_total[5m]) > 0.05` |
| 3 | 上游 AI API 延迟过高 | P99 延迟 > 30 秒 |
| 4 | Redis 连接异常 | `redis_connected_clients == 0` 或内存 > 90% |
| 5 | GCS Cloud-Sync 失败 | `increase(cloud_sync_failures_total[10m]) > 3` |

---

## Phase 2 监控升级 (§5.7) — ~1,000 用户

**技术栈**:
- Metrics: Prometheus (GKE Managed Prometheus 或自建) + Grafana
- Logging: Cloud Logging + Loki (Grafana 统一查询)
- Alerting: Alertmanager → Slack + PagerDuty

**4 个 Grafana Dashboard**:
1. 系统总览 — 集群健康、流量概览、错误率、成本
2. Sandbox 生命周期 — Pod 创建/销毁、Warm Pool、Cloud-sync
3. AI API 使用 — token 消耗、per-user 成本、延迟、rate limit
4. 安全 — token 验证失败、gVisor 违规、NetworkPolicy 拒绝

---

## Phase 3 关键升级 (§6) — ~10,000 用户

**新增**:
- 分布式追踪（全链路 trace）
- 异常检测自动化（anomaly-detector 服务）
- 自定义 metrics HPA

| 能力 | Phase 1 | Phase 2 | Phase 3 |
|------|---------|---------|---------|
| 异常检测 | 手动告警 | Prometheus 规则 (阈值) | ML-based (per-user baseline) |
| 日志 | Cloud Logging | + Loki | + 分布式 trace 关联 |
| Metrics | Cloud Monitoring | + Prometheus/Grafana | + 自定义 metrics HPA |
| 追踪 | 无 | 无 | 全链路分布式 trace |

---

## 当前代码现状 (2026-03-11 审计)

- Python 服务 (api-server, realtime): 标准 `logging` 模块，无结构化，无 trace propagation
- TypeScript 服务 (nanoclaw): console.log 式日志
- **零 OpenTelemetry / 零 metrics 导出 / 零分布式 tracing**
- 服务间通信通过 Redis PUB/SUB，无 trace context 传播

---

## AI 加速估算

| 任务类型 | 传统估时 | AI 辅助估时 | 加速倍率 |
|---------|---------|-----------|---------|
| 监控/告警配置 | 3 天 | 1 天 | 3x |
| 分布式系统调试 | 不可预估 | 不可预估 | 1x |
