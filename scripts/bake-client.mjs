import fs from 'node:fs';

const path='public/index.html';
let html=fs.readFileSync(path,'utf8');

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

html=repairEmbeddedSourcesBundle(html);

html=html.replaceAll('PDF-FIX-V4','OPAQUE-CLOUD-V11');
html=html.replaceAll('CLOUD-PROXY-V10','OPAQUE-CLOUD-V11');

if(!html.includes('function sanitizeCloudMeta(')){
  const marker='const cloudFiles={manuscript:null,front:null,wrap:null};';
  if(!html.includes(marker)) throw new Error('cloudFiles marker missing');
  html=html.replace(marker,escapeEmbeddedSourceFragment(CLIENT_SANITIZER));
}

html=html.replaceAll(
  'source:{manuscript:cloudFiles.manuscript,front:cloudFiles.front,wrap:cloudFiles.wrap}',
  'source:{manuscript:sanitizeCloudMeta(cloudFiles.manuscript),front:sanitizeCloudMeta(cloudFiles.front),wrap:sanitizeCloudMeta(cloudFiles.wrap)}'
);

html=html.replaceAll(
  'Object.assign(cloudFiles,state.source||{});',
  'cloudFiles.manuscript=sanitizeCloudMeta(state.source?.manuscript);cloudFiles.front=sanitizeCloudMeta(state.source?.front);cloudFiles.wrap=sanitizeCloudMeta(state.source?.wrap);'
);

const start=html.indexOf('const SUPABASE_URL=');
if(start>=0){
  const end=html.indexOf('async function loadFile',start);
  if(end<=start) throw new Error('legacy upload block end missing');
  html=html.slice(0,start)+escapeEmbeddedSourceFragment(CLIENT_UPLOAD_PATCH)+html.slice(end);
}

html=html.replaceAll('טען כתב יד כדי לקבל עמודים מעובדים מהשרת.','טען כתב יד כדי לשלוח אותו לענן ולהציג תצוגה מעובדת.');
html=html.replaceAll('הדפדפן מציג רק את הפלט שחזר מהענן.','פרטי הקובץ והחישובים חוזרים דרך שירות הענן.');
html=html.replaceAll('העמודים מתקבלים מהשרת לפי הצורך','העמודים מוצגים לאחר העלאה ואימות בענן');

const forbidden=[
  /supabase\.co/i,
  /\bsupabase\b/i,
  /rbqcspltguvrtdrdrjhg/i,
  /SUPABASE_ANON/,
  /SUPABASE_URL/,
  /SUPABASE_BUCKET/,
  /storagePath/,
  /signedUrl/,
  /book-files/
];
for(const re of forbidden){
  if(re.test(html)) throw new Error('Forbidden client marker remains: '+re);
}
if(!html.includes("cloudFetch('/api/files'")) throw new Error('Book Studio cloud upload proxy missing');
if(!html.includes('OPAQUE-CLOUD-V11')) throw new Error('V11 marker missing');
html=repairEmbeddedSourcesBundle(html);

fs.writeFileSync(path,html,'utf8');
console.log('Baked OPAQUE-CLOUD-V11 into '+path);
