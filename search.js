// 搜索文件按内容哈希命名，首次查询才读取；不读取评论或整站详情。
export function prepareSearch(items){
 return items.map(item=>({...item,normalized:item.text.toLowerCase()}));
}
export function searchItems(items,{query,kind='all',period='all',ascending=false}){
 const term=query.trim().toLowerCase();
 if(!term)return [];
 return items.filter(item=>(kind==='all'||item.kind===kind)&&(period==='all'||item.month.startsWith(period))&&item.normalized.includes(term))
  .sort((a,b)=>(a.time-b.time||Number(a.key.split(':')[1])-Number(b.key.split(':')[1]))*(ascending?1:-1));
}
export function snippet(text,query,radius=65){
 const at=text.toLowerCase().indexOf(query.toLowerCase());
 const start=Math.max(0,at-32),end=Math.min(text.length,Math.max(at,0)+query.length+radius);
 return (start?'…':'')+text.slice(start,end)+(end<text.length?'…':'');
}
// 分段交给页面转义，用户输入不作为正则表达式或 HTML 执行。
export function highlightParts(text,query){
 if(!query)return [{text,match:false}];
 const lower=text.toLowerCase(),term=query.toLowerCase(),parts=[];
 let from=0,at;
 while((at=lower.indexOf(term,from))>=0){
  if(at>from)parts.push({text:text.slice(from,at),match:false});
  parts.push({text:text.slice(at,at+query.length),match:true});from=at+query.length;
 }
 if(from<text.length)parts.push({text:text.slice(from),match:false});
 return parts;
}
