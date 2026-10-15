// 常见开头按前缀补全；出现具体内容后，按短语相关性筛选，不凑数。
function normalizeQuestion(value){
  const aliases={'涨工资':'加薪','涨薪':'加薪','发信息':'联系','发消息':'联系','脱单':'新恋情','合好':'和好','不开心':'心情低落','睡不好':'睡眠','睡不着':'睡眠','闺蜜':'朋友','舍友':'室友'};
  let text=value.trim().toLowerCase().replace(/[\s，。？！,.?!]/g,'');
  Object.entries(aliases).forEach(([from,to])=>{text=text.split(from).join(to);});
  return text;
}
function questionCore(text){
  return text.replace(/我想知道|我想问|请问|能不能|可不可以|是不是|该不该|要不要|怎么样|怎么|如何|为什么|怎样|现在|最近|目前|一下|我的|我该|我想|我要|我能|我会|我是|我们|我|吗|呢|呀|啊|的|了/g,'');
}
function questionRecommendations(value){
  const q=normalizeQuestion(value);
  if(!q)return [];
  const pool=(QUESTION_BANK[curCat]||[]).flatMap(group=>group.items.map(text=>({text,keys:group.keys})));
  const opening=/^(我|我想|我该|我怎么|我要|我能|我会|我想问|我想知道|怎么|如何|我该怎么)$/;
  if(opening.test(q)){
    const prefix=q==='我想问'||q==='我想知道'?'我':q;
    return [...new Set(pool.map(x=>x.text))].filter(text=>normalizeQuestion(text).startsWith(prefix)).slice(0,4);
  }
  const core=questionCore(q);
  if(!core)return [];
  const pairs=text=>new Set(Array.from({length:Math.max(0,text.length-1)},(_,i)=>text.slice(i,i+2)));
  const queryPairs=pairs(core);
  const ranked=pool.filter(x=>normalizeQuestion(x.text)!==q).map(x=>{
    const text=normalizeQuestion(x.text), candidate=questionCore(text);
    const shared=[...queryPairs].filter(word=>candidate.includes(word)).length;
    const direct=core.length>=2&&(candidate.includes(core)||core.includes(candidate));
    const exactPrefix=text.startsWith(q);
    const keyHit=x.keys.filter(k=>k.length>=2&&q.includes(normalizeQuestion(k))).reduce((n,k)=>Math.max(n,k.length),0);
    const oneChar=core.length===1&&x.keys.some(k=>k===core);
    return {...x,core:candidate,score:(exactPrefix?120:0)+(direct?80:0)+shared*12+(keyHit?15+keyHit:0)+(oneChar?20:0),eligible:exactPrefix||direct||shared>0||keyHit>0||oneChar};
  }).filter(x=>x.eligible).sort((a,b)=>b.score-a.score);
  const selected=[];
  for(const x of ranked){
    if(x.score<Math.max(12,(ranked[0]?.score||0)*.3))continue;
    if(selected.some(y=>{
      if(x.text===y.text)return true;
      const a=pairs(x.core),b=pairs(y.core);
      const overlap=[...a].filter(k=>b.has(k)).length;
      return a.size&&b.size&&2*overlap/(a.size+b.size)>.64;
    }))continue;
    selected.push(x);if(selected.length===4)break;
  }
  return selected.map(x=>x.text);
}
function hideQuestionSuggestions(){ document.getElementById('questionSuggestions').hidden=true; }
function showQuestionSuggestions(){
  const input=document.getElementById('qInput');
  const box=document.getElementById('questionSuggestions');
  const suggestions=questionRecommendations(input.value);
  box.replaceChildren();
  box.hidden=!suggestions.length;
  if(!suggestions.length) return;
  document.getElementById('qqBody').classList.remove('open');
  document.getElementById('qqHint').textContent='展开问题 ▾';
  const hint=document.createElement('p'); hint.textContent='你是不是想问……（点选后仍可修改）'; box.append(hint);
  suggestions.forEach(text=>{
    const button=document.createElement('button'); button.type='button'; button.className='qq-item'; button.textContent=text;
    button.addEventListener('click',()=>{input.value=text;hideQuestionSuggestions();updateStartBtn();input.focus();hideQuestionSuggestions();});
    box.append(button);
  });
}
const questionInput=document.getElementById('qInput');
questionInput.addEventListener('input',e=>{if(!e.isComposing)showQuestionSuggestions();});
questionInput.addEventListener('compositionend',showQuestionSuggestions);
questionInput.addEventListener('keydown',e=>{
  if(e.key==='Escape')hideQuestionSuggestions();
  if(e.key==='ArrowDown'&&!document.getElementById('questionSuggestions').hidden){e.preventDefault();document.querySelector('#questionSuggestions button')?.focus();}
});
document.addEventListener('click',e=>{if(!e.target.closest('.question-shell'))hideQuestionSuggestions();});
const readingDialog=document.getElementById('readingDialog');
readingDialog.addEventListener('cancel',e=>e.preventDefault());
let readingTimer=null,readingPercent=0,readingFocus=null;
function updateReadingProgress(value){
  readingPercent=value;
  document.getElementById('readingProgressFill').style.transform=`scaleX(${value/100})`;
  document.getElementById('readingPercent').textContent=`${Math.floor(value)}%`;
  document.getElementById('readingProgress').setAttribute('aria-valuenow',Math.floor(value));
  document.getElementById('readingStatus').textContent=value>=100?'解读已就绪':value<30?'正在感受你的问题':value<65?'正在连接牌面与心意':value<90?'正在整理专属于你的解读':'解读仍在生成，请再稍候';
}
function beginReadingLoading(){
  readingFocus=document.activeElement;
  updateReadingProgress(0);
  document.documentElement.classList.add('reading-busy');
  readingDialog.classList.remove('is-leaving');
  readingDialog.showModal();
  readingTimer=setInterval(()=>updateReadingProgress(Math.min(94,readingPercent+(94-readingPercent)*.035)),700);
}
async function finishReadingLoading(){
  clearInterval(readingTimer);readingTimer=null;
  try {
    updateReadingProgress(100);
    await new Promise(resolve=>setTimeout(resolve,350));
    readingDialog.classList.add('is-leaving');
    await new Promise(resolve=>setTimeout(resolve,450));
  }
  finally {readingDialog.close();document.documentElement.classList.remove('reading-busy');if(readingFocus?.isConnected)readingFocus.focus({preventScroll:true});}
}

// 展开题库与联想共用同一份按标签分类的数据。
Object.keys(POPULAR_QUESTIONS).forEach(cat=>{QQ[cat]=POPULAR_QUESTIONS[cat];});
renderQQ(curCat);
