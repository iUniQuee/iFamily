import fs from 'node:fs';
import { buildRelations } from './src/tree.js';
import { buildFullLayout } from './src/fulltree.js';
const S=JSON.parse(fs.readFileSync('./st.json','utf8'));
const by=new Map(S.members.map(m=>[m.id,m]));
const cmap=new Map();
for(const l of S.links) if(l.t==='c'){const e=cmap.get(l.c)||{}; if(l.r==='F') e.f=l.p; else e.m=l.p; cmap.set(l.c,e);}
const children=[...cmap.entries()].map(([c,e])=>({child_id:c,father_id:e.f??null,mother_id:e.m??null}));
const unions=S.links.filter(l=>l.t==='s').map(l=>({a_id:l.a,b_id:l.b}));
const rel=buildRelations(children,unions);
const L=buildFullLayout({members:S.members,rel,viewerId:31,openId:31});
const N=new Map(L.nodes.map(n=>[n.id,n]));
const rows={};for(const n of L.nodes)(rows[n.y]=rows[n.y]||[]).push(n);
let ov=0;
for(const y of Object.keys(rows).sort((a,b)=>a-b)){
 const a=rows[y].slice().sort((p,q)=>p.x-q.x);
 for(let i=1;i<a.length;i++) if(a[i].x<a[i-1].x+156) ov++;
 console.log('y'+y, a.map(n=>(by.get(n.id)||{}).name+'@'+n.x).join(' | ').slice(0,300));
}
// шалгах: эцэг/эх хүүхдийнхээ голд эсэх
for (const [uids, kids] of [[[22,23],[24,26,30,34,35]], [[114,124],[33]], [[95],[113,96,98,111]], [[48],[22]]]) {
  const ps=uids.map(i=>N.get(i)).filter(Boolean);
  if(!ps.length) continue;
  const pc=(Math.min(...ps.map(q=>q.x))+Math.max(...ps.map(q=>q.x))+156)/2;
  const ks=kids.map(i=>N.get(i)).filter(Boolean);
  if(!ks.length) continue;
  const kc=(Math.min(...ks.map(q=>q.x))+Math.max(...ks.map(q=>q.x))+156)/2;
  console.log(uids.join('+'), 'эцэг/эх төв', Math.round(pc), 'хүүхдийн төв', Math.round(kc), 'зөрүү', Math.round(pc-kc));
}
console.log('overlaps',ov);
