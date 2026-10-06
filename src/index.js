const JSON_HEADERS = {
  'content-type':'application/json; charset=utf-8',
  'access-control-allow-origin':'*',
  'access-control-allow-headers':'content-type',
  'access-control-allow-methods':'GET,POST,OPTIONS'
};
const safeJson=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{...JSON_HEADERS,...extra}});
const errorJson=(message,status=400)=>safeJson({ok:false,error:String(message)},status);
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const rid=()=>crypto.randomUUID();
function maxUpload(env){return clamp(num(env.MAX_UPLOAD_BYTES,18*1024*1024),1024,25*1024*1024)}
function safeName(name){return String(name||'upload.bin').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,180)||'upload.bin'}
function inferMime(name,mime=''){if(mime)return mime;const ext=name.toLowerCase().split('.').pop();return ({pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',bmp:'image/bmp',svg:'image/svg+xml'})[ext]||'application/octet-stream'}
function calculate(body={}){
 const s=body.settings||{};const count=Math.max(1,Math.floor(num(s.count,1))),endpapers=Math.max(0,Math.floor(num(s.endpapers))),caliper=Math.max(0,num(s.caliper,.1)),board=Math.max(0,num(s.board,.4)),width=Math.max(.1,num(s.width,145)),height=Math.max(.1,num(s.height,210)),gsm=Math.max(1,num(s.gsm,80)),bleed=Math.max(0,num(s.bleed,3));
 const sheets=Math.ceil(count/2)+endpapers,blockMm=sheets*caliper,thicknessMm=blockMm+2*board,weightGrams=Math.round(sheets*width*height/1e6*gsm),wrapWidthMm=2*width+blockMm+2*bleed,wrapHeightMm=height+2*bleed;
 const mode=body.mode||body.source?.mode||'demo',dimensions=Array.isArray(body.dimensions)?body.dimensions:(Array.isArray(body.source?.dimensions)?body.source.dimensions:null);let warning=mode!=='pdf',summary=mode==='demo'?'ממתין לטעינת כתב יד':mode==='docx'?'Word · מוכן':'PDF · מוכן';let message=mode==='demo'?'טען כתב יד כדי לחשב את מפרט הספר.':'החישוב בוצע בשרת וקישור הקובץ נשלח למייל.';
 if(dimensions?.length){const extra=s.sourceSize==='bleed'?2*bleed:0;const mismatch=dimensions.filter(d=>Array.isArray(d)&&(Math.abs(num(d[0])-width-extra)>1||Math.abs(num(d[1])-height-extra)>1)).length;message+=` מידות המקור: ${num(dimensions[0][0]).toFixed(1)} × ${num(dimensions[0][1]).toFixed(1)} מ״מ.`;if(mismatch){warning=true;summary=`${mismatch} עמודים עם מידות שונות מהמפרט`;message+=` ${mismatch} עמודים אינם תואמים למידות המפרט.`}else message+=' מידות העמודים תואמות למפרט.'}
 if(count%2)message+=' בסוף הספר נוסף צד ריק להשלמת דף.';if(s.sourceSize==='trim'&&bleed>0)message+=' הקובץ מוגדר במידת חיתוך; גלישה חסרה אינה נוצרת אוטומטית.';
 return {sheets,caliperMm:caliper,blockMm,thicknessMm,weightGrams,wrapWidthMm,wrapHeightMm,validation:{warning,summary,message}};
}
function validSupabaseSignedUrl(value){
 try{const u=new URL(String(value||''));return u.protocol==='https:'&&u.hostname==='rbqcspltguvrtdrdrjhg.supabase.co'&&u.pathname.startsWith('/storage/v1/object/sign/book-files/incoming/')}catch{return false}
}
async function sendResendLink(env,body){
 if(!env.RESEND_API_KEY)throw Error('RESEND_API_KEY לא הוגדר');
 if(!env.EMAIL_TO)throw Error('EMAIL_TO לא הוגדר');
 if(!env.RESEND_FROM)throw Error('RESEND_FROM לא הוגדר');
 const name=safeName(body.name),kind=String(body.kind||'file'),size=Math.max(0,num(body.size)),signedUrl=String(body.signedUrl||'');
 if(!validSupabaseSignedUrl(signedUrl))throw Error('קישור הקובץ אינו תקין');
 const text=`קובץ חדש הועלה ל-Book Studio.\n\nסוג: ${kind}\nשם: ${name}\nגודל: ${(size/1024/1024).toFixed(2)} MB\n\nקישור להורדה:\n${signedUrl}\n\nהקובץ נשמר ב-Supabase Storage והקישור הוא קישור חתום.`;
 const payload={from:env.RESEND_FROM,to:[env.EMAIL_TO],subject:`Book Studio upload — ${name}`,text};
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify(payload)});
 const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data?.message||`Resend החזיר ${r.status}`);return data.id||null;
}
async function handleStorageNotify(request,env){
 let body;try{body=await request.json()}catch{return errorJson('בקשת ההתראה אינה תקינה')}
 if(!['manuscript','front','wrap'].includes(String(body.kind||'')))return errorJson('סוג העלאה לא מוכר');
 try{const resendId=await sendResendLink(env,body);return safeJson({ok:true,emailSent:true,resendId})}catch(e){return errorJson(e.message||e,500)}
}
async function route(request,env){const url=new URL(request.url);if(request.method==='OPTIONS')return new Response(null,{status:204,headers:JSON_HEADERS});if(url.pathname==='/api/health')return safeJson({ok:true,service:'book-studio-cloud-free',storage:'supabase',movieCloud:false,build:'PDF-FIX-V4',time:new Date().toISOString()});if(url.pathname==='/api/calc'&&request.method==='POST'){try{return safeJson({ok:true,calc:calculate(await request.json())})}catch(e){return errorJson(e.message||e)}}if(url.pathname==='/api/storage-notify'&&request.method==='POST')return handleStorageNotify(request,env);return null}
export default {async fetch(request,env){try{const api=await route(request,env);if(api)return api;if(env.ASSETS){const r=await env.ASSETS.fetch(request);const h=new Headers(r.headers);h.set('cache-control','no-store');h.set('x-book-build','PDF-FIX-V4');return new Response(r.body,{status:r.status,statusText:r.statusText,headers:h});}return new Response('Book Studio',{headers:{'content-type':'text/plain; charset=utf-8'}})}catch(e){console.error(e);return errorJson(e.message||'Internal error',500)}}};
