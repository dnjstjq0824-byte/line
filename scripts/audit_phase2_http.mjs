import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const origin = 'http://127.0.0.1:18879', stateFile = '.vscode/phase2-http-state.json';
const mode = process.argv[2] || 'setup', cases = [];
async function api(path, account, method='GET', body, expected=200) {
  const response = await fetch(origin+'/api/v1/'+path,{method,headers:{'Content-Type':'application/json',...(account?{Authorization:'Bearer '+account.access_token}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,expected,`${method} ${path}`);return response.json();
}
function pass(id,purpose,actual) { cases.push({id,purpose,environment:origin,expected:'Documented assertions pass',actual,verdict:'PASS'}); }
let state = mode==='setup'?{accounts:{}}:JSON.parse(fs.readFileSync(stateFile,'utf8'));
try {
 if(mode==='setup') {
  for(const [name,role] of [['userA','user'],['userB','user'],['userC','user'],['admin','admin'],['partnerA','partner'],['partnerB','partner'],['developerA','developer'],['developerB','developer'],['creatorA','creator'],['creatorB','creator'],['adsA','ads'],['adsB','ads']]) {
   const credentials={email:`p2-${name}-${randomUUID()}@example.test`,password:'Audit#'+randomUUID(),display_name:name};
   const user=await api('auth/register',null,'POST',credentials,201);const session=await api('auth/login',null,'POST',credentials);
   state.accounts[name]={...user,...session,credentials,expectedRole:role};
  }
  const sql=Object.values(state.accounts).filter(value=>value.expectedRole!=='user').map(value=>{assert.match(value.id,/^[a-f0-9-]+$/);return `INSERT INTO luno_user_roles (user_id,role,approved_by,approved_at) VALUES ('${value.id}','${value.expectedRole}','isolated test operator','${new Date().toISOString()}');`}).join('\n');
  fs.writeFileSync('.vscode/phase2-local-grants.sql',sql);
  pass('P2-ACCOUNTS','Create independent authenticated local accounts','12 accounts registered and logged in; grants prepared for local operator only');
 } else if(mode==='exercise') {
  for(const account of Object.values(state.accounts)) assert.equal((await api('me',account)).role,account.expectedRole);
  pass('P2-ROLES','Explicit local role assignments','All 12 authenticated accounts report expected DB roles; no auth bypass');
  const {userA:a,userB:b,userC:c}=state.accounts;
  state.direct=await api('conversations',a,'POST',{member_ids:[b.id]},201);
  const duplicate=await api('conversations',b,'POST',{member_ids:[a.id]});assert.equal(duplicate.id,state.direct.id);
  state.first=await api(`conversations/${state.direct.id}/messages`,a,'POST',{body:'Durable HTTP message',client_id:randomUUID()},201);
  await api(`conversations/${state.direct.id}/messages`,c,'GET',undefined,404);
  state.group=await api('conversations',a,'POST',{kind:'group',title:'Durable HTTP group',member_ids:[b.id,c.id]},201);
  await api(`conversations/${state.group.id}`,a,'PATCH',{title:'Updated durable group',owner_id:b.id});
  await api(`conversations/${state.group.id}/members/${c.id}`,b,'DELETE');
  await api(`conversations/${state.group.id}`,c,'GET',undefined,404);
  pass('P2-CONVERSATIONS','Create durable chats, transfer owner and kick member','Direct deduplicates; group metadata changed; kicked member denied');
  state.resources=[];
  for(const [path,field,listKey,owner,other] of [['creator/packs','title','packs',state.accounts.creatorA,state.accounts.creatorB],['ads/campaigns','name','campaigns',state.accounts.adsA,state.accounts.adsB]]) {
   const value=await api(path,owner,'POST',{[field]:'Private local draft'},201);
   assert.equal((await api(path,other))[listKey].some(row=>row.id===value.id),false);
   await api(`${path}/${value.id}`,other,'GET',undefined,403);
   await api(`${path}/${value.id}`,other,'PATCH',{[field]:'intrusion'},403);
   await api(`${path}/${value.id}`,owner,'PATCH',{[field]:'Saved local draft'});
   await api('admin/users',other,'GET',undefined,403);
   state.resources.push({path,field,listKey,id:value.id,ownerName:path.startsWith('creator')?'creatorA':'adsA',otherName:path.startsWith('creator')?'creatorB':'adsB'});
  }
  pass('P1-CREATOR-ADS-HTTP','Two real accounts per console: own edit, cross-owner denial, admin denial','Expected HTTP and list assertions passed');
  await api('auth/logout',a,'POST',{});
  await api('me',a,'GET',undefined,401);
  Object.assign(a,await api('auth/login',null,'POST',a.credentials));
  pass('P2-LOGOUT','Logout and relogin around durable chat','Old session 401, fresh authenticated session obtained');
 } else if(mode==='after-restart') {
  const {userA:a,userB:b,userC:c}=state.accounts;
  const rooms=(await api('conversations',b)).conversations;
  assert.ok(rooms.some(room=>room.id===state.direct.id));
  const history=await api(`conversations/${state.direct.id}/messages`,b);
  assert.ok(history.messages.some(message=>message.id===state.first.message.id));
  const group=await api(`conversations/${state.group.id}`,b);assert.equal(group.title,'Updated durable group');assert.equal(group.owner_id,b.id);
  await api(`conversations/${state.group.id}`,c,'GET',undefined,404);
  for(const resource of state.resources) {
   const value=await api(`${resource.path}/${resource.id}`,state.accounts[resource.ownerName]);assert.equal(value[resource.field],'Saved local draft');
   await api(`${resource.path}/${resource.id}`,state.accounts[resource.otherName],'GET',undefined,403);
  }
  pass('P2-REAL-RESTART','Restore chat/member/message/creator/ad state after actual workerd process restart','All persisted IDs, title, owner, kicked-member denial and drafts retained');
  const delta=await api(`conversations/${state.direct.id}/sync?since_sequence=0`,b);assert.ok(delta.delta_messages.some(message=>message.id===state.first.message.id));
  pass('P2-SYNC','Existing delta pipeline with durable metadata','Original durable message recovered after restart');
 } else if(mode==='long-sync') {
  const {userA:a,userB:b}=state.accounts;
  for(let i=0;i<502;i++) await api(`conversations/${state.direct.id}/messages`,a,'POST',{body:`Durable recovery ${i}`,client_id:`p2-recovery-${i}`},201);
  const first=await api(`conversations/${state.direct.id}/sync?since_sequence=0`,b);
  const second=await api(`conversations/${state.direct.id}/sync?since_sequence=${first.latest_sequence}`,b);
  const all=[...first.delta_messages,...second.delta_messages];
  assert.equal(first.has_more,true);assert.equal(first.delta_messages.length,500);assert.equal(second.has_more,false);
  assert.equal(all.length,503);assert.equal(new Set(all.map(value=>value.id)).size,503);
  assert.deepEqual(all.map(value=>value.sequence),Array.from({length:503},(_,i)=>i+1));
  pass('P2-503-SYNC','Existing 500-item delta paging with persisted conversation metadata','503 unique contiguous messages recovered in two pages after restart');
 } else if(mode==='cross-process') {
  const {userA:a,userB:b}=state.accounts;
  const response=await fetch(`http://127.0.0.1:18880/api/v1/conversations/${state.direct.id}/messages`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+b.access_token},body:JSON.stringify({body:'Second independent Worker process',client_id:randomUUID()})});
  assert.equal(response.status,201);const message=(await response.json()).message;
  const history=await api(`conversations/${state.direct.id}/messages`,a);
  assert.ok(history.messages.some(value=>value.id===message.id));
  pass('P2-CROSS-PROCESS','Two independent local workerd processes share durable metadata/message data','Process on 18880 posts with persisted membership; process on 18879 reads the same message');
 } else throw new Error('Unknown phase');
 fs.writeFileSync(stateFile,JSON.stringify(state));
} catch(error) { cases.push({id:`P2-${mode}-FAIL`,verdict:'FAIL',actual:error.message});throw error; }
finally {
 fs.writeFileSync(`docs/audit-20261105/phase2-http-${mode}.json`,JSON.stringify({measuredAt:new Date().toISOString(),scope:'Local workerd + isolated D1 only; operator DB role grants local only; no production writes',cases},null,2));
 console.log(JSON.stringify({phase:mode,cases:cases.length,pass:cases.filter(value=>value.verdict==='PASS').length,fail:cases.filter(value=>value.verdict==='FAIL').length}));
}
