// 每个展示包独立缓存，超时或失败可重试，不让慢请求永久卡住页面。
export function createLoader({timeoutMs=15000,fetchImpl=globalThis.fetch}={}){
 const cache=new Map();
 return {
  get(path){
   if(!cache.has(path)){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    const pending=Promise.resolve().then(async()=>{
     try{
      const response=await fetchImpl('./data/'+path+'?v=3',{signal:controller.signal});
      if(!response.ok)throw new Error('内容暂时无法加载');
      return await response.json();
     }catch(error){cache.delete(path);throw error;}
     finally{clearTimeout(timer);}
    });
    cache.set(path,pending);
   }
   return cache.get(path);
  }
 };
}
