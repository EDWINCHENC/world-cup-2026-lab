# Contributing

感谢你愿意改进世界杯预测实验室。

## 开始开发

1. Fork 仓库并创建功能分支。
2. 运行 `npm ci` 安装依赖。
3. 如需 AI 猜比分，复制 `.env.example` 为 `.env.local` 并填写自己的
   `GEMINI_API_KEY`。不要提交任何真实密钥。
4. 完成修改后运行：

```bash
npm run lint
npm run build
```

## 提交 Pull Request

- 保持改动聚焦，并说明行为变化与验证方式。
- 数据更新请同时说明来源、日期和许可。
- 新增预测逻辑时，请清楚写明假设与局限，不要把预测描述为确定事实。
- 不要提交 `.env*`、生成目录、凭据或含个人信息的数据。
