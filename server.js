// DeepTarot 分享版服务端：托管 output.html + 代理百炼 API（密钥仅在服务端，不进浏览器）
// 用法：node server.js   （可选环境变量：PORT / BAILIAN_TOKEN / BAILIAN_WORKSPACE / DASHSCOPE_BASE）
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// 密钥只在服务端、且只从环境变量读取，绝不写入代码（避免上传仓库时泄露）
const TOKEN = process.env.BAILIAN_TOKEN;
if (!TOKEN) {
  console.error('缺少环境变量 BAILIAN_TOKEN，请在 Railway 后台 Variables 中设置你的百炼 API Key（sk- 开头）后再启动。');
  process.exit(1);
}
const WORKSPACE = process.env.BAILIAN_WORKSPACE || '';
const DASHSCOPE = (process.env.DASHSCOPE_BASE || 'https://dashscope.aliyuncs.com').replace(/\/+$/, '');
const PORT = process.env.PORT || 3000;
const FILE = path.join(__dirname, 'output.html');

// ---- 访问/提问日志（仅记录时间、IP、用户问题，不记录任何密钥） ----
function ts() { return new Date().toISOString(); }
function clientIP(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || req.socket.remoteAddress || 'unknown';
}
function extractQuestion(prompt) {
  if (!prompt) return '(空)';
  let q = null;
  const m1 = prompt.match(/【用户的问题】\s*\n([\s\S]*?)\n\s*\n【牌阵类型】/);
  if (m1) q = m1[1].trim();
  const m2 = prompt.match(/【用户现在问你】([\s\S]*?)(?:【回答格式要求】)/);
  if (!q && m2) q = m2[1].trim();
  q = q || prompt;
  // 兜底：去掉可能附带的格式指令文字
  const cut = q.indexOf('【回答格式要求】');
  if (cut !== -1) q = q.slice(0, cut).trim();
  return q.length > 300 ? q.slice(0, 300) + '…' : q;
}

const server = http.createServer((req, res) => {
  // 0) 记录页面访问（仅 GET 首页/资源时打一行）
  if (req.method === 'GET') {
    console.log('[访问] ' + ts() + ' ' + clientIP(req) + ' ' + req.url);
  }
  // 1) 百炼应用 API 代理：/bailian/apps/{app_id}/completion
  const m = req.url.match(/^\/bailian\/apps\/([^/]+)\/completion/);
  if (m && req.method === 'POST') {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      // 记录访客实际提出的问题
      let promptText = '';
      try { const j = JSON.parse(body); promptText = (j.input && j.input.prompt) || ''; } catch (e) {}
      console.log('[提问] ' + ts() + ' ' + clientIP(req));
      console.log('       ' + extractQuestion(promptText));
      const target = DASHSCOPE + '/api/v1/apps/' + encodeURIComponent(m[1]) + '/completion';
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + TOKEN
      };
      if (WORKSPACE) headers['X-DashScope-WorkSpace'] = WORKSPACE;
      const up = https.request(target, { method: 'POST', headers }, (r2) => {
        let out = '';
        r2.on('data', d => { out += d; });
        r2.on('end', () => {
          res.writeHead(r2.statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(out);
        });
      });
      up.on('error', e => { res.writeHead(502); res.end(JSON.stringify({ error: String(e) })); });
      up.write(body);
      up.end();
    });
    return;
  }

  // 2) 静态托管：默认返回 output.html
  fs.readFile(FILE, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log('DeepTarot (Bailian) running at http://localhost:' + PORT);
});
