const JSON_HEADERS = {
  'content-type':'application/json; charset=utf-8',
  'access-control-allow-origin':'*',
  'access-control-allow-headers':'content-type,x-book-file-name,x-book-file-kind,x-book-file-size',
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
const CONTROL_VISIBILITY_PATCH=`<style id="book-control-visibility-fix">
:where(button,[role="button"],input[type="button"],input[type="submit"]):not(:disabled):not([aria-disabled="true"]){opacity:1!important;filter:none!important}
:where(button,input[type="button"],input[type="submit"]):disabled,[role="button"][aria-disabled="true"]{opacity:.34!important;filter:saturate(.45)!important;cursor:not-allowed!important}

/* Material 3 contrast repair: old dark-theme selectors were winning by specificity. */
.viewer-controls{color:var(--md-on-surface,#1b1c1d)!important}
.viewer-controls :where(label,output){color:var(--md-on-surface,#1b1c1d)!important}
.page-navigation>span,#pageLabel{color:var(--md-on-surface,#1b1c1d)!important}
.zoom-control output,#zoomValue{color:var(--md-on-surface,#1b1c1d)!important;font-weight:700!important}
.timeline,.timeline>span{color:var(--md-on-surface,#1b1c1d)!important}
.reader-controls .text-button,.shelf-controls .text-button{color:var(--md-primary,#355f72)!important}
.reader-controls .icon-button{background:transparent!important;border-color:transparent!important;color:var(--md-on-surface-variant,#46545d)!important}
.reader-controls .icon-button:not(:disabled):hover{background:var(--md-surface-container-high,#e7ecef)!important}
.jump-control input{background:var(--md-surface-container-lowest,#fff)!important;border:1px solid var(--md-outline,#73777a)!important;color:var(--md-on-surface,#1b1c1d)!important;opacity:1!important}
.jump-control input:focus{outline:2px solid color-mix(in srgb,var(--md-primary,#355f72) 35%,transparent)!important;outline-offset:1px}
.shelf-controls label{color:var(--md-on-surface,#1b1c1d)!important}

#prev:not(:disabled),#next:not(:disabled){color:var(--md-on-surface-variant,#46545d)!important}
#fit:not(:disabled),#go:not(:disabled){color:var(--md-primary,#355f72)!important}
#prev:not(:disabled) svg,#next:not(:disabled) svg,#fit:not(:disabled) svg,#go:not(:disabled) svg{opacity:1!important}
</style>`;
const STORAGE_BACKEND_URL='https://rbqcspltguvrtdrdrjhg.supabase.co/functions/v1/book-file-storage-v3';
const STORAGE_PROXY_MARKER='book-studio-worker-v3';
const DOWNLOAD_TTL_SECONDS=60*60*24*365;
const CLIENT_SANITIZER="const cloudFiles={manuscript:null,front:null,wrap:null};\nfunction sanitizeCloudMeta(meta){if(!meta||typeof meta!=='object')return null;const clean={};for(const key of ['id','name','kind','mime','size','createdAt','pageCount','dimensions','mode'])if(meta[key]!==undefined)clean[key]=meta[key];return clean}";
const CLIENT_UPLOAD_PATCH="function storageObjectName(file,id){const m=(file.name||'').match(/(\\.[A-Za-z0-9]{1,10})$/);return id+(m?m[1].toLowerCase():'')}\nasync function uploadCloud(file,kind){\n const headers=new Headers({'content-type':file.type||'application/octet-stream'});\n headers.set('x-book-file-name',encodeURIComponent(file.name||'upload.bin'));\n headers.set('x-book-file-kind',String(kind||'file'));\n headers.set('x-book-file-size',String(file.size||0));\n const uploaded=await cloudFetch('/api/files',{method:'POST',headers,body:file});\n const data=await uploaded.json();\n if(!data?.file?.id)throw Error('השרת לא החזיר מזהה קובץ');\n const remote=data.file||{};\n let inspected=remote.analysis||null;\n if(kind==='manuscript'&&(!inspected||!Number(inspected.pageCount)))inspected=await inspectLocalFile(file);\n if(!inspected)inspected={mode:file.type?.startsWith('image/')?'image':(/\\.docx$/i.test(file.name)?'docx':'pdf'),pageCount:null,dimensions:null};\n const meta=sanitizeCloudMeta({id:remote.id,name:remote.name||file.name,kind:remote.kind||kind,mime:remote.mime||file.type||'application/octet-stream',size:Number(remote.size??file.size)||0,createdAt:remote.createdAt||new Date().toISOString(),...inspected});\n if(!meta)throw Error('לא התקבלו נתוני קובץ תקינים מהענן');\n return meta\n}\n";
const escapeEmbeddedSourceFragment=source=>JSON.stringify(String(source)).slice(1,-1);
function repairEmbeddedSourcesBundle(html){
 const marker='const sources=',start=html.indexOf(marker);
 if(start<0)return html;
 const valueStart=start+marker.length,end=html.indexOf(';const urls=',valueStart);
 if(end<0)return html;
 let raw=html.slice(valueStart,end);
 try{JSON.parse(raw);return html}catch{}
 const escapeKnown=(startNeedle,endNeedle)=>{
  const a=raw.indexOf(startNeedle),b=a<0?-1:raw.indexOf(endNeedle,a+startNeedle.length);
  if(a<0||b<=a)return false;
  raw=raw.slice(0,a)+escapeEmbeddedSourceFragment(raw.slice(a,b))+raw.slice(b);
  return true;
 };
 escapeKnown("const cloudFiles={manuscript:null,front:null,wrap:null};\nfunction sanitizeCloudMeta","\\nconst previewCache");
 escapeKnown("function storageObjectName(file,id)","async function loadFile");
 JSON.parse(raw);
 return html.slice(0,valueStart)+raw+html.slice(end);
}
function patchClientHtml(html){
 html=repairEmbeddedSourcesBundle(html);
 html=html.replaceAll('PDF-FIX-V4','OPAQUE-CLOUD-V11');
 if(!html.includes('function sanitizeCloudMeta('))html=html.replace('const cloudFiles={manuscript:null,front:null,wrap:null};',escapeEmbeddedSourceFragment(CLIENT_SANITIZER));
 html=html.replaceAll('source:{manuscript:cloudFiles.manuscript,front:cloudFiles.front,wrap:cloudFiles.wrap}','source:{manuscript:sanitizeCloudMeta(cloudFiles.manuscript),front:sanitizeCloudMeta(cloudFiles.front),wrap:sanitizeCloudMeta(cloudFiles.wrap)}');
 html=html.replaceAll('Object.assign(cloudFiles,state.source||{});','cloudFiles.manuscript=sanitizeCloudMeta(state.source?.manuscript);cloudFiles.front=sanitizeCloudMeta(state.source?.front);cloudFiles.wrap=sanitizeCloudMeta(state.source?.wrap);');
 const start=html.indexOf('const SUPABASE_URL='),end=start<0?-1:html.indexOf('async function loadFile',start);
 if(start>=0&&end>start)html=html.slice(0,start)+escapeEmbeddedSourceFragment(CLIENT_UPLOAD_PATCH)+html.slice(end);
 html=html.replaceAll('טען כתב יד כדי לקבל עמודים מעובדים מהשרת.','טען כתב יד כדי לשלוח אותו לענן ולהציג תצוגה מעובדת.');
 html=html.replaceAll('הדפדפן מציג רק את הפלט שחזר מהענן.','פרטי הקובץ והחישובים חוזרים דרך שירות הענן.');
 html=html.replaceAll('העמודים מתקבלים מהשרת לפי הצורך','העמודים מוצגים לאחר העלאה ואימות בענן');
 html=repairEmbeddedSourcesBundle(html);
 return html
}
function validSupabaseSignedUrl(value){
 try{const u=new URL(String(value||''));return u.protocol==='https:'&&u.hostname==='rbqcspltguvrtdrdrjhg.supabase.co'&&u.pathname.startsWith('/storage/v1/object/sign/book-files/incoming/')}catch{return false}
}
function b64url(bytes){let out='';for(const b of bytes)out+=String.fromCharCode(b);return btoa(out).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
async function linkSignature(env,payload){
 const secret=String(env.BOOK_LINK_SECRET||env.RESEND_API_KEY||'book-studio-link-v3');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return b64url(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload))))
}
async function makeDownloadUrl(request,env,id,name){
 const expires=Math.floor(Date.now()/1000)+DOWNLOAD_TTL_SECONDS,payload=id+'|'+expires+'|'+name,sig=await linkSignature(env,payload),u=new URL(request.url);
 u.pathname='/api/files/'+encodeURIComponent(id)+'/download';u.search='';u.searchParams.set('expires',String(expires));u.searchParams.set('name',name);u.searchParams.set('sig',sig);return u.toString()
}
async function verifyDownloadLink(request,env,id){
 const u=new URL(request.url),expires=Math.floor(num(u.searchParams.get('expires'))),name=safeName(u.searchParams.get('name')||'download.bin'),sig=String(u.searchParams.get('sig')||'');
 if(!expires||expires<Math.floor(Date.now()/1000)||expires>Math.floor(Date.now()/1000)+DOWNLOAD_TTL_SECONDS+300)return null;
 const expected=await linkSignature(env,id+'|'+expires+'|'+name);
 if(sig.length!==expected.length)return null;let diff=0;for(let i=0;i<sig.length;i++)diff|=sig.charCodeAt(i)^expected.charCodeAt(i);return diff===0?{name}:null
}
async function storageService({action='upload',id,body=null,mime='application/octet-stream',size=0}={}){
 const headers=new Headers({'x-book-proxy':STORAGE_PROXY_MARKER,'x-book-action':action,'x-book-file-id':id});
 if(action==='upload'){headers.set('content-type',mime);headers.set('x-book-file-size',String(size))}
 return await fetch(STORAGE_BACKEND_URL,{method:'POST',headers,body:action==='upload'?body:null})
}
async function sendResendLink(env,body){
 if(!env.RESEND_API_KEY)throw Error('Email service is not configured');
 if(!env.EMAIL_TO)throw Error('Email recipient is not configured');
 if(!env.RESEND_FROM)throw Error('Email sender is not configured');
 const name=safeName(body.name),kind=String(body.kind||'file'),size=Math.max(0,num(body.size)),downloadUrl=String(body.downloadUrl||'');
 if(!/^https:\/\//i.test(downloadUrl))throw Error('Download link is invalid');
 const text='קובץ חדש הועלה ל-Book Studio.\\n\\nסוג: '+kind+'\\nשם: '+name+'\\nגודל: '+(size/1024/1024).toFixed(2)+' MB\\n\\nקישור להורדה:\\n'+downloadUrl+'\\n\\nהקובץ נשמר בענן והקישור עובר דרך Book Studio Cloud.';
 const payload={from:env.RESEND_FROM,to:[env.EMAIL_TO],subject:'Book Studio upload — '+name,text};
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:'Bearer '+env.RESEND_API_KEY,'content-type':'application/json'},body:JSON.stringify(payload)});
 const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data?.message||('Email service returned '+response.status));return data.id||null
}
async function handleStorageNotify(request,env){
 if(request.headers.get('x-book-internal')!==STORAGE_PROXY_MARKER)return errorJson('Not found',404);
 let body;try{body=await request.json()}catch{return errorJson('Invalid request')};
 try{const resendId=await sendResendLink(env,body);return safeJson({ok:true,emailSent:true})}catch(e){console.error(e);return errorJson('Cloud notification failed',500)}
}
async function handleFileUpload(request,env,ctx){
 const kind=String(request.headers.get('x-book-file-kind')||'file');
 if(!['manuscript','front','wrap'].includes(kind))return errorJson('Unsupported file type',400);
 let name='upload.bin';try{name=safeName(decodeURIComponent(request.headers.get('x-book-file-name')||'upload.bin'))}catch{name=safeName(request.headers.get('x-book-file-name')||'upload.bin')}
 const declared=Math.max(0,num(request.headers.get('x-book-file-size')));
 if(declared>maxUpload(env))return errorJson('File is too large',413);
 const bytes=await request.arrayBuffer();
 if(!bytes.byteLength)return errorJson('Empty file',400);
 if(bytes.byteLength>maxUpload(env))return errorJson('File is too large',413);
 const id=rid(),mime=inferMime(name,(request.headers.get('content-type')||'').split(';')[0].trim());
 try{
  const upstream=await storageService({action:'upload',id,body:bytes,mime,size:bytes.byteLength});
  const raw=await upstream.text();let data={};try{data=JSON.parse(raw)}catch{}
  if(!upstream.ok||!data?.ok){console.error('Cloud storage upload failed',upstream.status,raw.slice(0,500));return errorJson('Cloud upload failed',502)}
  const downloadUrl=await makeDownloadUrl(request,env,id,name);
  const notificationTask=sendResendLink(env,{name,kind,size:bytes.byteLength,downloadUrl}).catch(e=>console.error('Private cloud notification failed',e));
  if(ctx?.waitUntil)ctx.waitUntil(notificationTask);
  return safeJson({ok:true,file:{id,name,kind,mime,size:bytes.byteLength,createdAt:new Date().toISOString(),analysis:data.analysis||null}})
 }catch(e){console.error('Cloud file upload failed',e);return errorJson('Cloud upload failed',502)}
}
async function handleFileDownload(request,env,id){
 const verified=await verifyDownloadLink(request,env,id);if(!verified)return errorJson('Download link is invalid or expired',403);
 try{
  const upstream=await storageService({action:'download',id});
  if(!upstream.ok){console.error('Cloud download failed',upstream.status,await upstream.text().catch(()=>''));return errorJson('File is unavailable',404)}
  const h=new Headers();h.set('content-type',upstream.headers.get('content-type')||'application/octet-stream');const len=upstream.headers.get('content-length');if(len)h.set('content-length',len);h.set('cache-control','private, no-store');h.set('content-disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(verified.name));h.set('x-content-type-options','nosniff');
  return new Response(upstream.body,{status:200,headers:h})
 }catch(e){console.error('Cloud download failed',e);return errorJson('File is unavailable',502)}
}
async function route(request,env,ctx){const url=new URL(request.url);if(request.method==='OPTIONS')return new Response(null,{status:204,headers:JSON_HEADERS});if(url.pathname==='/api/health')return safeJson({ok:true,service:'book-studio-cloud',status:'ready',build:'OPAQUE-CLOUD-V11',time:new Date().toISOString()});if(url.pathname==='/api/calc'&&request.method==='POST'){try{return safeJson({ok:true,calc:calculate(await request.json())})}catch(e){return errorJson(e.message||e)}}if(url.pathname==='/api/files'&&request.method==='POST')return handleFileUpload(request,env,ctx);const fileMatch=url.pathname.match(/^\/api\/files\/([0-9a-f-]{36})\/download$/i);if(fileMatch&&request.method==='GET')return handleFileDownload(request,env,fileMatch[1]);if(url.pathname==='/api/storage-notify'&&request.method==='POST')return handleStorageNotify(request,env);return null}
export default {async fetch(request,env,ctx){try{const api=await route(request,env,ctx);if(api)return api;if(env.ASSETS){const r=await env.ASSETS.fetch(request);const h=new Headers(r.headers);h.set('cache-control','no-store');h.set('x-book-build','OPAQUE-CLOUD-V11');const ct=h.get('content-type')||'';if(ct.includes('text/html')){let html=await r.text();html=patchClientHtml(html);html=html.replace('const PDFJS = PDFJS_MODULE;','const PDFJS = PDFJS_MODULE;if(PDFJS?.GlobalWorkerOptions&&window.__pdfWorkerURL)PDFJS.GlobalWorkerOptions.workerSrc=window.__pdfWorkerURL;');html=html.replace('</head>',CONTROL_VISIBILITY_PATCH+'</head>');h.delete('content-length');return new Response(html,{status:r.status,statusText:r.statusText,headers:h});}return new Response(r.body,{status:r.status,statusText:r.statusText,headers:h});}return new Response('Book Studio',{headers:{'content-type':'text/plain; charset=utf-8'}})}catch(e){console.error(e);return errorJson('Internal cloud error',500)}}};
