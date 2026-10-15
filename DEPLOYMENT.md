# DeepTarot · Railway 发布版

本目录是可上传到现有 GitHub 仓库的发布文件。前端设计已保留；百炼和 DeepSeek 的密钥仅由服务器环境变量读取。

## 更新现有项目

1. 将本目录内的文件上传到原 GitHub 仓库的部署目录，保留原仓库与 Railway 项目的连接。
2. 若仓库根目录直接放着 server.js、output.html、package.json，上传本目录的内容到仓库根目录。若仓库内放的是 deploy 子目录，更新该目录，并将 Railway 的 Root Directory 设为 /deploy。
3. 在 Railway 服务的 Variables 中配置下列变量（不要提交到 GitHub）：

| 变量 | 用途 |
| --- | --- |
| BAILIAN_TOKEN | 百炼 API Key |
| BAILIAN_APP_ID | 已发布的百炼应用 ID |
| DEEPSEEK_API_KEY | DeepSeek API Key，用于失败回退 |
| BAILIAN_WORKSPACE | 可选，应用位于子业务空间时填写 |
| DEEPSEEK_MODEL | 可选，默认 deepseek-chat |

PORT 由 Railway 提供，不需要自行填写。密钥请从各服务商控制台复制，本项目不在文档或发布包里保存密钥。

4. Railway 启动命令为 npm start；Node.js 使用 22.x；健康检查路径 /health。
5. 生成或继续使用原先的 Railway 公网域名。健康接口只显示是否配置，不返回密钥。
6. Free 计划建议在 Settings → Deploy → Serverless 开启闲置休眠，并重新部署使其生效。不要添加持续唤醒的保活任务。免费额度不保证足够整月运行。

## 验证

访问 /health，正常应显示 status 为 ok，bailian 和 deepseek 为 true。
实际抽牌后检查生成来源；百炼失败时会说明原因，并尝试 DeepSeek。

只有调用相关错误码、耗时、请求编号会写入服务日志，默认不记录访客问题原文和回答。这里没有数据库或历史记录管理页面。

## 本地运行

需要 Node.js 22 或更新版本。复制 .env.example 为 .env，并自行填写服务商凭证，然后 npm start。不要上传 .env。

## 已有密钥的处理

如果旧仓库曾公开或旧页面已分享，旧的前端密钥可能被看到。上线前建议在百炼和 DeepSeek 控制台更换密钥，并把新值填入 Railway Variables。单纯删除最新版本的密钥不能清理 Git 历史。
