# 妮妮 v1.10.0

本次更新完善 AI 供应商配置，用户只需要选择供应商并输入 API Key，即可自动获取该账号当前可用的模型。

## 供应商预设

内置以下 OpenAI 兼容供应商：

- OpenAI
- DeepSeek
- 硅基流动 SiliconFlow
- 阿里云百炼 DashScope
- 火山方舟 Ark
- 月之暗面 Moonshot
- 智谱 BigModel
- OpenRouter
- Groq
- xAI
- Mistral AI
- Ollama 本地
- 自定义 OpenAI 兼容接口

选择供应商后会自动填写 Base URL、Chat Completions 地址和模型列表地址，不再需要用户手动查找接口。

## 自动获取模型

- 输入 API Key 后可调用供应商的模型列表接口。
- 自动解析 `data`、`models` 和数组格式的模型响应。
- 自动过滤 embedding、rerank、语音、TTS、审核和图像生成模型。
- 自动识别视觉模型，并优先选择支持视觉的模型。
- 如果供应商不提供模型列表，则回退到内置推荐模型。
- 自定义供应商仍允许手动填写接口和模型。

## 配置安全

- API Key 仍只保存在当前设备。
- 模型列表请求只发送到所选供应商。
- OpenRouter 会附带项目标识请求头，符合其公开接口约定。
- Ollama 本地模式无需 API Key。

## 验证

- 新增供应商预设、模型列表解析、模型过滤和视觉能力识别测试。
- `npm run test:all` 通过。
- Android 使用 `versionCode 28`、`versionName 1.10.0` 构建。
- 已在 1.9.0 上直接覆盖安装验证成功，无需卸载。
- 本地 APK SHA256：`5B84DF8F27F23F611BE35E3BE2CC53202D791A570A19DD1BCD0B1A22AA2B5B0A`
