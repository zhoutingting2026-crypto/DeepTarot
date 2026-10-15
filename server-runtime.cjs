const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function loadConfig(env = process.env){
  return {
    bailianToken:env.BAILIAN_TOKEN || '', appId:env.BAILIAN_APP_ID || '1fb037270ef2488c848ebebc00a926e3',
    workspace:env.BAILIAN_WORKSPACE || '', dashscope:env.DASHSCOPE_BASE || 'https://dashscope.aliyuncs.com',
    deepseekKey:env.DEEPSEEK_API_KEY || '', deepseekBase:env.DEEPSEEK_BASE || 'https://api.deepseek.com',
    model:env.DEEPSEEK_MODEL || 'deepseek-chat', timeoutMs:90000
  };
}
function publicConfig(config){
  return {
    ai:{key:'',base:'',proxy:config.deepseekKey ? '/api/deepseek' : '',model:config.model},
    bailian:{token:'',app_id:config.appId,workspace:'',base:'',proxy:'/bailian',enabled:!!(config.bailianToken && config.appId)}
  };
}
function renderPage(html, config){
  const safe = value => JSON.stringify(value).replace(/</g,'\\u003c');
  const pub = publicConfig(config);
  return html.replace(/const AI_CFG = \{[\s\S]*?\n\};/,()=>`const AI_CFG = ${safe(pub.ai)};`)
    .replace(/const BAILIAN_CFG = \{[\s\S]*?\n\};/,()=>`const BAILIAN_CFG = ${safe(pub.bailian)};`)
    .replace(/const COZE_CFG = \{[\s\S]*?\n\};/,()=>`const COZE_CFG = ${safe({token:'',bot_id:'',base:''})};`);
}
function problem(status, message){ return Object.assign(new Error(message),{status}); }
async function readJSON(req){
  if(!String(req.headers['content-type'] || '').startsWith('application/json'))throw problem(415,'请使用 JSON 请求');
  let bytes=0, data='';
  for await (const chunk of req){ bytes+=chunk.length; if(bytes>96*1024)throw problem(413,'请求内容过长'); data+=chunk; }
  try { return JSON.parse(data); } catch { throw problem(400,'请求不是有效的 JSON'); }
}
function createTarotServer(options = {}){
  const config=options.config || loadConfig();
  const root=options.root || __dirname;
  const fetchUpstream=options.fetch || fetch;
  const log=options.log || (entry=>console.log(JSON.stringify(entry)));
  const page=Buffer.from(renderPage(fs.readFileSync(path.join(root,'output.html'),'utf8'),config));
  const zipped=zlib.gzipSync(page);
  const limits=new Map(); let active=0;
  function send(res,status,data){
    if(res.destroyed || res.writableEnded)return;
    res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
    res.end(JSON.stringify(data));
  }
  return http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('X-Frame-Options','DENY');
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET' && url.pathname==='/health'){
      send(res,200,{status:'ok',bailian:!!(config.bailianToken&&config.appId),deepseek:!!config.deepseekKey}); return;
    }
    if((req.method==='GET'||req.method==='HEAD') && ['/', '/output.html'].includes(url.pathname)){
      const gzip=/\bgzip\b/.test(req.headers['accept-encoding'] || '');
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache',Vary:'Accept-Encoding',...(gzip?{'Content-Encoding':'gzip'}:{})});
      res.end(req.method==='HEAD'?undefined:(gzip?zipped:page));return;
    }
    const appMatch=url.pathname.match(/^\/bailian\/apps\/([a-zA-Z0-9_-]+)\/completion$/);
    const isDeepseek=url.pathname==='/api/deepseek';
    if(!appMatch && !isDeepseek){send(res,404,{error:'接口不存在'});return;}
    if(req.method!=='POST'){send(res,405,{error:'仅支持 POST'});return;}
    const origin=req.headers.origin;
    if(origin){
      try { if(new URL(origin).host!==req.headers.host)throw Error(); }
      catch { send(res,403,{error:'仅接受本网站的请求'}); return; }
    }
    const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim();
    const now=Date.now();
    for(const [key,value]of limits)if(now-value.start>=60000)limits.delete(key);
    const count=limits.get(ip)||{start:now,total:0};
    if(count.total>=15 || active>=5 || (!limits.has(ip)&&limits.size>=1000)){
      res.setHeader('Retry-After','60'); send(res,429,{error:'请求较多，请稍后再试'});return;
    }
    count.total++;limits.set(ip,count);active++;
    const started=Date.now(); const provider=isDeepseek?'deepseek':'bailian';
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),config.timeoutMs);
    const onClose=()=>{if(!res.writableEnded)controller.abort();};
    res.on('close',onClose);
    try {
      const incoming=await readJSON(req);
      if(!incoming || typeof incoming!=='object' || Array.isArray(incoming))throw problem(400,'请求必须是 JSON 对象');
      let target,headers={'Content-Type':'application/json'},body;
      if(appMatch){
        if(!config.bailianToken || !config.appId)throw problem(503,'服务端尚未配置百炼');
        if(appMatch[1]!==config.appId)throw problem(403,'应用 ID 与服务端配置不一致');
        if(typeof incoming?.input?.prompt!=='string'||!incoming.input.prompt.trim()||incoming.input.prompt.length>24000)throw problem(400,'百炼问题为空或过长');
        body={input:{prompt:incoming.input.prompt},parameters:{},debug:{}};
        if(incoming.input.session_id){
          if(typeof incoming.input.session_id!=='string'||incoming.input.session_id.length>200)throw problem(400,'会话 ID 无效');
          body.input.session_id=incoming.input.session_id;
        }
        target=config.dashscope.replace(/\/+$/,'')+'/api/v1/apps/'+encodeURIComponent(config.appId)+'/completion';
        headers.Authorization='Bearer '+config.bailianToken;
        if(config.workspace)headers['X-DashScope-WorkSpace']=config.workspace;
      }else{
        if(!config.deepseekKey)throw problem(503,'服务端尚未配置 DeepSeek');
        if(!Array.isArray(incoming.messages)||!incoming.messages.length||incoming.messages.length>20)throw problem(400,'消息数量无效');
        const messages=incoming.messages.map(message=>{
          if(!['system','user','assistant'].includes(message.role)||typeof message.content!=='string'||message.content.length>24000)throw problem(400,'消息格式无效');
          return {role:message.role,content:message.content};
        });
        body={model:config.model,messages,temperature:incoming.response_format?.type==='json_object'?0.7:0.9,max_tokens:Math.min(4000,Math.max(1,Number(incoming.max_tokens)||3000)),stream:false};
        if(incoming.response_format?.type==='json_object')body.response_format={type:'json_object'};
        target=config.deepseekBase.replace(/\/+$/,'')+'/chat/completions';
        headers.Authorization='Bearer '+config.deepseekKey;
      }
      const response=await fetchUpstream(target,{method:'POST',headers,body:JSON.stringify(body),signal:controller.signal});
      const raw=await response.text();
      let data;try{data=JSON.parse(raw);}catch{throw problem(502,'上游没有返回有效 JSON');}
      if(!response.ok || (provider==='bailian' && data.code && !data.output)){
        const code=String(data.code||data.error?.type||response.status).replace(/[^\w.-]/g,'').slice(0,80);
        const requestId=data.request_id||data.id;
        log({provider,status:response.status,code,requestId,ms:Date.now()-started});
        send(res,response.ok?502:response.status,{error:{message:provider+' 调用失败：'+code},code,request_id:requestId});return;
      }
      if(provider==='deepseek' && !data.choices?.[0]?.message?.content)throw problem(502,'DeepSeek 返回内容为空');
      if(provider==='bailian' && !data.output?.text)throw problem(502,'百炼返回内容为空');
      log({provider,status:200,requestId:data.request_id||data.id,model:provider==='deepseek'?config.model:undefined,ms:Date.now()-started});
      res.setHeader('X-AI-Provider',provider);
      send(res,200,data);
    }catch(error){
      const status=error.status || (controller.signal.aborted?504:502);
      const message=error.status?error.message:(controller.signal.aborted?'上游请求超时':'无法连接上游服务');
      log({provider,status,ms:Date.now()-started});
      send(res,status,{error:{message}});
    }finally{ clearTimeout(timeout);res.off('close',onClose);active--; }
  });
}
function startServer(options={}){
  const server=createTarotServer(options);
  const port=options.port ?? process.env.PORT ?? 3000;
  server.listen(port,'0.0.0.0',()=>console.log('DeepTarot listening on port '+server.address().port));
  return server;
}
module.exports={loadConfig,publicConfig,renderPage,createTarotServer,startServer};
