# 部署与运维指南（Vercel + Railway）

## Railway（数据面）
- 创建服务，使用本仓库构建Docker镜像或Node运行时。
- 环境变量：`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`，可选DB与Redis连接串。
- 资源建议：2 vCPU / 2–4GB RAM。
- 日志与监控：接入Railway内置日志；进一步可部署Prometheus+Grafana。

## Vercel（控制面，可选）
- 创建前端项目，读取后端公开API（如 /config /status）。
- 仅承载配置管理与可视化，不跑WS与采集任务。

## Docker
```
docker build -t amm-futures .
docker run -e TELEGRAM_BOT_TOKEN=xxx -e TELEGRAM_CHAT_ID=yyy -p 3000:3000 amm-futures
```

## 运行与维护
- 关注Binance API公告与接口变更，定期升级依赖。
- 根据负载调整 `oiPollIntervalSec` 与 `restBatchSize`。
## Railway 部署与隐私

为避免在公开仓库泄露密钥，请按以下方式使用环境变量：

- 必填变量：
  - `TELEGRAM_BOT_TOKEN`：Telegram 机器人密钥（用于告警）
  - `TELEGRAM_CHAT_ID`：目标聊天 ID（单个）
- 可选变量：
  - `CMC_API_KEY`：CoinMarketCap API 密钥（如启用 CMC 基础面）
  - `PORT`：Railway 自动注入，通常无需手动设置

### 步骤

1. 将项目推送到 GitHub（不要提交任何真实密钥到 `config.yaml` 或 `.env`）。
2. 在 Railway 创建新项目，选择从 GitHub 部署。
3. 在 Service → Settings → Variables 添加上面的环境变量。
4. 设置构建/启动命令：
   - Build Command: `npm ci && npm run build`
   - Start Command: `npm start`
5. 部署完成后，打开预览 URL，验证：
   - `GET /health` 返回 `{ ok: true }`
   - `GET /config` 显示 `telegram.botToken` 与 `fundamentalsApi.apiKey` 已遮蔽为 `***`

### 说明

- 代码会读取上述环境变量，并覆盖 `config.yaml` 中相应敏感字段（如 CMC 密钥）。
- 日志与 `/config` 接口输出中，Telegram 与 CMC 的密钥均已被遮蔽。
- 请勿将真实密钥写入仓库；如需本地运行，可使用未提交的 `.env` 文件（参考 `dotenv` 约定）。

