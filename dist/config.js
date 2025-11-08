import fs from 'fs';
import { parse } from 'yaml';
import { logger } from './logger.js';
/**
 * 加载应用配置（支持环境变量覆盖敏感信息）
 */
export function loadConfig(path = 'config.yaml') {
    const text = fs.readFileSync(path, 'utf-8');
    const cfg = parse(text);
    // 允许通过环境变量覆盖Telegram敏感信息
    if (process.env.TELEGRAM_BOT_TOKEN) {
        cfg.telegram.botToken = process.env.TELEGRAM_BOT_TOKEN;
    }
    // 支持单个或多个聊天ID
    if (process.env.TELEGRAM_CHAT_IDS) {
        const ids = String(process.env.TELEGRAM_CHAT_IDS)
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        if (ids.length > 0)
            cfg.telegram.chatIds = ids;
    }
    else if (process.env.TELEGRAM_CHAT_ID) {
        cfg.telegram.chatIds = [process.env.TELEGRAM_CHAT_ID];
    }
    // 允许通过环境变量覆盖 CMC 密钥（避免在仓库中明文保存）
    if (process.env.CMC_API_KEY) {
        const fapi = (cfg.fundamentalsApi || { provider: 'cmc' });
        fapi.apiKey = process.env.CMC_API_KEY;
        cfg.fundamentalsApi = fapi;
    }
    // 打印配置时遮蔽敏感信息
    const redactedCfg = {
        ...cfg,
        telegram: { ...cfg.telegram, botToken: '***' }
    };
    if (redactedCfg.fundamentalsApi?.apiKey) {
        redactedCfg.fundamentalsApi.apiKey = '***';
    }
    logger.info({ cfg: redactedCfg }, 'Config loaded');
    return cfg;
}
