# Security Policy

## 报告安全问题

请不要通过公开 Issue 报告密钥泄露或可被利用的漏洞。请使用 GitHub
仓库的 **Security advisories** 私下报告，并附上复现步骤和影响范围。

## API Key 与公开部署

- `GEMINI_API_KEY` 只应配置在服务端环境变量中，绝不能使用
  `NEXT_PUBLIC_` 前缀或提交进 Git。
- `/api/ai-score` 内置的内存限流和缓存适合单实例、小流量部署，不是完整的
  滥用防护。公开部署请在反向代理或平台层增加限流、预算告警和配额限制。
- 怀疑密钥泄露时，应立即在服务商后台撤销并轮换密钥。
- 可随时将 `AI_SCORE_ENABLED=false` 作为停止 AI 调用的紧急开关。
