# DeepTarot 分享版（百炼智能体 · Railway 部署）

这是一个单文件塔罗站 + 阿里云百炼「应用」智能体的**可分享版本**：密钥只留在服务端，浏览器拿不到，别人打开网址就能用百炼解读。

## 目录（共 4 个文件，全部要一起上传）
- `output.html`：前端页面（已配置走同源代理 `/bailian`，前端不含密钥）
- `server.js`：Node 服务端，托管页面并转发百炼 API
- `package.json`：`npm start` 即可运行
- `README.md`：本说明

---

## 部署到 Railway（拿到可分享网址，约 5 分钟）

> ✅ **安全说明**：`server.js` **不在代码里保存任何密钥**，百炼 Key 只从 Railway 环境变量 `BAILIAN_TOKEN` 读取。因此上传到 GitHub（即使是公开仓库）也不会泄露你的 Key。只需在 Railway 后台设置 `BAILIAN_TOKEN` 即可。

### 方法 A：GitHub 网页直接上传（最简单，无需装 Git）
1. 打开 https://github.com ，注册/登录。
2. 右上角 **＋ → New repository**，仓库名随便起（如 `deeptarot`），**务必勾选 Private（私有）**，点 Create。
3. 进仓库后点 **Add file → Upload files**，把本目录 4 个文件（`output.html`、`server.js`、`package.json`、`README.md`）拖进去，Commit。
4. 打开 https://railway.app ，用 GitHub 登录 → **New Project → Deploy from GitHub repo** → 选刚才的仓库。
5. Railway 会自动识别 Node 项目并运行 `npm start`（监听 `PORT`）。等 1-2 分钟变绿。
6. 点项目里的 **Settings → Domains（或 Generate Domain）**，复制生成的 `https://xxxx.up.railway.app` —— 这就是你**可以发给朋友的网址**。

### 方法 B：用 Git 命令（如果你会用）
```bash
cd deploy
git init && git add . && git commit -m "init"
git remote add origin https://github.com/你的名/你的仓库.git
git push -u origin main
# 之后在 Railway 用 Deploy from GitHub repo 选择该仓库
```

### 第 4 步（必须）：在 Railway 后台设置密钥
- 项目里 **Variables → New Variable**，Key 填 `BAILIAN_TOKEN`，Value 填你的百炼 Key（以 `sk-` 开头）。
- **这一步是必须的**：现在的 `server.js` 只在环境变量里读 Key、代码里不留明文，所以上传 GitHub 不会泄露任何密钥；但若不设置，`server.js` 启动会直接报错退出（AI 不可用）。

---

## 验证是否成功
打开你拿到的 Railway 网址 → 抽一张牌 → 召唤解读 → 看解读区顶部角标：
- 显示 **「✦ 由阿里云百炼生成」** → 成功，朋友也能用。
- 显示 **「⚠ 已回退 …」** → 代理没起，检查 Railway 是否部署成功 / 日志有无报错。

## 本地自测（可选）
```
cd deploy
node server.js      # 打开 http://localhost:3000
```

## 以后改东西怎么办
- 只改 `D:\vibe\output.html`（唯一的源文件）。
- 改完在本机跑：`node D:\vibe\build_deploy.js` → 自动重新生成 `deploy/output.html`。
- 再把新的 `deploy/output.html` 重新上传/推送，Railway 会自动重新部署。
