import {createLoader} from './data-loader.js?v=3';
clearTimeout(window.archiveBootTimer);
const paths = {
  grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  message:'M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2v-10A8.5 8.5 0 0 1 10.5 3h2a8.5 8.5 0 0 1 8.5 8.5Z',
  article:'M5 3h14v18H5z M8 7h8 M8 11h8 M8 15h5',
  video:'M3 5h18v14H3z M10 9l5 3-5 3Z',
  heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  banana:'M6 3c1 8 7 12 15 10-2 6-9 8-14 4S2 8 6 3Z M7 5l2-3',
  arrow:'m9 5 7 7-7 7', back:'m15 5-7 7 7 7', external:'M14 3h7v7 M21 3 10 14 M10 3H3v18h18v-7',
  share:'M12 16V3 M7 8l5-5 5 5 M4 14v7h16v-7',
  play:'m8 4 13 8-13 8Z', missing:'M4 4h16v16H4z M4 16l5-5 4 4 3-3 4 4 M8 8h.01',
  down:'m6 9 6 6 6-6',
  clock:'M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.message}"/></svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl = value => {try {const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:'#';}catch{return '#';}};
const app = document.querySelector('#app');
const threadDialog=document.querySelector('#thread-dialog');
const lightbox=document.querySelector('#lightbox');
const about=document.querySelector('#about-dialog');
const pageSize=20, commentPageSize=20;
let data, lastHash='', lastMoment='', lightboxImages=[], lightboxIndex=0;
const scrollPositions=new Map();
const label={all:'全部动态',moment:'动态',article:'文章',video:'视频'};
const fmt=n=>Number(n||0)>=10000?(Number(n)/10000).toFixed(1)+'万':Number(n||0).toLocaleString('zh-CN');
function date(ms, full=false){if(!ms)return '时间未记录';return new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',...(full?{hour:'2-digit',minute:'2-digit',hour12:false}:{})}).format(new Date(ms)).replaceAll('/','-');}
function state(){const [path,query='']=(location.hash.slice(1)||'/feed').split('?');return {path,params:new URLSearchParams(query),id:path.startsWith('/moment/')?path.split('/')[2]:null};}
function route(path,params){const q=params.toString();return '#'+path+(q?'?'+q:'');}
function changed(values,path=state().path){const p=new URLSearchParams(state().params);for(const [k,v] of Object.entries(values)){if(v===null)p.delete(k);else p.set(k,String(v));}return route(path,p);}
function feedUrl(kind='all',page=1){const from=state().params.get('from')||'';const p=new URLSearchParams(state().id?from.split('?')[1]||'':state().params);for(const k of ['thread','rp','cp','tab','from'])p.delete(k);p.set('kind',kind);p.set('page',page);return route('/feed',p);}
function backUrl(){const from=state().params.get('from')||'';return /^#\/feed(?:\?|$)/.test(from)?from:feedUrl();}
function detailUrl(key){const id=key.split(':')[1];const from=state().id?backUrl():location.hash||feedUrl();return route('/moment/'+id,new URLSearchParams({from}));}
function destination(item){return item.kind==='moment'&&data.details[item.key]?detailUrl(item.key):safeUrl(item.url);}
function linkAttrs(item){const target=destination(item);return `href="${esc(target)}"${target.startsWith('#')?'':' target="_blank" rel="noopener noreferrer"'}`;}
function mediaUrl(id){return data.media[id]?.src || '';}
function avatar(user,size=''){const url=mediaUrl(user.avatar);return `<span class="avatar ${size}" aria-hidden="true">${url?`<img src="${esc(url)}" alt="" loading="lazy">`:esc(user.name?.slice(0,1)||'?')}</span>`;}
function textOnly(text){return String(text||'').replace(/\[img(?:=[^\]]*)?\][\s\S]*?\[\/img\]/gi,'').replace(/\[emot=([^\]]+)\/\]/g,'[表情]');}
function rich(text){
  // 先转义，再仅恢复受控的标记与 http(s) 链接，绝不插入原始 HTML。
  let s=esc(String(text||'').replace(/\[img(?:=[^\]]*)?\][\s\S]*?\[\/img\]/gi,''));
  s=s.replace(/\[emot=([^\]]+)\/\]/g,(_,code)=>{const e=data.emotions[code];return e?`<img class="emot-image" data-emotion="${esc(code)}" src="${esc(e.src)}" alt="[${esc(e.name)}]" title="${esc(e.name)}" loading="lazy">`:`<span class="emot" title="${esc(code)}">[表情]</span>`;});
  s=s.replace(/\[url=(https?:\/\/[^\]]+)\]([\s\S]*?)\[\/url\]/gi,(_,url,body)=>`<a href="${esc(safeUrl(url.replaceAll('&amp;','&')))}" target="_blank" rel="noopener noreferrer">${body}</a>`);
  s=s.replace(/\[at(?:\s+|=)([^\]]+)\]([^[]+)\[\/at\]/gi,(_,id,name)=>`<span class="text-link">@${name.replace(/^@+/, '')}</span>`);
  return s;
}
function imageGrid(images,extra=''){
  if(!images?.length)return '';
  const cls=images.length===1?'single':images.length===2?'two':images.length===4?'four':'many';
  return `<div class="media-grid ${cls} ${extra}">${images.map((id,i)=>{const url=mediaUrl(id);return url?`<button data-action="image" data-images="${esc(images.join(','))}" data-index="${i}" aria-label="查看第 ${i+1} 张图片"><img src="${esc(url)}" alt="第 ${i+1} 张图片" loading="lazy"></button>`:'<span class="image-unavailable">图片暂未保存</span>';}).join('')}</div>`;
}
function textBlock(item,full=false){const t=textOnly(item.text);if(!t.trim())return '';const collapse=!full&&(t.length>130||t.split('\n').length>4);return `<div><p class="rich-text${collapse?' clamped':''}${!full?' moment-text-link':''}"${!full?` role="link" tabindex="0" data-action="open-moment" data-href="${esc(destination(item))}"`:''}>${rich(item.text)}</p>${collapse?'<button class="expand" data-action="expand">展开全文</button>':''}</div>`;}
function video(item){const cover=mediaUrl(item.cover);return `<a class="video-visual" ${linkAttrs(item)} aria-label="在 AcFun 打开视频：${esc(item.title)}">${cover?`<img src="${esc(cover)}" alt="${esc(item.title)}的封面" loading="lazy">`:'<span class="image-unavailable">封面暂未保存</span>'}<span class="play-icon">${icon('play')}</span><span class="video-bottom"><span>${fmt(item.views)} 播放 · ${fmt(item.counts.commentCount)} 评论</span><span class="video-duration">${esc(item.duration)}</span></span></a><a ${linkAttrs(item)}><h3 class="source-title clamp-two">${esc(item.title)}</h3></a>${item.text?`<p class="article-excerpt">${rich(item.text)}</p>`:''}`;}
function article(item){return `<a class="source-hit" ${linkAttrs(item)}><h3 class="source-title clamp-two">${esc(item.title)}</h3><p class="article-excerpt">${rich(item.text)}</p></a>${imageGrid(item.images)}`;}
function source(item,depth=0){
  if(!item||depth>5)return '';
  if(item.restricted)return `<div class="source-deleted">${icon('missing')}<span>粉丝可见内容未在本站展示。</span></div>`;
  if(item.deleted)return `<div class="source-deleted">${icon('missing')}<span>抱歉，原内容已不存在。</span></div>`;
  return `<section class="repost"><a class="source-author" ${linkAttrs(item)}>@${esc(item.user.name)}</a>${item.kind==='video'?video(item):item.kind==='article'?article(item):`<a class="source-hit" ${linkAttrs(item)}><p class="rich-text clamped">${rich(item.text)}</p></a>${imageGrid(item.images)}${source(item.source,depth+1)}`}<div class="source-caption"><span>${item.kind==='moment'?'原动态':item.kind==='article'?'文章':'视频'} · ${date(item.time)}${item.visibleForFans?' · 原站粉丝可见':''}</span><a ${linkAttrs(item)} class="external-corner">${item.kind==='moment'&&data.details[item.key]?'查看原动态 →':'在 AcFun 打开 ↗'}</a></div></section>`;
}
function card(item,full=false){
  return `<article class="card ${full?'detail-card':''}"><div class="card-body"><header class="author-row">${avatar(item.user)}<div class="author-meta"><a class="author-name" href="https://www.acfun.cn/u/${esc(item.user.id)}" target="_blank" rel="noopener noreferrer">${esc(item.user.name)}</a>${item.user.id==='179922'?'<span class="up-mark">UP</span>':''}<a class="author-time" ${linkAttrs(item)}>${date(item.time,true)}${item.source?' · 转发动态':''}</a></div>${item.visibleForFans?'<span class="fans-badge">原站粉丝可见</span>':''}${item.case?`<span class="case-tag">${esc(item.case)}</span>`:''}</header>${item.kind==='moment'?textBlock(item,full)+imageGrid(item.images)+source(item.source):item.kind==='video'?video(item):article(item)}</div><footer class="card-footer"><div class="metrics"><a class="metric" ${item.kind==='moment'?`href="${esc(destination(item))}" data-scroll-comments="true"`:linkAttrs(item)} title="评论">${icon('message')} ${fmt(item.counts.commentCount)}</a><span class="metric" title="归档时点赞数">${icon('heart')} ${fmt(item.counts.likeCount)}</span><span class="metric" title="归档时香蕉数">${icon('banana')} ${fmt(item.counts.bananaCount)}</span><span class="metric" title="归档时转发数">${icon('share')} ${fmt(item.counts.shareCount)}</span></div><a class="detail-link" ${linkAttrs(item)}>${item.kind==='moment'?(full?'动态永久链接':'查看动态'):'在 AcFun 打开'} ${icon(item.kind==='moment'?'arrow':'external')}</a></footer></article>`;
}
function sidebar(kind='all'){
 const p=data.profile;

 return `<aside class="sidebar"><section class="profile-block">${avatar(p,'large')}<h2 class="profile-name">${esc(p.name)} <span class="up-mark">UP</span></h2><p class="profile-bio">${esc(p.bio.split('\n')[0])}</p><div class="profile-stats"><div><b>${esc(p.fans)}</b><span>原站粉丝</span></div><div><b>${data.counts.feed}</b><span>历史记录</span></div></div></section><nav class="archive-nav" aria-label="内容分类"><p class="section-label">浏览归档</p>${['all','moment','article','video'].map((k,i)=>`<a class="filter-link ${kind===k?'active':''}" href="${feedUrl(k)}">${icon(['grid','message','article','video'][i])}<span>${label[k]}</span><span>${k==='all'?data.counts.feed:data.catalog.all[k]}</span></a>`).join('')}</nav><p class="side-note">归档快照 · ${date(new Date(data.generatedAt).getTime())}<br>内容来自 AcFun，互动量为历史记录。<br>当前展示已保存的内容。</p></aside>`;
}
function pagination(page,total,key,basePath=state().path,position='bottom'){
 if(total<2&&position!=='top')return '';
 const make=n=>changed({[key]:n,...(key==='page'?{thread:null}:{} )},basePath);
 return `<nav class="pagination ${position==='top'?'pagination-top':''}" aria-label="${position==='top'?'顶部':''}${key==='page'?'动态':key==='cp'?'评论':'回复'}分页">${page>1?`<a class="page-button" aria-label="上一页" href="${esc(make(page-1))}">${icon('back')}</a>`:`<button class="page-button" disabled aria-label="上一页">${icon('back')}</button>`}${position==='top'?`<span class="page-summary">${page} / ${total}</span>`:pageNumbers(page,total).map(n=>n===null?'<span class="page-ellipsis">…</span>':`<a class="page-button ${n===page?'current':''}" ${n===page?'aria-current="page"':''} href="${esc(make(n))}">${n}</a>`).join('')}${page<total?`<a class="page-button" aria-label="下一页" href="${esc(make(page+1))}">${icon('arrow')}</a>`:`<button class="page-button" disabled aria-label="下一页">${icon('arrow')}</button>`}<form data-page-key="${key}" data-max="${total}"><label>前往 <input aria-label="${position==='top'?'顶部':''}跳转${key==='page'?'动态':key==='cp'?'评论':'回复'}页码" name="page" type="number" min="1" max="${total}" value="${page}" required></label><button class="go" type="submit">页 →</button></form></nav>`;
}
function periodPicker(period){
 const months=data.months;
 const years=[...new Set(months.map(x=>x.slice(0,4)))];
 const title=period==='all'?'全部':period.length===4?period+' 年':period.slice(0,4)+' 年 '+Number(period.slice(5))+' 月';
 const option=(value,text,cls='')=>`<a class="date-option ${cls} ${period===value?'selected':''}" ${period===value?'aria-current="true"':''} href="${esc(changed({period:value,year:null,page:1}))}">${text}</a>`;
 return `<details class="date-filter"><summary aria-label="筛选年份和月份">${title}${icon('down')}</summary><div class="date-options" role="group" aria-label="选择年份和月份">${option('all','全部','date-all')}${years.map(y=>`<section class="date-year"><h3>${option(y,y+' 年 · 全年')}</h3><div class="month-grid">${months.filter(m=>m.startsWith(y)).sort().map(m=>option(m,Number(m.slice(5))+' 月')).join('')}</div></section>`).join('')}</div></details>`;
}
function feedSelection(s){
 const kind=['all','moment','article','video'].includes(s.params.get('kind'))?s.params.get('kind'):'all';
 const requested=s.params.get('period')||s.params.get('year')||'all';
 const period=/^\d{4}(?:-(?:0[1-9]|1[0-2]))?$/.test(requested)?requested:'all';
 const ascending=s.params.get('order')==='asc';
 const count=data.catalog[period]?.[kind]||0;
 const total=Math.max(1,Math.ceil(count/pageSize));
 const page=Math.max(1,Math.min(total,Math.floor(Number(s.params.get('page')))||1));
 return {kind,period,ascending,count,total,page};
}
function renderFeed(s,view){
 const {kind,period,ascending,count,total,page,items}=view;
 const hero=mediaUrl(data.hero);
 document.title='1001fans · 1001Project 动态档案';
 app.innerHTML=`<div class="shell"><section class="hero">${hero?`<img class="hero-art" src="${esc(hero)}" alt="1001Project 绘画作品">`:''}</section><div class="workspace">${sidebar(kind)}<section class="feed-column"><div class="feed-toolbar"><h2 class="feed-heading">${label[kind]}<span>${count} 条</span></h2><div class="feed-meta"><a class="sort-toggle" href="${esc(changed({order:ascending?'desc':'asc',page:1}))}" title="切换发布时间排序">按发布时间${ascending?'顺序':'倒序'}<span aria-hidden="true">${ascending?'↑':'↓'}</span></a><div class="feed-controls">${periodPicker(period)}${pagination(page,total,'page',s.path,'top')}</div></div></div>${items.map(x=>card(x)).join('')||'<div class="card empty">这个筛选下没有内容。</div>'}${pagination(page,total,'page')}<p class="page-footnote">共 ${fmt(data.counts.feed)} 条历史记录<br>动态在这里留存，文章与视频回到 AcFun 继续阅读。</p></section></div></div>`;
}
function comment(item,detail,{preview=true}={}){
 const replies=item.replyPreview||[];
 const reported=Math.max(item.reportedReplies||0,detail.threads?.[item.id]?.savedReplies||0,replies.length);
 const short=preview&&reported>0?`<div class="reply-preview">${replies.slice(0,3).map(c=>`<p><span class="reply-name">${esc(c.user.name)}</span>${c.isUp?'<span class="up-mark">UP</span>':''}：${esc(textOnly(c.text)).slice(0,260)}</p>`).join('')}<a class="reply-open" href="${esc(changed({thread:item.id,rp:1}))}">查看全部 ${fmt(reported)} 条回复 ${icon('arrow')}</a></div>`:'';
 return `<article class="comment" id="comment-${esc(item.id)}">${avatar(item.user)}<div class="comment-main"><div class="comment-name"><a href="https://www.acfun.cn/u/${esc(item.user.id)}" target="_blank" rel="noopener noreferrer">${esc(item.user.name)}</a>${item.isUp?'<span class="up-mark">UP</span>':''}${item.hot?'<span class="hot-label">热评</span>':''}</div><p class="rich-text">${item.replyTo?`<span class="text-link">回复 @${esc(item.replyTo)}：</span>`:''}${rich(item.text)}</p>${imageGrid(item.images)}<div class="comment-meta">${item.floor&&item.id===item.root?`<span>#${esc(item.floor)}</span>`:''}<time>${date(item.time,true)}</time><span class="metric" title="归档时点赞数">${icon('heart')} ${fmt(item.likes)}</span></div>${short}</div></article>`;
}
function renderDetail(s){
 const detail=data.details['moment:'+s.id];
 if(!detail||typeof detail==='string'){app.innerHTML=`<div class="shell"><a class="text-link" href="#/feed">← 返回列表</a><div class="empty">尚未保存这条动态。</div></div>`;return;}
 document.title=textOnly(detail.text).slice(0,25)+' · 1001fans';
 const {tab,page,total}=detail.view;
 app.innerHTML=`<div class="shell detail-layout"><div class="backbar"><a href="${esc(backUrl())}">${icon('back')} 返回动态列表</a><a href="${esc(safeUrl(detail.url))}" target="_blank" rel="noopener noreferrer">原站动态 ${icon('external')}</a></div><div class="workspace">${sidebar('moment')}<section class="feed-column">${card(detail,true)}<section class="comment-section" id="comments"><div class="comment-heading"><h2>评论区<small>原站 ${fmt(detail.counts.commentCount)}</small></h2>${icon('message')}</div><nav class="comment-tabs" aria-label="评论排序"><a class="${tab==='all'?'active':''}" href="${esc(changed({tab:'all',cp:1,thread:null,rp:null}))}">全部评论 ${fmt(detail.archivedRoots)}</a><a class="${tab==='hot'?'active':''}" href="${esc(changed({tab:'hot',cp:1,thread:null,rp:null}))}">热门评论 ${fmt(detail.hotCount)}</a></nav>${detail.comments.map(c=>comment(c,detail)).join('')||`<div class="empty">${icon('message')}<p>${tab==='hot'?'尚未保存热门评论。':detail.commentsPending?'这条动态的评论尚未保存。':'尚未保存可展示的评论。'}</p></div>`}${pagination(page,total,'cp')}</section><p class="page-footnote">${date(detail.time)} 发布 · ${date(new Date(data.generatedAt).getTime())} 保存</p></section></div></div>`;
}
function renderThread(s){
 const detail=data.details['moment:'+s.id];const view=detail?.threadView;
 if(!view){if(threadDialog.open)threadDialog.close();return;}
 const {root,replies,info,total,page}=view;
 const reported=Math.max(info.reportedReplies||0,info.savedReplies);
 threadDialog.innerHTML=`<header class="drawer-header"><h2 id="thread-title">评论详情</h2><button class="dialog-close" data-action="close-thread" aria-label="关闭评论详情">×</button></header><div class="drawer-content"><div class="thread-parent">${root?comment(root,detail,{preview:false}):'<p class="empty">主评论尚未保存。</p>'}</div><div class="thread-count">共 ${fmt(reported)} 条回复 <small>已保存 ${fmt(info.savedReplies)} 条</small></div>${reported>info.savedReplies?`<div class="missing-note">当前快照尚缺 ${reported-info.savedReplies} 条回复，以下为已保存的内容。</div>`:''}${replies.map(c=>comment(c,detail,{preview:false})).join('')||'<p class="empty">尚未保存回复。</p>'}${pagination(page,total,'rp')}</div>`;
 if(!threadDialog.open)threadDialog.showModal();threadDialog.scrollTop=0;
}
function closeThread(){location.hash=changed({thread:null,rp:null});}
let renderVersion=0,renderFailed=false;
const loader=createLoader();
const getJSON=path=>loader.get(path);
async function getPack(path){
 const pack=await getJSON(path);
 Object.assign(data.media,pack.media);Object.assign(data.emotions,pack.emotions);
 return pack.item??pack.items;
}

