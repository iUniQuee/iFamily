import fs from 'node:fs';
import { buildRelations } from './src/tree.js';
import { buildFullLayout } from './src/fulltree.js';
const S=JSON.parse(fs.readFileSync('/tmp/S2.json','utf8'));
const cmap=new Map();
for(const l of S.links) if(l.t==='c'){const e=cmap.get(l.c)||{}; if(l.r==='F') e.f=l.p; else e.m=l.p; cmap.set(l.c,e);}
const children=[...cmap.entries()].map(([c,e])=>({child_id:c,father_id:e.f??null,mother_id:e.m??null}));
const unions=S.links.filter(l=>l.t==='s').map(l=>({a_id:l.a,b_id:l.b}));
const rel=buildRelations(children,unions);
const L=buildFullLayout({members:S.members,rel,viewerId:31,openId:31});
const N=new Map(L.nodes.map(n=>[n.id,n]));
const xs=[113,96,98,111].map(i=>N.get(i).x);
console.log('95@'+N.get(95).x,'төв',N.get(95).x+78,'| хүүхдийн төв',(Math.min(...xs)+Math.max(...xs)+156)/2);
console.log('y0:',[48,114,124,95].map(i=>i+'@'+N.get(i).x).join(' | '));
const rows={};for(const n of L.nodes)(rows[n.y]=rows[n.y]||[]).push(n);
let ov=0;for(const y in rows){const a=rows[y].sort((p,q)=>p.x-q.x);for(let i=1;i<a.length;i++) if(a[i].x<a[i-1].x+156) ov++;}
console.log('overlaps',ov);
