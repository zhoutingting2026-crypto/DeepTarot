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

const server = http.createServer((req, res) => {
  // 1) 百炼应用 API 代理：/bailian/apps/{app_id}/completion
  const m = req.url.match(/^\/bailian\/apps\/([^/]+)\/completion/);
  if (m && req.method === 'POST') {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
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