function pageNumbers(page,total){
 const values=[...new Set([1,total,page-1,page,page+1].filter(n=>n>=1&&n<=total))].sort((a,b)=>a-b);
 const result=[];values.forEach((n,i)=>{if(i&&n-values[i-1]>1)result.push(null);result.push(n);});return result;
}
function selectedPage(params,key,length){return Math.max(1,Math.min(Math.max(1,length),Math.floor(Number(params.get(key)))||1));}
async function render(){
 const version=++renderVersion;const s=state();const hash=location.hash;
 const sameMoment=s.id&&lastMoment===s.id;
 const oldState=lastHash?new URLSearchParams(lastHash.split('?')[1]||''):new URLSearchParams();
 const onlyThread=!renderFailed&&sameMoment&&oldState.get('cp')===s.params.get('cp')&&oldState.get('tab')===s.params.get('tab');
 if(lastHash)scrollPositions.set(lastHash,window.scrollY);
 app.setAttribute('aria-busy','true');
 try{
  if(!data){
   const manifest=await getJSON('manifest.json');
   if(version!==renderVersion)return;
   if(manifest.schemaVersion!==3)throw new Error('网站数据版本不一致');
   const detailFiles=Object.fromEntries(manifest.momentIds.map(id=>['moment:'+id,'moments/'+id+'.json']));
   data={...manifest,detailFiles,details:{...detailFiles},media:{...manifest.media},emotions:{}};
  }
  let feedView;
  if(!s.id){
   feedView=feedSelection(s);
   const {kind,period,ascending,page,count}=feedView;
   feedView.items=count?await getPack(`feed/${kind}/${period}/${ascending?'asc':'desc'}/${page}.json`):[];
  }
  if(s.id&&data.detailFiles['moment:'+s.id]){
   const base=await getPack(data.detailFiles['moment:'+s.id]);
   const tab=s.params.get('tab')==='hot'?'hot':'all';const pages=tab==='hot'?base.hotPages:base.commentPages;
   const page=selectedPage(s.params,'cp',pages.length);
   const comments=pages.length?await getPack(pages[page-1]):[];
   const detail={...base,comments,view:{tab,page,total:Math.max(1,pages.length)},threadView:null};
   const info=base.threads[s.params.get('thread')];
   if(info){const rp=selectedPage(s.params,'rp',info.pages.length);detail.threadView={info,root:info.root,replies:info.pages.length?await getPack(info.pages[rp-1]):[],page:rp,total:Math.max(1,info.pages.length)};}
   if(version!==renderVersion)return;
   data.details['moment:'+s.id]=detail;
  }
  if(version!==renderVersion)return;
  if(!onlyThread){if(s.id)renderDetail(s);else renderFeed(s,feedView);}
  renderThread(s);
  if(!onlyThread){const saved=scrollPositions.get(hash);requestAnimationFrame(()=>{if(version!==renderVersion)return;if(saved!==undefined)window.scrollTo(0,saved);else if(sameMoment)document.querySelector('#comments')?.scrollIntoView();else window.scrollTo(0,0);if(sessionStorage.getItem('jumpComments')==='yes'){sessionStorage.removeItem('jumpComments');document.querySelector('#comments')?.scrollIntoView();}});}
  lastHash=hash;lastMoment=s.id||'';renderFailed=false;
 }catch(err){if(version===renderVersion){renderFailed=true;if(threadDialog.open)threadDialog.close();app.innerHTML='<div class="shell empty">加载超时或网络暂不可用。<button class="text-link" data-action="retry">重新加载</button> · <a href="#/feed">返回列表</a></div>';}}
 finally{if(version===renderVersion)app.removeAttribute('aria-busy');}
}
function renderLightbox(){const mid=lightboxImages[lightboxIndex];lightbox.innerHTML=`<span class="image-counter">${lightboxIndex+1} / ${lightboxImages.length}</span><button class="dialog-close" data-action="close-image" aria-label="关闭图片">×</button><img class="lightbox-image" src="${esc(mediaUrl(mid))}" alt="放大查看第 ${lightboxIndex+1} 张图片">${lightboxImages.length>1?`<button class="lightbox-nav prev" data-action="prev-image" aria-label="上一张图片">${icon('back')}</button><button class="lightbox-nav next" data-action="next-image" aria-label="下一张图片">${icon('arrow')}</button>`:''}<span class="lightbox-caption">${lightboxImages.length>1?'← → 切换图片 · ':''}Esc 关闭</span>`;}
function shiftImage(step){lightboxIndex=(lightboxIndex+step+lightboxImages.length)%lightboxImages.length;renderLightbox();}
document.addEventListener('click',e=>{
 if(!e.target.closest('.date-filter'))document.querySelector('.date-filter[open]')?.removeAttribute('open');
 const commentsLink=e.target.closest('[data-scroll-comments]');if(commentsLink){sessionStorage.setItem('jumpComments','yes');if(commentsLink.getAttribute('href')===location.hash){e.preventDefault();sessionStorage.removeItem('jumpComments');document.querySelector('#comments')?.scrollIntoView();}}
 const button=e.target.closest('[data-action]');if(!button)return;
 switch(button.dataset.action){
  case 'retry':render();break;
  case 'open-moment':if(!e.target.closest('a')){const href=button.dataset.href;if(href.startsWith('#'))location.hash=href;else window.open(href,'_blank','noopener,noreferrer');}break;
  case 'expand':{const p=button.previousElementSibling;const expanded=p.classList.toggle('clamped');button.textContent=expanded?'展开全文':'收起';break;}
  case 'image':lightboxImages=button.dataset.images.split(',').filter(id=>mediaUrl(id));lightboxIndex=Math.min(Number(button.dataset.index)||0,lightboxImages.length-1);renderLightbox();lightbox.showModal();break;
  case 'close-image':lightbox.close();break;
  case 'prev-image':shiftImage(-1);break;
  case 'next-image':shiftImage(1);break;
  case 'close-thread':closeThread();break;
  case 'about':about.showModal();break;
  case 'close-about':about.close();break;
 }
});
document.addEventListener('submit',e=>{const form=e.target.closest('[data-page-key]');if(!form)return;e.preventDefault();const page=Math.max(1,Math.min(Number(form.dataset.max),Math.floor(Number(new FormData(form).get('page')))||1));location.hash=changed({[form.dataset.pageKey]:page});});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const picker=document.querySelector('.date-filter[open]');if(picker){picker.removeAttribute('open');picker.querySelector('summary').focus();}}});
threadDialog.addEventListener('cancel',e=>{e.preventDefault();closeThread();});
threadDialog.addEventListener('click',e=>{if(e.target===threadDialog){const r=threadDialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right)closeThread();}});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.dataset.action==='open-moment'){location.hash=e.target.dataset.href;}if(lightbox.open&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();shiftImage(e.key==='ArrowLeft'?-1:1);}});
window.addEventListener('hashchange',render);

const failedImages=new WeakMap();
document.addEventListener('error',event=>{
 const img=event.target;if(!(img instanceof HTMLImageElement)||!data)return;
 let record=failedImages.get(img);
 if(!record){const item=img.dataset.emotion?data.emotions[img.dataset.emotion]:Object.values(data.media).find(m=>new URL(m.src||'.',document.baseURI).href===img.src);record={urls:item?.fallbacks||[],next:0};failedImages.set(img,record);}
 if(record.next<record.urls.length){img.src=record.urls[record.next++];return;}
 img.hidden=true;const text=document.createElement('span');text.className='image-unavailable';text.textContent=img.dataset.emotion?img.alt:img.closest('.avatar')?'·':'图片暂不可用';if(img.dataset.emotion)text.className='emot';img.after(text);
},true);
await render();
