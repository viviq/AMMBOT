# 管理API文档

- `GET /health`：健康检查
- `GET /config`：返回当前配置（敏感信息打码）

后续可拓展：
- `PUT /config`：更新运行时阈值/黑名单（需鉴权）
- `GET /status`：运行状态（WS重连次数、触发计数等）

