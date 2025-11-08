# AMMbot Futures Monitor 

实现核心功能：
- 订阅币安期货全市场标记价格数组流（价格与资金费率）
- 分批轮询持仓量（OI）并维护10分钟窗口
- 规则触发（资金费率<0；价格>5%；OI>4.5%）
- 统一配置与黑名单；Telegram通知；REST管理API
- 代码质量：ESLint、JSDoc、Jest覆盖率>85%、GitHub Actions CI

## 快速开始

1. 安装依赖：`npm i`
2. 配置密钥：在 `config.yaml` 填写 `telegram.botToken` 和 `chatIds`，或通过环境变量：
   - `TELEGRAM_BOT_TOKEN`、`TELEGRAM_CHAT_ID`
3. 开发运行：`npm run dev`
4. 生产构建：`npm run build`，启动：`npm start`

## 配置
参见 `config.yaml`，可通过环境变量覆盖Telegram敏感信息。

## 部署
见 `docs/Deployment.md`，包含 Railway 容器部署与Vercel控制面建议。

## API
见 `docs/API.md`。

# AMMBOT
