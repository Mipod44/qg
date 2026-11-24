import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc, getDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig, SUPER_ADMIN } from "./config.js";
import { SEED } from "./seed.js";

const CATS=["U9F","U9M","U11F1","U11F2","U11M1","U11M2","U13F","U13F2","U13M","U15F","U15M","U18F1","U18F2","U18M","Seniors F1","Seniors M"];
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const show=(id,on)=>$(id).classList.toggle("hide",!on);
const toast=t=>{const el=$("toast");el.textContent=t;el.style.display="block";clearTimeout(toast.h);toast.h=setTimeout(()=>el.style.display="none",3000)};
const setStatus=t=>$("status").textContent=t;

if(firebaseConfig.apiKey==="A_REMPLIR"){setStatus("configuration Firebase manquante (config.js)");throw new Error("config.js à remplir")}
const fb=initializeApp(firebaseConfig);const auth=getAuth(fb);const db=getFirestore(fb);

const S={conv:[],matches:[],msgs:[],events:[],tasks:[],meetings:[],duties:[],members:[],people:[],pmap:{},me:null,table:null,cat:"Seniors M",user:null,role:null};
const unsubs=[];
const JOURS=["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"],MOIS=["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
const dayLabel=d=>{const x=new Date(d+"T12:00");return isNaN(x)?d:JOURS[x.getDay()]+" "+x.getDate()+" "+MOIS[x.getMonth()]};
const today=new Date().toISOString().slice(0,10);
const tmin=t=>{const m=String(t||"").match(/(\d+)h(\d*)/);return m?(+m[1])*60+(+m[2]||0):9999};
const isAdmin=()=>S.role==="admin";
const isPlayer=()=>S.role==="player";
async function safe(p){try{return await p}catch(e){console.error(e);toast(e.code==="permission-denied"?"Action non autorisée":"Échec de l'enregistrement, réessayez");return false}}

/* ---------- Connexion ---------- */
$("gBtn").onclick=()=>signInWithPopup(auth,new GoogleAuthProvider()).catch(e=>toast("Connexion Google impossible : "+(e.code||"")));
$("mailForm").onsubmit=async e=>{e.preventDefault();const m=$("mail").value.trim();
  try{await sendSignInLinkToEmail(auth,m,{url:location.origin+location.pathname,handleCodeInApp:true});localStorage.setItem("asmMail",m);toast("Lien envoyé à "+m+". Ouvrez-le sur cet appareil.")}catch(err){toast("Envoi impossible : "+(err.code||""))}};
async function finishEmailLink(m){try{await signInWithEmailLink(auth,m,location.href);localStorage.removeItem("asmMail");history.replaceState(null,"",location.pathname)}catch(err){toast("Lien invalide ou expiré")}}
if(isSignInWithEmailLink(auth,location.href)){const m=localStorage.getItem("asmMail");if(m)finishEmailLink(m);else{show("gConfirm",true);$("confForm").onsubmit=e=>{e.preventDefault();show("gConfirm",false);finishEmailLink($("confMail").value.trim())}}}
$("logout").onclick=$("logout2").onclick=()=>signOut(auth);

onAuthStateChanged(auth,async u=>{
  unsubs.splice(0).forEach(f=>f());S.user=u;S.role=null;
  show("app",false);show("gWait",false);show("who",!!u);
  if(!u){show("gLogin",true);setStatus("connexion requise");return}
  show("gLogin",false);$("whoName").textContent=u.displayName||u.email;
  const ref=doc(db,"members",u.uid);
  let snap=await getDoc(ref).catch(()=>null);
  const sup=u.email===SUPER_ADMIN;
  if(!snap||!snap.exists())await safe(setDoc(ref,{email:u.email,name:u.displayName||"",role:sup?"admin":"pending",at:Date.now()}));
  else if(sup&&snap.data().role!=="admin")await safe(updateDoc(ref,{role:"admin"}));
  let started=false;
  unsubs.push(onSnapshot(ref,d=>{const prev=S.role;S.me=d.exists()?d.data():null;S.role=S.me?S.me.role:"pending";const ok=["admin","staff","player"].includes(S.role);
    show("gWait",!ok);show("app",ok);document.body.classList.toggle("player",isPlayer());
    if(!ok){setStatus("accès en attente de validation");return}
    if(started&&prev!==S.role){location.reload();return}
    ["echanges","taches"].forEach(v=>document.querySelector(`nav a[data-v=${v}]`).classList.toggle("hide",isPlayer()));
    show("navMembres",isAdmin());route();loadMe();if(!started){started=true;start()}},()=>{show("gWait",true)}));
});

/* ---------- Données en direct ---------- */
function start(){
  setStatus("chargement…");
  const live=(name,key,after)=>unsubs.push(onSnapshot(collection(db,name),s=>{S[key]=s.docs.map(d=>({id:d.id,...d.data()}));setStatus("à jour, en direct");after()},e=>{console.error(e);setStatus("connexion perdue, rechargez la page")}));
  live("conv","conv",()=>{renderConv();renderTally();renderProfile()});
  live("matches","matches",()=>{renderMatches();renderTally();renderWeek();renderProfile()});
  live("events","events",()=>{renderEvents();renderWeek();renderProfile()});
  live("duties","duties",()=>{renderDuties();renderWeek();renderProfile()});
  if(!isPlayer()){
    live("msgs","msgs",()=>{renderCats();renderMsgs()});
    live("tasks","tasks",()=>{renderTasks();renderWeek()});
    live("meetings","meetings",()=>{renderMeetings();renderWeek();renderProfile()});
    live("people","people",()=>{S.pmap=Object.fromEntries(S.people.map(p=>[p.id,p]));$("peopleList").innerHTML=S.people.map(p=>`<option value="${esc(p.prenom+" "+p.nom+" · "+p.id)}">`).join("");loadMe();if(isAdmin())renderMembers()});
  }
  unsubs.push(onSnapshot(doc(db,"meta","classement"),d=>{S.table=d.exists()?d.data():null;renderMatches()},()=>{}));
  if(isAdmin())live("members","members",renderMembers);
}
/* ---------- Mon profil ---------- */
const initials=s=>String(s||"?").split(/[\s.@-]+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join("");
async function loadMe(){
  const pid=S.me&&S.me.person;let p=pid?S.pmap[pid]:null;
  if(pid&&!p){try{const d=await getDoc(doc(db,"people",pid));if(d.exists()){p={id:d.id,...d.data()};S.pmap[pid]=p}}catch{}}
  S.person=p||null;
  const name=p?p.prenom+" "+p.nom:(S.user.displayName||S.user.email);
  $("whoName").textContent=name;$("meLic").textContent=p?"Licence "+p.licence:(isAdmin()?"Licence à relier dans Membres":"");
  $("meAv").textContent=initials(p?p.prenom+" "+p.nom:name);renderProfile();
}
function myTeams(){const p=S.person;return p?[...new Set([...(p.equipes||[]),...(p.coach||[])])]:[]}
function mentions(x){const p=S.person;if(!p)return false;const t=norm([x.match,x.arb,x.table,x.resp].join(" "));const pr=norm(p.prenom.split(" ")[0]),nm=norm(p.nom);return t.includes(pr+" "+nm)||t.includes(nm+" "+pr)}
function renderProfile(){
  if($("prof").classList.contains("hide"))return;
  const p=S.person;const name=$("whoName").textContent;
  $("profAv").textContent=$("meAv").textContent;$("profName").textContent=name;
  const teams=myTeams();
  $("profMeta").textContent=p?["Licence "+p.licence,(p.equipes||[]).length?"Joue en "+p.equipes.join(", "):"",(p.coach||[]).length?"Coach "+p.coach.join(", "):""].filter(Boolean).join(" · "):"Compte pas encore relié à un licencié : demandez à un admin.";
  const ms=S.matches.filter(m=>m.date>=today&&teams.includes(m.team)).sort((a,b)=>a.date.localeCompare(b.date)||tmin(a.time)-tmin(b.time));
  $("profMatches").innerHTML=ms.length?ms.map(m=>{const c=S.conv.find(x=>x.date===m.date&&x.team===m.team);const coach=p&&(p.coach||[]).includes(m.team);
    return`<div class="pl"><div class="when">${esc(dayLabel(m.date))}<span>${esc(m.time||"")}</span></div><div><b>${esc(m.team)}${coach?" (coach)":""}</b> ${m.home?"reçoit":"chez"} ${esc(m.opp)}<p class="note">${c?(c.home?"Convocation "+esc(c.conv)+" à la salle":"Départ "+esc(c.conv)+" du parking"+(c.place?" · "+esc(c.place):"")):(m.home?"À domicile":"À l'extérieur")}</p></div></div>`}).join(""):`<div class="empty">${p?"Aucun match à venir pour vos équipes.":"Reliez votre compte à votre licence pour voir vos matchs."}</div>`;
  const du=S.duties.filter(x=>x.date>=today&&mentions(x)).sort((a,b)=>a.date.localeCompare(b.date)||tmin(a.time)-tmin(b.time));
  $("profDuties").innerHTML=du.length?du.map(x=>{const pr=norm(S.person.prenom.split(" ")[0]);const role=[["arb","Arbitrage"],["table","Table de marque"],["resp","Responsable de salle"]].filter(([k])=>norm(x[k]).includes(pr)).map(r=>r[1]).join(", ")||"Tour de salle";
    return`<div class="pl"><div class="when">${esc(dayLabel(x.date))}<span>${esc(x.time||"")}</span></div><div><b>${esc(role)}</b><p class="note">${esc(x.match||"")}</p></div></div>`}).join(""):`<div class="empty">Aucun tour de salle à votre nom.</div>`;
  const ev=[...S.events.filter(v=>v.date>=today).map(v=>({date:v.date,t:v.title,s:v.place||""})),...(isPlayer()?[]:S.meetings.filter(m=>m.date>=today).map(m=>({date:m.date,t:m.body,s:[m.time,m.place].filter(Boolean).join(" · ")})))].sort((a,b)=>a.date.localeCompare(b.date)).slice(0,8);
  $("profEvents").innerHTML=ev.length?ev.map(v=>`<div class="pl"><div class="when">${esc(dayLabel(v.date))}</div><div><b>${esc(v.t)}</b><p class="note">${esc(v.s)}</p></div></div>`).join(""):'<div class="empty">Rien de prévu pour le moment.</div>';
}
$("meBtn").onclick=()=>{show("prof",true);renderProfile();$("profClose").focus()};
$("profClose").onclick=()=>show("prof",false);
$("prof").onclick=e=>{if(e.target.id==="prof")show("prof",false)};
addEventListener("keydown",e=>{if(e.key==="Escape")show("prof",false)});
window.asmImportPeople=async list=>{if(!isAdmin())return"admin requis";for(let i=0;i<list.length;i+=400){const b=writeBatch(db);list.slice(i,i+400).forEach(p=>{const{licence,...rest}=p;b.set(doc(db,"people",licence),{licence,...rest})});await b.commit()}return list.length+" licenciés importés"};
async function importSeed(){const b=writeBatch(db);for(const [col,docs] of Object.entries(SEED))for(const [id,data] of Object.entries(docs))b.set(doc(db,col,id),data);
  if(await safe(b.commit())!==false)toast("Données de départ importées")}

/* ---------- Navigation ---------- */
const VIEWS=["convocations","matchs","echanges","evenements","taches","salle","membres"];
function route(){let v=location.hash.slice(1);if(!VIEWS.includes(v)||(v==="membres"&&!isAdmin())||(isPlayer()&&["echanges","taches"].includes(v)))v="convocations";
  VIEWS.forEach(x=>show("v-"+x,x===v));document.querySelectorAll("nav a").forEach(a=>a.classList.toggle("on",a.dataset.v===v))}
addEventListener("hashchange",route);

$("fTeam").innerHTML='<option value="">Toutes les équipes</option>'+CATS.map(c=>`<option>${c}</option>`).join("");
$("c_team").innerHTML=CATS.map(c=>`<option>${c}</option>`).join("");
$("fTeam").onchange=()=>renderConv();

function renderTally(){
  const up=S.conv.filter(c=>c.date>=today);const dom=up.filter(c=>c.home).length;
  const live=S.matches.filter(m=>m.status==="live").length;
  const fin=S.matches.filter(m=>m.status==="fin"&&m.us!=null&&m.them!=null);const win=fin.filter(m=>m.us>m.them).length;
  const it=(n,t,sub,c)=>`<div class="st ${c||""}"><b>${n}</b><span>${t}<small>${sub}</small></span></div>`;
  $("tally").innerHTML=it(up.length,"Convocations","à venir")+it(dom,"Domicile","salle de La Madeleine")+it(up.length-dom,"Extérieur","départ du parking")+it(live,"En direct",live?"matchs en cours":"aucun match en cours",live?"live":"")+it(fin.length?win+"/"+fin.length:"–","Victoires","matchs terminés");
}

/* ---------- Convocations ---------- */
const convText=c=>c.home?`${c.team} : convocation ${c.conv} à la salle de La Madeleine, match à ${c.match} contre ${c.opp}.`:`${c.team} : départ ${c.conv} du parking de la salle de La Madeleine, match à ${c.match} contre ${c.opp}${c.place?" ("+c.place+")":""}.`;
function renderConv(){
  const f=$("fTeam").value;const list=S.conv.filter(c=>!f||c.team===f).sort((a,b)=>a.date.localeCompare(b.date)||tmin(a.conv)-tmin(b.conv));
  if(!list.length){$("convList").innerHTML='<div class="empty">Aucune convocation pour l\'instant.'+(isAdmin()&&!S.conv.length?'<br><br><button class="pri" id="seedBtn">Importer les données de départ (week-end du 28-29/11)</button>':'')+'</div>';const sb=$("seedBtn");if(sb)sb.onclick=importSeed;return}
  let out="",d="";
  for(const c of list){if(c.date!==d){d=c.date;out+=`<div class="day">${esc(dayLabel(d))}</div>`}
    out+=`<div class="conv ${c.home?"dom":""}"><div class="t">${esc(c.conv)}</div><div class="eq">${esc(c.team)}</div>
    <div class="m"><div><span class="tag ${c.home?"dom":""}">${c.home?"Domicile":"Extérieur"}</span> Match ${esc(c.match)} · ${esc(c.opp)}</div>${c.place?`<div class="where">${esc(c.place)}</div>`:""}</div>
    <div class="acts"><button class="sm" data-copy="${esc(c.id)}">Copier le message</button><button class="sm x" data-delc="${esc(c.id)}">Suppr.</button></div></div>`}
  $("convList").innerHTML=out;
}
$("convList").onclick=async e=>{const b=e.target.closest("button");if(!b)return;
  if(b.dataset.copy){const c=S.conv.find(x=>x.id===b.dataset.copy);try{await navigator.clipboard.writeText(convText(c));b.textContent="Copié"}catch{b.textContent="Copie refusée"}setTimeout(()=>b.textContent="Copier le message",1600)}
  if(b.dataset.delc){b.disabled=true;await safe(deleteDoc(doc(db,"conv",b.dataset.delc)))}};
$("convForm").onsubmit=async e=>{e.preventDefault();
  const c={date:$("c_date").value,team:$("c_team").value,conv:$("c_conv").value.trim(),match:$("c_match").value.trim(),opp:$("c_opp").value.trim(),home:$("c_home").value==="1",place:$("c_place").value.trim()};
  if(await safe(addDoc(collection(db,"conv"),c))!==false){await safe(addDoc(collection(db,"matches"),{date:c.date,team:c.team,opp:c.opp,home:c.home,time:c.match,us:null,them:null,status:"avenir"}));e.target.reset()}};

/* ---------- Matchs ---------- */
function renderMatches(){
  const list=[...S.matches].sort((a,b)=>a.date.localeCompare(b.date)||tmin(a.time)-tmin(b.time));
  if(!list.length)$("matchList").innerHTML='<div class="empty">Aucun match enregistré.</div>';else{
  let out="",d="";
  for(const m of list){if(m.date!==d){d=m.date;out+=`<div class="day">${esc(dayLabel(d))}</div>`}
    const st=m.status==="live"?'<span class="tag live">En direct</span>':m.status==="fin"?'<span class="tag fin">Terminé</span>':`<span class="tag plain">${esc(m.time||"")}</span>`;
    const res=m.status==="fin"&&m.us!=null&&m.them!=null?(m.us>m.them?" · Victoire":" · Défaite"):"";
    out+=`<div class="match"><div><div class="eq">${esc(m.team)} <span>${m.home?"reçoit":"chez"} ${esc(m.opp)}</span></div><div>${st}<span class="note">${res}</span></div></div>
    <div class="score" data-m="${esc(m.id)}"><input type="number" min="0" inputmode="numeric" aria-label="Score ASM" data-f="us" value="${m.us??""}"><b>–</b><input type="number" min="0" inputmode="numeric" aria-label="Score adversaire" data-f="them" value="${m.them??""}">
      <select data-f="status" aria-label="Statut"><option value="avenir"${m.status==="avenir"?" selected":""}>À venir</option><option value="live"${m.status==="live"?" selected":""}>En direct</option><option value="fin"${m.status==="fin"?" selected":""}>Terminé</option></select></div></div>`}
  $("matchList").innerHTML=out}
  const t=S.table;
  $("standings").innerHTML=t?`<h3>${esc(t.title)}</h3><table><thead><tr><th>#</th><th>Équipe</th><th class="n">Pts</th><th class="n">V-D</th></tr></thead><tbody>${(t.rows||[]).map((r,i)=>`<tr class="${/madeleine/i.test(r.eq)?"us":""}"><td>${i+1}</td><td>${esc(r.eq)}</td><td class="n">${esc(r.pts)}</td><td class="n">${esc(r.v)}-${esc(r.d)}</td></tr>`).join("")}</tbody></table>${t.note?`<p class="note">${esc(t.note)}</p>`:""}`:'<h3>Classement</h3><p class="note">Pas encore de classement saisi.</p>';
}
$("matchList").onchange=async e=>{const el=e.target;const box=el.closest("[data-m]");if(!box)return;
  const f=el.dataset.f;let v=el.value;if(f!=="status")v=v===""?null:Math.max(0,parseInt(v,10)||0);
  await safe(updateDoc(doc(db,"matches",box.dataset.m),{[f]:v}))};

/* ---------- Échanges ---------- */
function renderCats(){const n={};S.msgs.forEach(m=>n[m.cat]=(n[m.cat]||0)+1);
  $("cats").innerHTML=CATS.map(c=>`<button type="button" class="${c===S.cat?"on":""}" data-cat="${c}">${c}${n[c]?`<i>${n[c]}</i>`:""}</button>`).join("");$("msgCat").textContent=S.cat}
$("cats").onclick=e=>{const b=e.target.closest("[data-cat]");if(!b)return;S.cat=b.dataset.cat;renderCats();renderMsgs()};
function renderMsgs(){
  const list=S.msgs.filter(m=>m.cat===S.cat).sort((a,b)=>a.ts-b.ts);
  if(!list.length){$("msgList").innerHTML=`<div class="empty">Pas encore d'échange pour ${esc(S.cat)}.</div>`;return}
  $("msgList").innerHTML=list.map(m=>{const dt=new Date(m.ts);return`<div class="msg ${S.user&&m.author===S.user.uid?"me":""}"><small>${esc(m.who||"Membre du club")} · ${dt.toLocaleDateString("fr-FR",{day:"numeric",month:"short"})} ${dt.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</small><p>${esc(m.text)}</p></div>`}).join("");
}
$("msgForm").onsubmit=async e=>{e.preventDefault();const t=$("m_text").value.trim();if(!t)return;
  if(await safe(addDoc(collection(db,"msgs"),{cat:S.cat,text:t,author:S.user.uid,who:S.user.displayName||S.user.email,ts:Date.now()}))!==false)$("m_text").value=""};

/* ---------- Événements ---------- */
function renderEvents(){
  const list=[...S.events].sort((a,b)=>a.date.localeCompare(b.date));
  if(!list.length){$("evList").innerHTML='<div class="empty">Aucun événement au planning. Ajoutez le prochain tournoi ou plateau ci-dessous.</div>';return}
  $("evList").innerHTML=list.map(v=>{const x=new Date(v.date+"T12:00");return`<div class="ev" style="${v.date<today?"opacity:.55":""}"><div class="d">${x.getDate()}<span>${MOIS[x.getMonth()]}</span></div><div><h3>${esc(v.title)}</h3><div class="note">${[v.place,v.owner&&("Responsable : "+v.owner)].filter(Boolean).map(esc).join(" · ")}</div>${v.notes?`<p style="margin:6px 0 0">${esc(v.notes)}</p>`:""}</div><button class="sm x" data-dele="${esc(v.id)}">Suppr.</button></div>`}).join("")}
$("evList").onclick=async e=>{const b=e.target.closest("[data-dele]");if(b){b.disabled=true;await safe(deleteDoc(doc(db,"events",b.dataset.dele)))}};
$("evForm").onsubmit=async e=>{e.preventDefault();
  if(await safe(addDoc(collection(db,"events"),{date:$("e_date").value,title:$("e_title").value.trim(),place:$("e_place").value.trim(),owner:$("e_owner").value.trim(),notes:$("e_notes").value.trim()}))!==false)e.target.reset()};

/* ---------- Tâches ---------- */
function renderTasks(){
  if(!S.tasks.length){$("taskList").innerHTML='<div class="empty">Aucune tâche.</div>';return}
  $("taskList").innerHTML=["Chaque semaine","Chaque mois","Ponctuel"].map(g=>{const l=S.tasks.filter(t=>(t.freq||"Ponctuel")===g).sort((a,b)=>(a.order??99)-(b.order??99));if(!l.length)return"";
    return`<div class="day">${g} <span class="note">${l.filter(t=>t.done).length}/${l.length}</span></div>`+l.map(t=>`<div class="task ${t.done?"done":""}"><input type="checkbox" data-t="${esc(t.id)}" ${t.done?"checked":""} aria-label="Fait"><div class="tt">${esc(t.title)}<small>${[t.when,t.owner].filter(Boolean).map(esc).join(" · ")}</small></div><button class="sm x" data-delt="${esc(t.id)}">Suppr.</button></div>`).join("")}).join("")}
$("taskList").onchange=async e=>{const c=e.target.closest("[data-t]");if(c)await safe(updateDoc(doc(db,"tasks",c.dataset.t),{done:c.checked}))};
$("taskList").onclick=async e=>{const b=e.target.closest("[data-delt]");if(b){b.disabled=true;await safe(deleteDoc(doc(db,"tasks",b.dataset.delt)))}};
$("taskForm").onsubmit=async e=>{e.preventDefault();
  if(await safe(addDoc(collection(db,"tasks"),{title:$("t_title").value.trim(),freq:$("t_freq").value,when:[$("t_day").value,$("t_when").value.trim()].filter(Boolean).join(" "),owner:$("t_owner").value.trim(),done:false,order:99}))!==false)e.target.reset()};
$("resetWeek").onclick=async()=>{for(const t of S.tasks.filter(t=>t.freq==="Chaque semaine"&&t.done))await safe(updateDoc(doc(db,"tasks",t.id),{done:false}))};

/* ---------- Dictée ---------- */
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;let rec=null;
if(!SR)$("micNote").textContent="Dictée indisponible sur ce navigateur : utilisez le micro du clavier du téléphone.";
$("micBtn").onclick=()=>{
  if(!SR){toast("Utilisez le micro du clavier de votre téléphone pour dicter");$("m_text").focus();return}
  if(rec){rec.stop();return}
  rec=new SR();rec.lang="fr-FR";rec.continuous=true;rec.interimResults=true;
  const base=$("m_text").value.trim();let fin="";
  rec.onresult=e=>{let tmp="";for(let i=e.resultIndex;i<e.results.length;i++){const r=e.results[i];if(r.isFinal)fin+=r[0].transcript+" ";else tmp+=r[0].transcript}
    $("m_text").value=((base?base+" ":"")+fin+tmp).replace(/\s+/g," ")};
  rec.onerror=e=>toast(e.error==="not-allowed"?"Autorisez le micro pour dicter":"Dictée interrompue");
  rec.onend=()=>{rec=null;$("micBtn").classList.remove("rec");$("micBtn").textContent="Dicter";$("micNote").textContent=""};
  try{rec.start();$("micBtn").classList.add("rec");$("micBtn").textContent="Arrêter";$("micNote").textContent="Parlez, le texte s'écrit tout seul."}catch{rec=null;toast("Micro indisponible")}
};

/* ---------- Agenda de la semaine ---------- */
const DAYS=["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
const iso=d=>new Date(d.getTime()-d.getTimezoneOffset()*6e4).toISOString().slice(0,10);
const norm=s=>String(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
function renderWeek(){
  const now=new Date();const mon=new Date(now);mon.setHours(12,0,0,0);mon.setDate(now.getDate()-((now.getDay()+6)%7));const td=iso(now);
  $("week").innerHTML=DAYS.map((name,i)=>{const d=new Date(mon);d.setDate(mon.getDate()+i);const ds=iso(d);const items=[];
    S.meetings.filter(m=>m.date===ds).sort((a,b)=>tmin(a.time)-tmin(b.time)).forEach(m=>items.push(`<li class="k-meet">${esc([m.time,m.body].filter(Boolean).join(" · "))}</li>`));
    S.events.filter(v=>v.date===ds).forEach(v=>items.push(`<li class="k-ev">${esc(v.title)}</li>`));
    S.tasks.filter(t=>t.freq==="Chaque semaine"&&norm(t.when).includes(norm(name))).forEach(t=>items.push(`<li class="k-task ${t.done?"done":""}">${esc(t.title)}</li>`));
    const ms=S.matches.filter(m=>m.date===ds);if(ms.length){const h=ms.filter(m=>m.home).length;items.push(`<li class="k-info">${ms.length} match${ms.length>1?"s":""}${h?`, ${h} à domicile`:""}</li>`)}
    const du=S.duties.filter(x=>x.date===ds).length;if(du)items.push(`<li class="k-info">${du} créneau${du>1?"x":""} de tour de salle</li>`);
    return`<div class="wd ${ds===td?"today":""}"><h4>${name} <span>${d.getDate()} ${MOIS[d.getMonth()]}</span></h4><ul>${items.join("")||'<li class="k-info">Rien de prévu</li>'}</ul></div>`}).join("");
}

/* ---------- Réunions ---------- */
function renderMeetings(){
  const list=S.meetings.filter(m=>m.date>=today).sort((a,b)=>a.date.localeCompare(b.date)||tmin(a.time)-tmin(b.time));
  if(!list.length){$("meetList").innerHTML='<div class="empty">Aucune réunion prévue. Ajoutez la prochaine réunion du bureau ou d\'une commission.</div>';return}
  $("meetList").innerHTML=list.map(m=>{const x=new Date(m.date+"T12:00");return`<div class="meet"><div class="d">${x.getDate()}<span>${MOIS[x.getMonth()]}</span></div><div><h3>${esc(m.body)}</h3><div class="note">${[JOURS[x.getDay()]+(m.time?" à "+m.time:""),m.place].filter(Boolean).map(esc).join(" · ")}</div>${m.agenda?`<p style="margin:6px 0 0;white-space:pre-wrap">${esc(m.agenda)}</p>`:""}</div><button class="sm x" data-delr="${esc(m.id)}">Suppr.</button></div>`}).join("");
}
$("meetList").onclick=async e=>{const b=e.target.closest("[data-delr]");if(b){b.disabled=true;await safe(deleteDoc(doc(db,"meetings",b.dataset.delr)))}};
$("meetForm").onsubmit=async e=>{e.preventDefault();
  if(await safe(addDoc(collection(db,"meetings"),{date:$("r_date").value,time:$("r_time").value.trim(),body:$("r_body").value,place:$("r_place").value.trim(),agenda:$("r_agenda").value.trim()}))!==false)e.target.reset()};

/* ---------- Tours de salle ---------- */
function hl(s,q){const t=esc(s);if(!q)return t;const i=norm(s).indexOf(q);if(i<0)return t;return esc(s.slice(0,i))+"<mark>"+esc(s.slice(i,i+q.length))+"</mark>"+esc(s.slice(i+q.length))}
function renderDuties(){
  const q=norm($("dSearch").value.trim());
  let list=S.duties.filter(x=>x.date>=today).sort((a,b)=>a.date.localeCompare(b.date)||tmin(a.time)-tmin(b.time));
  if(q)list=list.filter(x=>norm([x.match,x.arb,x.table,x.resp].join(" ")).includes(q));
  if(!list.length){$("dutyList").innerHTML=`<div class="empty">${q?"Aucun créneau pour ce nom.":"Aucun tour de salle à venir. Importez le planning ou ajoutez un créneau."}</div>`;return}
  let out="",d="";
  for(const x of list){if(x.date!==d){if(d)out+="</tbody></table></div>";d=x.date;out+=`<div class="day">${esc(dayLabel(d))}</div><div class="scroll"><table class="duty"><thead><tr><th>Heure</th><th>Match</th><th>Arbitres</th><th>Table de marque</th><th>Resp. salle</th><th></th></tr></thead><tbody>`}
    out+=`<tr class="${q?"mine":""}"><td class="t" data-l="Heure">${esc(x.time)}</td><td data-l="Match">${hl(x.match||"",q)}</td><td data-l="Arbitres">${hl(x.arb||"",q)}</td><td data-l="Table de marque">${hl(x.table||"",q)}</td><td data-l="Resp. salle">${hl(x.resp||"",q)}</td><td data-l=""><button class="sm x" data-deld="${esc(x.id)}">Suppr.</button></td></tr>`}
  $("dutyList").innerHTML=out+"</tbody></table></div>";
}
$("dSearch").oninput=()=>renderDuties();
$("dutyList").onclick=async e=>{const b=e.target.closest("[data-deld]");if(b){b.disabled=true;await safe(deleteDoc(doc(db,"duties",b.dataset.deld)))}};
$("dutyForm").onsubmit=async e=>{e.preventDefault();
  if(await safe(addDoc(collection(db,"duties"),{date:$("d_date").value,time:$("d_time").value.trim(),match:$("d_match").value.trim(),arb:$("d_arb").value.trim(),table:$("d_table").value.trim(),resp:$("d_resp").value.trim()}))!==false)e.target.reset()};
const pDate=s=>{s=String(s||"").trim();let m=s.match(/^(\d{4})-(\d{2})-(\d{2})/);if(m)return m[0];m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);if(!m)return null;const y=m[3].length===2?"20"+m[3]:m[3];return`${y}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`};
$("dImport").onclick=async()=>{
  const rows=$("dPaste").value.split(/\r?\n/).map(l=>l.split(l.includes("\t")?"\t":";").map(c=>c.trim())).filter(r=>r.some(Boolean));
  const ok=[],bad=[];rows.forEach((r,i)=>{const d=pDate(r[0]);if(d)ok.push({date:d,time:r[1]||"",match:r[2]||"",arb:r[3]||"",table:r[4]||"",resp:r[5]||""});else if(i>0||!/date/i.test(r[0]))bad.push(i+1)});
  if(!ok.length){$("dImportNote").textContent="Aucune ligne reconnue : la première colonne doit être une date (jj/mm/aaaa).";return}
  for(let i=0;i<ok.length;i+=400){const b=writeBatch(db);ok.slice(i,i+400).forEach(x=>b.set(doc(collection(db,"duties")),x));if(await safe(b.commit())===false)return}
  $("dPaste").value="";$("dImportNote").textContent=`${ok.length} créneau${ok.length>1?"x":""} importé${ok.length>1?"s":""}`+(bad.length?`, lignes ignorées : ${bad.join(", ")}`:"")+".";
};

/* ---------- Membres (admin) ---------- */
function renderMembers(){
  const order={pending:0,staff:1,admin:2};
  const list=[...S.members].sort((a,b)=>(order[a.role]??0)-(order[b.role]??0)||(a.at||0)-(b.at||0));
  if(!list.length){$("memList").innerHTML='<div class="empty">Personne pour l\'instant.</div>';return}
  $("memList").innerHTML=list.map(m=>{const p=m.person&&S.pmap[m.person];return`<div class="mem"><div><b>${esc(m.name||m.email)}</b>${m.role==="pending"?' <span class="tag dom">À valider</span>':""}<small>${esc(m.email)}${p?" · "+esc(p.prenom+" "+p.nom+" · "+p.licence):""}</small></div>
    <div class="acts"><input list="peopleList" data-link="${esc(m.id)}" placeholder="Relier à un licencié" aria-label="Licencié" value="${p?esc(p.prenom+" "+p.nom+" · "+p.licence):""}">${m.email===SUPER_ADMIN?'<span class="tag">Admin principal</span>':`<select data-mem="${esc(m.id)}" aria-label="Rôle"><option value="pending"${m.role==="pending"?" selected":""}>En attente</option><option value="player"${m.role==="player"?" selected":""}>Joueur</option><option value="staff"${m.role==="staff"?" selected":""}>Staff</option><option value="admin"${m.role==="admin"?" selected":""}>Admin</option></select><button class="sm x" data-delm="${esc(m.id)}">Retirer</button>`}</div></div>`}).join("");
  const p=list.filter(m=>m.role==="pending").length;$("navMembres").textContent=p?`Membres (${p})`:"Membres";
}
$("memList").addEventListener("change",async e=>{const i=e.target.closest("[data-link]");if(!i)return;const lic=(i.value.split("·").pop()||"").trim();
  if(i.value&&!S.pmap[lic]){toast("Choisissez un licencié dans la liste");return}
  if(await safe(updateDoc(doc(db,"members",i.dataset.link),{person:i.value?lic:null}))!==false)toast(i.value?"Compte relié à "+S.pmap[lic].prenom+" "+S.pmap[lic].nom:"Liaison retirée")});
$("memList").onchange=async e=>{const s=e.target.closest("[data-mem]");if(s&&await safe(updateDoc(doc(db,"members",s.dataset.mem),{role:s.value}))!==false)toast("Rôle mis à jour")};
$("memList").onclick=async e=>{const b=e.target.closest("[data-delm]");if(b){b.disabled=true;await safe(deleteDoc(doc(db,"members",b.dataset.delm)))}};
