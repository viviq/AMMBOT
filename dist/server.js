import express from 'express';
import { logger } from './logger.js';
/**
 * 简易RESTful管理API（状态与健康检查）
 */
export function createServer(cfg) {
    const app = express();
    app.use(express.json());
    app.get('/health', (_req, res) => res.json({ ok: true }));
    app.get('/config', (_req, res) => {
        const publicCfg = { ...cfg, telegram: { ...cfg.telegram, botToken: '***' } };
        if (publicCfg.fundamentalsApi?.apiKey) {
            publicCfg.fundamentalsApi.apiKey = '***';
        }
        res.json(publicCfg);
    });
    const port = Number(process.env.PORT || 3000);
    const server = app.listen(port, () => logger.info({ port }, 'HTTP server started'));
    return { app, server };
}
