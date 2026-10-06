import * as THREE from './vendor/three.module.js';
export const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
export const ease=t=>{t=clamp(t);return t*t*(3-2*t)};
function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c}
function pageLines(){const c=canvas(128,512),x=c.getContext('2d');x.fillStyle='#e8e1ce';x.fillRect(0,0,128,512);for(let y=0;y<512;y+=3){x.fillStyle=y%9===0?'#bdb8a9':'#d8d1c0';x.fillRect(0,y,128,1)}return c}
function fogTexture(){const c=canvas(128,128),x=c.getContext('2d'),im=x.createImageData(128,128);const noise=(a,b)=>{const v=Math.sin(a*127.1+b*311.7)*43758.5453;return v-Math.floor(v)};const smooth=(a,b)=>{const i=Math.floor(a),j=Math.floor(b),u=ease(a-i),v=ease(b-j);return (noise(i,j)*(1-u)+noise(i+1,j)*u)*(1-v)+(noise(i,j+1)*(1-u)+noise(i+1,j+1)*u)*v};for(let y=0;y<128;y++)for(let a=0;a<128;a++){const r=Math.hypot((a-64)/64,(y-64)/64),n=smooth(a/17,y/17)*.55+smooth(a/7,y/7)*.3+smooth(a/3,y/3)*.15;const k=(y*128+a)*4;im.data[k]=im.data[k+1]=im.data[k+2]=210;im.data[k+3]=255*Math.pow(clamp(1-r),1.5)*(.3+.7*n)}x.putImageData(im,0,0);return c}
export class BookScene{
 constructor(target){
  this.renderer=new THREE.WebGLRenderer({canvas:target,antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(1);this.renderer.setClearColor(0x132333);this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.2;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  this.scene=new THREE.Scene();this.scene.fog=new THREE.Fog(0x132333,15,38);this.camera=new THREE.PerspectiveCamera(34,16/9,.1,80);
  this.scene.add(new THREE.HemisphereLight(0xe9f2ff,0x19212a,2.1));const key=new THREE.DirectionalLight(0xffefd4,3.5);key.position.set(-4,7,8);key.castShadow=true;key.shadow.mapSize.set(1024,1024);key.shadow.camera.left=-7;key.shadow.camera.right=7;key.shadow.camera.top=7;key.shadow.camera.bottom=-7;key.shadow.bias=-.001;this.scene.add(key);this.rim=new THREE.DirectionalLight(0x8abce4,3);this.rim.position.set(5,3,-4);this.scene.add(this.rim);
  this.floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:0x152b3d,roughness:.9}));this.floor.rotation.x=-Math.PI/2;this.floor.position.y=-2.03;this.floor.receiveShadow=true;this.scene.add(this.floor);
  this.shelf=new THREE.Group();this.scene.add(this.shelf);this.root=new THREE.Group();this.scene.add(this.root);this.textures=[];this.pageTextures=[];this.lines=this.texture(pageLines());this.smoke=new THREE.Group();this.scene.add(this.smoke);const fog=this.texture(fogTexture());this.fog=fog;for(let i=0;i<30;i++){const m=new THREE.SpriteMaterial({map:fog,color:i%2?0xadc2ce:0x738eab,transparent:true,opacity:.25,depthWrite:false});const s=new THREE.Sprite(m);s.userData.seed=i*1.713;this.smoke.add(s)}this.spec=null;this.sizeKey='';this.signature='';
 }
 texture(source){const t=new THREE.CanvasTexture(source);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());return t}
 clearGroup(g){g.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose()}});g.clear()}
 box(w,h,d,color,parent=this.root,x=0,y=0,z=0,mat){const obj=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat||new THREE.MeshStandardMaterial({color,roughness:.7}));obj.position.set(x,y,z);obj.castShadow=true;obj.receiveShadow=true;parent.add(obj);return obj}
 update(spec,covers){
  this.spec=spec;const W=3.5*spec.width/spec.height,H=3.5,D=Math.max(.02,3.5*spec.thickness/spec.height),key=[W,D,spec.paper].join('|');this.W=W;this.H=H;this.D=D;
  if(key!==this.sizeKey){this.sizeKey=key;this.clearGroup(this.root);this.clearGroup(this.shelf);
   this.box(W,H,.028,0x173438,this.root,0,0,-D/2-.015);
   this.back=new THREE.Mesh(new THREE.PlaneGeometry(W,H),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.75}));this.back.position.z=-D/2-.032;this.back.rotation.y=Math.PI;this.root.add(this.back);
   const pageMat=new THREE.MeshStandardMaterial({map:this.lines,color:spec.paper,roughness:1});this.block=this.box(W-.025,H-.035,D-.008,0xe8e1d1,this.root,-.007,0,0,pageMat);
   this.frontPivot=new THREE.Group();this.frontPivot.position.set(W/2,0,D/2);this.root.add(this.frontPivot);this.box(W,H,.026,0x173438,this.frontPivot,-W/2,0,0);
   this.front=new THREE.Mesh(new THREE.PlaneGeometry(W,H),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.75}));this.front.position.set(-W/2,0,.015);this.frontPivot.add(this.front);
   this.rightPage=new THREE.Mesh(new THREE.PlaneGeometry(W-.022,H-.033),new THREE.MeshStandardMaterial({color:spec.paper,roughness:1}));this.rightPage.position.set(-W/2,0,-.016);this.rightPage.rotation.y=Math.PI;this.frontPivot.add(this.rightPage);
   this.leftPage=new THREE.Mesh(new THREE.PlaneGeometry(W-.03,H-.04),new THREE.MeshStandardMaterial({color:spec.paper,roughness:1}));this.leftPage.position.set(-.007,0,D/2+.0005);this.root.add(this.leftPage);
   this.spine=new THREE.Mesh(new THREE.PlaneGeometry(D+.025,H),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.75}));this.spine.position.x=W/2+.016;this.spine.rotation.y=Math.PI/2;this.root.add(this.spine);
   this.box(8,.15,2.7,0x243643,this.shelf,0,-H/2-.105,-1.6);this.box(8,.16,2.7,0x243643,this.shelf,0,H/2+.32,-1.6);this.box(8,H+.55,.12,0x152634,this.shelf,0,.03,-2.9);for(const x of [-4,4])this.box(.13,H+.6,2.7,0x243643,this.shelf,x,.02,-1.6);
   for(let i=0;i<12;i++){const sign=i<6?-1:1,j=i%6,x=sign*(.65+j*.46),h=2.8+(j%3)*.18;const color=[0x344451,0x233944,0x40565a,0x494b49,0x283747,0x5a5a51][j];this.box(.28+(j%2)*.07,h,1.9,color,this.shelf,x,(h-H)/2,-1.7)}
   this.signature='';this.pageSignature=null;
  }
  if(covers!==this.signature){this.signature=covers;this.textures.forEach(t=>t.dispose());this.textures=['front','back','spine'].map(k=>this.texture(covers[k]));[this.front,this.back,this.spine].forEach((m,i)=>{m.material.map=this.textures[i];m.material.needsUpdate=true})}
  [this.front,this.back,this.spine].forEach(m=>{m.material.roughness=spec.gloss?.26:.82;m.material.metalness=spec.gloss?.07:0});
 }
 setPages(left,right){if(this.pageSignature?.[0]===left&&this.pageSignature?.[1]===right)return;this.pageSignature=[left,right];this.pageTextures.forEach(t=>t.dispose());this.pageTextures=[left,right].map(source=>{const c=canvas(1000,Math.round(1000*this.H/this.W)),x=c.getContext('2d'),scale=Math.min(c.width/source.width,c.height/source.height);x.fillStyle='#ffffff';x.fillRect(0,0,c.width,c.height);x.drawImage(source,(c.width-source.width*scale)/2,(c.height-source.height*scale)/2,source.width*scale,source.height*scale);return this.texture(c)});[this.leftPage,this.rightPage].forEach((m,i)=>{m.material.map=this.pageTextures[i];m.material.color.set(this.spec.paper);m.material.needsUpdate=true})}
 render(state,w,h){
  if(!this.spec)return;if(this.renderer.domElement.width!==w||this.renderer.domElement.height!==h)this.renderer.setSize(w,h,false);
  const open=clamp(state.open||0),pull=clamp(state.pull??1),t=state.time||0;
  this.shelf.visible=Boolean(state.shelf);this.root.visible=state.book!==false;this.floor.visible=true;
  this.root.position.set(-this.W/2*open,0,-1+pull*2);this.root.rotation.set(state.bookPitch||0,(1-pull)*(-Math.PI/2)+(state.bookYaw||0),state.roll||0);this.frontPivot.rotation.y=Math.PI*open;
  const aspect=w/h,fitW=this.W*(1+open),fitH=this.H,tan=Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2));
  const base=Math.max(fitH/(2*tan),fitW/(2*tan*aspect))*1.27;
  const distance=(base+Math.sin(open*Math.PI)*this.W*.95)*(state.zoom||1)*(state.shelf?1.35:1),yaw=state.yaw??-.35,pitch=clamp(state.pitch??.08,-1.25,1.25);
  const focus=new THREE.Vector3(0,.02,-1+pull*2);this.camera.aspect=aspect;this.camera.position.set(focus.x+Math.sin(yaw)*Math.cos(pitch)*distance,focus.y+Math.sin(pitch)*distance,focus.z+Math.cos(yaw)*Math.cos(pitch)*distance);this.camera.lookAt(focus);this.camera.updateProjectionMatrix();
  this.rim.intensity=state.dramatic?4.8:3;this.smoke.visible=(state.smoke||0)>0;this.smoke.children.forEach((s,i)=>{const seed=s.userData.seed,cycle=(t*.08+i/30)%1;s.position.set(Math.sin(seed)*2.4+Math.sin(t*.22+seed)*.45,-1.95+cycle*2.7,1+Math.cos(seed)*1.4);const scale=.9+cycle*2.8;s.scale.set(scale*1.4,scale,1);s.material.opacity=(state.smoke||0)*Math.sin(cycle*Math.PI)*.38;s.material.rotation=Math.sin(seed+t*.08)*.6});
  this.renderer.render(this.scene,this.camera);
 }
 dispose(){this.clearGroup(this.root);this.clearGroup(this.shelf);this.pageTextures.forEach(t=>t.dispose());this.textures.forEach(t=>t.dispose());this.lines.dispose();this.fog.dispose();this.renderer.dispose()}
}
