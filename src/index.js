const JSON_HEADERS = {
  'content-type':'application/json; charset=utf-8',
  'access-control-allow-origin':'*',
  'access-control-allow-headers':'authorization, content-type',
  'access-control-allow-methods':'GET,POST,OPTIONS'
};
const safeJson=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...JSON_HEADERS,...extra}});
const errorJson=(message,status=400)=>safeJson({ok:false,error:String(message)},status);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const rid=()=>crypto.randomUUID();
function tokenFrom(request){const a=request.headers.get('authorization')||'';return a.toLowerCase().startsWith('bearer ')?a.slice(7).trim():''}
function authorized(request,env){return !env.BOOK_API_TOKEN || tokenFrom(request)===env.BOOK_API_TOKEN}
function maxUpload(env){return clamp(num(env.MAX_UPLOAD_BYTES,18*1024*1024),1024,25*1024*1024)}
function safeName(name){return String(name||'upload.bin').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,180)||'upload.bin'}
function inferMime(name,mime=''){if(mime)return mime;const ext=name.toLowerCase().split('.').pop();return ({pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',bmp:'image/bmp',svg:'image/svg+xml'})[ext]||'application/octet-stream'}
function calculate(body={}){
 const s=body.settings||{};const count=Math.max(1,Math.floor(num(s.count,1))),endpapers=Math.max(0,Math.floor(num(s.endpapers))),caliper=Math.max(0,num(s.caliper,.1)),board=Math.max(0,num(s.board,.4)),width=Math.max(.1,num(s.width,145)),height=Math.max(.1,num(s.height,210)),gsm=Math.max(1,num(s.gsm,80)),bleed=Math.max(0,num(s.bleed,3));
 const sheets=Math.ceil(count/2)+endpapers,blockMm=sheets*caliper,thicknessMm=blockMm+2*board,weightGrams=Math.round(sheets*width*height/1e6*gsm),wrapWidthMm=2*width+blockMm+2*bleed,wrapHeightMm=height+2*bleed;
 const mode=body.mode||body.source?.mode||'demo',dimensions=Array.isArray(body.dimensions)?body.dimensions:(Array.isArray(body.source?.dimensions)?body.source.dimensions:null);let warning=mode!=='pdf',summary=mode==='demo'?'ממתין לטעינת כתב יד':mode==='docx'?'Word · קובץ נשמר מקומית':'PDF · קובץ נשמר מקומית';let message=mode==='demo'?'טען כתב יד כדי לחשב את מפרט הספר.':mode==='docx'?'החישוב בוצע בשרת. התצוגה נשמרת ומופקת מהעותק המקומי בדפדפן.':'החישוב בוצע בשרת. הקובץ המקורי נשמר בדפדפן ונשלח במייל.';
 if(dimensions?.length){const extra=s.sourceSize==='bleed'?2*bleed:0;const mismatch=dimensions.filter(d=>Array.isArray(d)&&(Math.abs(num(d[0])-width-extra)>1||Math.abs(num(d[1])-height-extra)>1)).length;message+=` מידות המקור: ${num(dimensions[0][0]).toFixed(1)} × ${num(dimensions[0][1]).toFixed(1)} מ״מ.`;if(mismatch){warning=true;summary=`${mismatch} עמודים עם מידות שונות מהמפרט`;message+=` ${mismatch} עמודים אינם תואמים למידות המפרט.`}else message+=' מידות העמודים תואמות למפרט.'}
 if(count%2)message+=' בסוף הספר נוסף צד ריק להשלמת דף.';if(s.sourceSize==='trim'&&bleed>0)message+=' הקובץ מוגדר במידת חיתוך; גלישה חסרה אינה נוצרת אוטומטית.';
 return {sheets,caliperMm:caliper,blockMm,thicknessMm,weightGrams,wrapWidthMm,wrapHeightMm,validation:{warning,summary,message}};
}
function bytesToBase64(bytes){let out='';const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)out+=String.fromCharCode(...bytes.subarray(i,i+chunk));return btoa(out)}
async function sendResend(env,file,name,mime,kind){
 if(!env.RESEND_API_KEY)throw Error('RESEND_API_KEY לא הוגדר');
 if(!env.EMAIL_TO)throw Error('EMAIL_TO לא הוגדר');
 if(!env.RESEND_FROM)throw Error('RESEND_FROM לא הוגדר');
 const bytes=new Uint8Array(await file.arrayBuffer());
 const payload={from:env.RESEND_FROM,to:[env.EMAIL_TO],subject:`Book Studio upload — ${name}`,text:`קובץ חדש הועלה ל-Book Studio.\nסוג: ${kind}\nשם: ${name}\nגודל: ${(file.size/1024/1024).toFixed(2)} MB\n\nהקובץ אינו נשמר בענן; העותק הקבוע נשמר מקומית בדפדפן המשתמש.`,attachments:[{filename:name,content:bytesToBase64(bytes),content_type:mime}]};
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify(payload)});
 const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data?.message||`Resend החזיר ${r.status}`);return data.id||null;
}
async function handleUpload(request,env){
 if(!authorized(request,env))return errorJson('קוד הגישה לשרת אינו תקין',401);
 let form;try{form=await request.formData()}catch{return errorJson('טופס ההעלאה אינו תקין')}
 const file=form.get('file'),kind=String(form.get('kind')||'');if(!(file instanceof File))return errorJson('לא התקבל קובץ');if(!['manuscript','front','wrap'].includes(kind))return errorJson('סוג העלאה לא מוכר');if(file.size<=0)return errorJson('הקובץ ריק');if(file.size>maxUpload(env))return errorJson(`גודל הקובץ המרבי לשליחה במייל הוא ${(maxUpload(env)/1024/1024).toFixed(0)}MB`,413);
 const name=safeName(file.name),mime=inferMime(name,file.type);if(kind==='manuscript'&&!(/\.pdf$/i.test(name)||/\.docx$/i.test(name)))return errorJson('כתב יד חייב להיות PDF או DOCX');if(kind!=='manuscript'&&!(mime.startsWith('image/')||/\.pdf$/i.test(name)))return errorJson('כריכה חייבת להיות תמונה או PDF');
 try{const resendId=await sendResend(env,file,name,mime,kind);const mode=kind==='manuscript'?(/\.pdf$/i.test(name)?'pdf':'docx'):(mime.startsWith('image/')?'image':'pdf');return safeJson({ok:true,emailSent:true,resendId,file:{id:rid(),name,kind,mime,size:file.size,createdAt:new Date().toISOString(),mode,storage:'browser-local'}})}catch(e){return errorJson(e.message||e,500)}
}
async function route(request,env){const url=new URL(request.url);if(request.method==='OPTIONS')return new Response(null,{status:204,headers:JSON_HEADERS});if(url.pathname==='/api/health')return safeJson({ok:true,service:'book-studio-cloud-free',storage:'browser-local',movieCloud:false,time:new Date().toISOString()});if(url.pathname==='/api/calc'&&request.method==='POST'){try{return safeJson({ok:true,calc:calculate(await request.json())})}catch(e){return errorJson(e.message||e)}}if(url.pathname==='/api/upload'&&request.method==='POST')return handleUpload(request,env);return null}
export default {async fetch(request,env){try{const api=await route(request,env);if(api)return api;if(env.ASSETS)return env.ASSETS.fetch(request);return new Response('Book Studio',{headers:{'content-type':'text/plain; charset=utf-8'}})}catch(e){console.error(e);return errorJson(e.message||'Internal error',500)}}};
