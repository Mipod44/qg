import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc, getDoc, writeBatch, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
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

const S={conv:[],matches:[],msgs:[],ctmsgs:[],events:[],tasks:[],meetings:[],duties:[],members:[],people:[],pmap:{},me:null,table:null,cat:"general",user:null,role:null};
const unsubs=[];
const JOURS=["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"],MOIS=["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
const dayLabel=d=>{const x=new Date(d+"T12:00");return isNaN(x)?d:JOURS[x.getDay()]+" "+x.getDate()+" "+MOIS[x.getMonth()]};
const today=new Date().toISOString().slice(0,10);
const tmin=t=>{const m=String(t||"").match(/(\d+)h(\d*)/);return m?(+m[1])*60+(+m[2]||0):9999};
const isAdmin=()=>S.role==="admin";
const isPlayer=()=>S.role==="player";
const isCT=()=>["admin","staff"].includes(S.role);
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
  unsubs.push(onSnapshot(ref,d=>{const prev=S.role;S.me=d.exists()?d.data():null;S.role=S.me?S.me.role:"pending";const ok=["admin","staff","coach","player"].includes(S.role);
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
  loadShopImgs();
  live("conv","conv",()=>{renderConv();renderTally();renderProfile();renderEvents()});
  live("matches","matches",()=>{renderMatches();renderTally();renderWeek();renderProfile()});
  live("events","events",()=>{renderEvents();renderWeek();renderProfile()});
  live("duties","duties",()=>{renderDuties();renderWeek();renderProfile()});
  if(!isPlayer()){
    live("msgs","msgs",()=>{renderCats();renderMsgs()});
    if(isCT())live("ctmsgs","ctmsgs",()=>{renderCats();renderMsgs()});
    live("tasks","tasks",()=>{renderTasks();renderWeek()});
    live("meetings","meetings",()=>{renderMeetings();renderWeek();renderProfile()});
    live("people","people",()=>{renderClub();S.pmap=Object.fromEntries(S.people.map(p=>[p.id,p]));$("peopleList").innerHTML=S.people.map(p=>`<option value="${esc(p.prenom+" "+p.nom+" · "+p.id)}">`).join("");loadMe();if(isAdmin())renderMembers()});
  }
  unsubs.push(onSnapshot(collection(db,"meta"),qs=>{const t={};qs.docs.forEach(d=>{const x=d.data();if(d.id==="club"){S.club=x;return}if(d.id.startsWith("cl_"))t[x.team||d.id.slice(3)]=x;else if(d.id==="classement"){const k=x.team||String(x.title||"").split(" · ")[0].trim();if(k&&!t[k])t[k]=x}});S.tables=t;renderMatches();renderClub()},()=>{}));
  if(isAdmin())live("members","members",renderMembers);
}
/* ---------- Mon profil ---------- */
const initials=s=>String(s||"?").split(/[\s.@-]+/).filter(Boolean).slice(0,2).map(w=>w[0].toUpperCase()).join("");
const linked=m=>m?[...new Set([...(m.persons||[]),...(m.person?[m.person]:[])])]:[];
async function getPerson(pid){let p=S.pmap[pid];if(!p){try{const d=await getDoc(doc(db,"people",pid));if(d.exists()){p={id:d.id,...d.data()};S.pmap[pid]=p}}catch{}}return p||null}
async function loadMe(){
  const ids=linked(S.me);S.myPeople=(await Promise.all(ids.map(getPerson))).filter(Boolean);
  let act=null;try{act=localStorage.getItem("asmActive")}catch{}
  const p=S.myPeople.find(x=>x.id===act)||S.myPeople[0]||null;S.person=p;
  const name=p?p.prenom+" "+p.nom:(S.user.displayName||S.user.email);
  $("whoName").textContent=name;
  $("meLic").textContent=p?"Licence "+p.licence+(S.myPeople.length>1?" · "+S.myPeople.length+" profils":""):(isAdmin()?"Licence à relier dans Membres":"");
  $("meAv").textContent=initials(p?p.prenom+" "+p.nom:name);renderProfile();renderMatches();
}
function setActive(pid){try{localStorage.setItem("asmActive",pid);localStorage.removeItem("asmTeam")}catch{}S.team=null;loadMe()}
function myTeams(){const p=S.person;return p?[...new Set([...(p.equipes||[]),...(p.coach||[])])]:[]}
function mentions(x){const p=S.person;if(!p)return false;const t=norm([x.match,x.arb,x.table,x.resp].join(" "));const pr=norm(p.prenom.split(" ")[0]),nm=norm(p.nom);return t.includes(pr+" "+nm)||t.includes(nm+" "+pr)}
function renderProfile(){
  if($("prof").classList.contains("hide"))return;
  const p=S.person;const name=$("whoName").textContent;
  $("profAv").textContent=$("meAv").textContent;$("profName").textContent=name;
  const many=(S.myPeople||[]).length>1;show("profSwitch",many);
  if(many)$("profSwitch").innerHTML='<p>Profils reliés à votre compte :</p>'+S.myPeople.map(x=>`<button type="button" data-act="${esc(x.id)}" class="${p&&x.id===p.id?"on":""}" aria-pressed="${p&&x.id===p.id}"><span class="av">${esc(initials(x.prenom+" "+x.nom))}</span>${esc(x.prenom)}</button>`).join("");
  const teams=myTeams();
  $("profMeta").textContent=p?["Licence "+p.licence,(p.equipes||[]).length?"Joue en "+p.equipes.join(", "):"",(p.coach||[]).length?"Coach "+p.coach.join(", "):""].filter(Boolean).join(" · "):"Compte pas encore relié à un licencié : demandez à un admin.";
  const ms=S.matches.filter(m=>m.date>=today&&teams.includes(m.team)).sort((a,b)=>a.date.localeCompare(b.date)||tmin(a.time)-tmin(b.time));
  $("profMatches").innerHTML=ms.length?ms.map(m=>{const c=S.conv.find(x=>x.date===m.date&&x.team===m.team);const coach=p&&(p.coach||[]).includes(m.team);
    return`<div class="pl"><div class="when">${esc(dayLabel(m.date))}<span>${esc(m.time||"")}</span></div><div><b>${esc(m.team)}${coach?" (coach)":""}</b> ${m.home?"reçoit":"chez"} ${esc(m.opp)}<p class="note">${c?(c.home?"Convocation "+esc(c.conv)+" à la salle":"Départ "+esc(c.conv)+" du parking"+(c.place?" · "+esc(c.place):"")):(m.home?"À domicile":"À l'extérieur")}</p></div></div>`}).join(""):`<div class="empty">${p?"Aucun match à venir pour vos équipes.":"Reliez votre compte à votre licence pour voir vos matchs."}</div>`;
  const du=S.duties.filter(x=>x.date>=today&&mentions(x)).sort((a,b)=>a.date.localeCompare(b.date)||tmin(a.time)-tmin(b.time));
  $("profDuties").innerHTML=du.length?du.map(x=>{const pr=norm(S.person.prenom.split(" ")[0]);const role=[["arb","Arbitrage"],["table","Table de marque"],["resp","Responsable de salle"]].filter(([k])=>norm(x[k]).includes(pr)).map(r=>r[1]).join(", ")||"Tour de salle";
    return`<div class="pl"><div class="when">${esc(dayLabel(x.date))}<span>${esc(x.time||"")}</span></div><div><b>${esc(role)}</b><p class="note">${esc(x.match||"")}</p></div></div>`}).join(""):`<div class="empty">Aucun tour de salle à votre nom.</div>`;
  const ev=[...S.events.filter(v=>v.date>=today&&v.kind!=="actu").map(v=>({date:v.date,t:v.title,s:v.place||""})),...(isPlayer()?[]:S.meetings.filter(m=>m.date>=today).map(m=>({date:m.date,t:m.body,s:[m.time,m.place].filter(Boolean).join(" · ")})))].sort((a,b)=>a.date.localeCompare(b.date)).slice(0,8);
  $("profEvents").innerHTML=ev.length?ev.map(v=>`<div class="pl"><div class="when">${esc(dayLabel(v.date))}</div><div><b>${esc(v.t)}</b><p class="note">${esc(v.s)}</p></div></div>`).join(""):'<div class="empty">Rien de prévu pour le moment.</div>';
}
$("meBtn").onclick=()=>{show("prof",true);renderProfile();$("profClose").focus()};
$("profSwitch").onclick=e=>{const b=e.target.closest("[data-act]");if(b)setActive(b.dataset.act)};
$("profClose").onclick=()=>show("prof",false);
$("prof").onclick=e=>{if(e.target.id==="prof")show("prof",false)};
addEventListener("keydown",e=>{if(e.key==="Escape")show("prof",false)});
/* ---------- Le club ---------- */
const CLUB0={
 bureau:["Président : Raphaël Mistura","Correspondante FFBB : Clémence Denie","Dirigeante : Aude Cheneau","Dirigeante : Isabelle Cheneau","Dirigeante : Manon Cheneau","Dirigeant : Mikael De Brito Ventura","Dirigeante : Coralie Denie","Dirigeante : Karine Denie","Dirigeante : Darlène Gueno","Dirigeante : Claire Gueritte","Dirigeante : Laurence Guillore","Dirigeante : Magdalena Hougard","Dirigeante : Laetitia Le Bomin","Dirigeante : Julie Mistura"],
 ct:[],
 sal:["Éducateur sportif : Charles Saiter"],
 coach:["Seniors F1 : Mikael De Brito Ventura","Seniors F1 : David Le Clair","U18F1 : Aline Nicol","U18F2 : Léa Troffigue","U18M : Charles Saiter","U15F : Hélène Denaire","U15F : Jade Tessier","U15M : Raphaël Mistura","U13F : Olivier Pichon","U13F2 : Alizé Denie","U13F2 : Clémence Denie","U13M : Charles Saiter","U11F1 : Emma Denaire","U11F1 : Pauline Hougard","U11F2 : Zoé Cartier","U11F2 : Alix Jarnaud","U11M1 : Jade Cayet","U11M1 : Hélène Cheraud","U11M2 : Agathe Le Tilly","U11M2 : Louise Lecocq"],
 hist:["1979 : Création du club sous l'impulsion de Bernard Guillomet. Premier bureau : Jacqueline Terrien (présidente), Bernard Guillomet (secrétaire), Michel Bertho (trésorier).","1984 : 5 équipes, des poussines aux cadettes, et 63 licenciés. On parle déjà d'une salle à La Madeleine.","1994 : Pour les 15 ans du club, création des 2 premières équipes masculines.","1995 : 9 équipes, 95 licenciés ; les seniors filles d'Alain Malary montent en promotion honneur.","1999 : Première pierre de la salle de La Madeleine en février, première saison dans la salle en septembre (105 licenciés, 11 équipes).","2013 : Record de 140 licenciés et autant de garçons que de filles.","2018 : Premier emploi en CDI au club, avec Morgane Proust.","2019 : Entente seniors masculins avec Certé Trignac.","2022 : Record de 180 licenciés et 18 équipes ; Manon Cheneau succède à Hélène Denaire à la présidence.","2023 : Label national mini basket, record de 205 licenciés, ouverture du micro basket dès 4 ans."]};
const clubData=()=>({...CLUB0,...(S.club||{})});
const lines=t=>String(t||"").split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
const split=l=>{const i=l.indexOf(":");return i<0?["",l.trim()]:[l.slice(0,i).trim(),l.slice(i+1).trim()]};
function renderClub(){
  if(!$("clubBody"))return;const C=clubData();
  const org=(title,list,empty)=>`<div class="org"><h3>${esc(title)}</h3>${list.length?list.map(l=>{const[r,n]=split(l);return`<div class="person"><span class="av">${esc(initials(n))}</span><div>${esc(n)}<small>${esc(r)}</small></div></div>`}).join(""):`<p class="note">${esc(empty)}</p>`}</div>`;
  const coachBy={};C.coach.forEach(l=>{const[t,n]=split(l);(coachBy[n]=coachBy[n]||[]).push(t)});
  const coachList=Object.entries(coachBy).sort((a,b)=>a[0].localeCompare(b[0])).map(([n,t])=>t.join(", ")+" : "+n);
  let trombi="";
  if(!isPlayer()&&S.people?.length){const by={};S.people.forEach(p=>(p.equipes||[]).forEach(e=>(by[e]=by[e]||[]).push(p)));
    const order=[...CATS.filter(c=>by[c]),...Object.keys(by).filter(c=>!CATS.includes(c)).sort()];
    trombi=`<h3 class="sub">Trombinoscope</h3><p class="note">Visible par le staff. Les avatars aux couleurs du club remplaceront les initiales.</p>${order.map(t=>`<details><summary><b>${esc(t)}</b> <span class="note">· ${by[t].length}</span></summary><div class="trombi">${by[t].sort((a,b)=>a.nom.localeCompare(b.nom)).map(p=>`<div><span class="av">${esc(initials(p.prenom+" "+p.nom))}</span>${esc(p.prenom)} ${esc(p.nom)}</div>`).join("")}</div></details>`).join("")}`}
  $("clubBody").innerHTML=`<div class="kpis"><div class="kpi"><b>1979</b><span>création du club</span></div><div class="kpi"><b>${S.people?.length||177}</b><span>licenciés cette saison</span></div><div class="kpi"><b>16</b><span>équipes en championnat FFBB</span></div><div class="kpi"><b>Label</b><span>national mini basket</span></div></div>
  <div class="grid2"><div><h3 class="sub">Notre histoire</h3><ul class="timeline">${C.hist.map(l=>{const[y,t]=split(l);return`<li><b>${esc(y)}</b>${esc(t)}</li>`}).join("")}</ul><p><b>Et la suite ? À vous d'écrire l'histoire !</b></p></div>
  <div><h3 class="sub">Nous trouver</h3><div class="panel contact"><div><b>Salle de La Madeleine</b><br>Rue Pierre de Coubertin<br>44410 Saint-Lyphard<br><span class="note">À mi-chemin entre Guérande et Saint-Lyphard</span></div><div><b>Contact</b><br><a href="tel:+33787349605">07 87 34 96 05</a><br><a href="mailto:aslamadeleinebasket@orange.fr">aslamadeleinebasket@orange.fr</a><br><a href="https://aslamadeleinebasket.fr" target="_blank" rel="noopener">aslamadeleinebasket.fr</a> · <a href="https://m.facebook.com/aslamadeleinebasket.fr/" target="_blank" rel="noopener">Facebook</a></div></div></div></div>
  <h3 class="sub">Qui fait quoi</h3><div class="orgs">${org("Bureau",C.bureau,"À compléter.")}${org("Commission technique",C.ct,"À compléter en début de saison.")}${org("Salariés",C.sal,"À compléter.")}${org("Coachs",coachList,"À compléter.")}</div>${trombi}`;
  if(S.cbFill!==JSON.stringify(C)){S.cbFill=JSON.stringify(C);$("cb_bureau").value=C.bureau.join("\n");$("cb_ct").value=C.ct.join("\n");$("cb_sal").value=C.sal.join("\n");$("cb_coach").value=C.coach.join("\n");$("cb_hist").value=C.hist.join("\n")}
}
$("clubForm").onsubmit=async e=>{e.preventDefault();if(await safe(setDoc(doc(db,"meta","club"),{bureau:lines($("cb_bureau").value),ct:lines($("cb_ct").value),sal:lines($("cb_sal").value),coach:lines($("cb_coach").value),hist:lines($("cb_hist").value),updated:today}))!==false){toast("Infos du club enregistrées");$("clubEdit").open=false}};
$("cbReset").onclick=()=>{S.cbFill=null;const s=S.club;S.club=null;renderClub();S.club=s;toast("Infos d'origine remises dans le formulaire : enregistrez pour valider")};

/* ---------- Boutique ---------- */
const SHOP=[["brizzo","Brizzo","T-shirt homme et junior",25,20,"tee"],["brizza","Brizza","T-shirt femme",25,null,"f"],["danco","Danco","Maillot",25,25,"tee"],["dumpo","Dumpo","Short",20,20,"tee"],["giordi","Giordi","Sweat à capuche",50,45,"tee"],["giordizi","Giordizi","Veste zippée à capuche",55,50,"tee"],["gaudo","Gaudo","Pantalon",40,35,"tee"],["gamberto","Gamberto","Sac à dos",40,null,"u"],["grenno","Grenno","Sac de sport L",40,null,"u"],["eleno","Eleno","Chaussettes, lot de 3 même couleur (sans logo)",21,null,"pt"],["orvieto","Orvieto","Gourde (sans logo)",8,null,"u"],["bracelet","Bracelet éponge","À l'unité (sans logo)",5,null,"u"]];
const SIZES={tee:["Adulte S","Adulte M","Adulte L","Adulte XL","Adulte 2XL","Adulte 3XL","Junior 6 ans","Junior 8 ans","Junior 10 ans","Junior 12 ans","Junior 14 ans"],f:["XS","S","M","L","XL","2XL"],pt:["27-30","31-34","35-38","39-42","43-46","47-52"],u:["Taille unique"]};
S.cart=[];
function renderShop(){
  $("shopList").innerHTML=SHOP.map(([id,n,d,ad,jr,sz])=>`<div class="prod"><img src="${S.shopImg?.[id]||""}" alt="${esc(n)}" loading="lazy"><div class="in"><h3>${esc(n)}</h3><div class="note">${esc(d)}</div><div class="px">${jr&&jr!==ad?`${ad} € <span class="note">adulte</span> · ${jr} € <span class="note">junior</span>`:`${ad} €`}</div>
    <div class="row"><select data-sz="${id}" aria-label="Taille">${SIZES[sz].map(s=>`<option>${esc(s)}</option>`).join("")}</select><input type="number" min="1" value="1" data-q="${id}" aria-label="Quantité"></div>
    ${sz==="u"||sz==="pt"?"":`<input data-perso="${id}" placeholder="Nom au dos (+8 €) ou initiales (+4,5 €)" aria-label="Personnalisation">`}
    <button class="sm pri" data-add="${id}">Ajouter au panier</button></div></div>`).join("")+`<div class="prod"><img src="${S.shopImg?.guide||""}" alt="Guide des tailles Kappa" loading="lazy"><div class="in"><h3>Guide des tailles</h3><div class="note">Adulte homme S à 3XL, femme XS à 2XL, junior 6 à 14 ans, pointures 27 à 52. Personnalisation : nom au dos 8 €, initiales 4,5 €.</div><a class="sm" href="https://aslamadeleinebasket.fr/boutique-club" target="_blank" rel="noopener">Voir sur le site du club</a></div></div>`;
  renderCart()}
function renderCart(){
  if(!S.cart.length){$("cart").innerHTML='<h3>Mon panier</h3><p class="note" style="color:#cfcfcf">Votre panier est vide.</p>';return}
  const tot=S.cart.reduce((s,c)=>s+c.px*c.q,0);
  const who=$("whoName")?.textContent||"";
  const body=`Bonjour,\n\nJe souhaite commander :\n`+S.cart.map(c=>`- ${c.q} x ${c.n} (${c.sz})${c.perso?" – perso : "+c.perso:""} : ${(c.px*c.q).toFixed(2).replace(".",",")} €`).join("\n")+`\n\nTotal : ${tot.toFixed(2).replace(".",",")} €\n\n${who}`;
  $("cart").innerHTML=`<h3>Mon panier</h3><ul>${S.cart.map((c,i)=>`<li>${c.q} × ${esc(c.n)} · ${esc(c.sz)}${c.perso?` · « ${esc(c.perso)} »`:""} — <b>${(c.px*c.q).toFixed(2).replace(".",",")} €</b> <button class="sm rm" data-rm="${i}">Retirer</button></li>`).join("")}</ul><div class="tot">Total : ${tot.toFixed(2).replace(".",",")} €</div>
  <a class="btn" href="mailto:aslamadeleinebasket@orange.fr?subject=${encodeURIComponent("Commande boutique ASM Basket")}&body=${encodeURIComponent(body)}">Envoyer la commande au club</a><button class="sm" data-copycart="1" style="background:#fff;color:#111">Copier le récapitulatif</button>
  <p class="note" style="color:#cfcfcf">Le règlement et le retrait se font auprès du club.</p>`;S.cartTxt=body}
$("v-boutique").addEventListener("click",async e=>{const a=e.target.closest("[data-add]");if(a){const id=a.dataset.add,p=SHOP.find(x=>x[0]===id),sz=$("v-boutique").querySelector(`[data-sz="${id}"]`).value,q=Math.max(1,+$("v-boutique").querySelector(`[data-q="${id}"]`).value||1),pe=($("v-boutique").querySelector(`[data-perso="${id}"]`)?.value||"").trim();
    const jr=sz.startsWith("Junior")&&p[4]?p[4]:p[3];const extra=pe?(pe.replace(/[^A-Za-zÀ-ÿ]/g,"").length<=3?4.5:8):0;S.cart.push({n:p[1],sz,q,perso:pe,px:jr+extra});renderCart();toast(p[1]+" ajouté au panier");return}
  const r=e.target.closest("[data-rm]");if(r){S.cart.splice(+r.dataset.rm,1);renderCart();return}
  if(e.target.closest("[data-copycart]")){try{await navigator.clipboard.writeText(S.cartTxt);toast("Récapitulatif copié")}catch{toast("Copie impossible sur cet appareil")}}});
try{S.shopImg=JSON.parse(localStorage.getItem("asmShopImg")||"null")}catch{}
renderShop();
async function loadShopImgs(){try{const d=await getDoc(doc(db,"assets","shop"));if(d.exists()){const x=d.data();if(x.v!==S.shopImg?.v){S.shopImg={...x.img,v:x.v};try{localStorage.setItem("asmShopImg",JSON.stringify(S.shopImg))}catch{}renderShop()}}}catch{}}
window.asmPutAsset=async(id,data)=>{if(!isAdmin())return"réservé aux admins";await setDoc(doc(db,"assets",id),data);await loadShopImgs();return"ok"};

/* ---------- Appli installable ---------- */
if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js").catch(()=>{});
let installEvt=null;const standalone=matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
addEventListener("beforeinstallprompt",e=>{e.preventDefault();installEvt=e;if(!standalone)show("installBtn",true)});
if(isIOS&&!standalone)show("installBtn",true);
$("installBtn").onclick=async()=>{if(installEvt){installEvt.prompt();await installEvt.userChoice.catch(()=>{});installEvt=null;show("installBtn",false)}
  else{const el=$("toast");el.textContent="Sur iPhone : ouvrez ce site dans Safari, touchez Partager puis « Sur l'écran d'accueil ».";el.style.display="block";clearTimeout(toast.h);toast.h=setTimeout(()=>el.style.display="none",8000)}};
addEventListener("appinstalled",()=>show("installBtn",false));
window.asmSyncFFBB=async(data)=>{if(!isAdmin())return"réservé aux admins";const rep={tables:0,added:0,scored:0,same:0,diff:[]};
  for(const [team,t] of Object.entries(data.tables||{})){await setDoc(doc(db,"meta","cl_"+team),{team,title:t.title,rows:t.rows,note:t.note||"",updated:today,src:"ffbb"});rep.tables++}
  for(const m of data.played||[]){const ex=S.matches.filter(x=>x.team===m.team&&x.date===m.date);
    if(!ex.length){await addDoc(collection(db,"matches"),{date:m.date,team:m.team,opp:m.opp,home:m.home,time:m.time,us:m.us,them:m.them,status:"fin",src:"ffbb"});rep.added++;continue}
    for(const x of ex){if(x.status==="fin"){if(x.us===m.us&&x.them===m.them)rep.same++;else rep.diff.push(`${m.team} ${m.date} : appli ${x.us}-${x.them}, FFBB ${m.us}-${m.them}`)}
      else{await updateDoc(doc(db,"matches",x.id),{us:m.us,them:m.them,status:"fin"});rep.scored++}}}
  return rep};
window.asmImportPeople=async list=>{if(!isAdmin())return"admin requis";for(let i=0;i<list.length;i+=400){const b=writeBatch(db);list.slice(i,i+400).forEach(p=>{const{licence,...rest}=p;b.set(doc(db,"people",licence),{licence,...rest})});await b.commit()}return list.length+" licenciés importés"};
async function importSeed(){const b=writeBatch(db);for(const [col,docs] of Object.entries(SEED))for(const [id,data] of Object.entries(docs))b.set(doc(db,col,id),data);
  if(await safe(b.commit())!==false)toast("Données de départ importées")}

/* ---------- Navigation ---------- */
const VIEWS=["evenements","convocations","matchs","echanges","club","boutique","taches","salle","membres"];
function route(){let v=location.hash.slice(1);if(!VIEWS.includes(v)||(v==="membres"&&!isAdmin())||(isPlayer()&&["echanges","taches"].includes(v)))v="evenements";
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
S.tables={};S.team=null;
const teamList=()=>{const s=new Set([...S.matches.map(m=>m.team),...Object.keys(S.tables||{}),...myTeams().filter(x=>CATS.includes(x))].filter(Boolean));return[...CATS.filter(c=>s.has(c)),...[...s].filter(c=>!CATS.includes(c)).sort()]};
function curTeam(){const L=teamList();let t=S.team;if(t==null){try{t=localStorage.getItem("asmTeam")}catch{}}
  if(t&&t!=="all"&&!L.includes(t))t=null;if(!t)t=myTeams().find(x=>L.includes(x))||"all";return t}
function matchRow(m){
    const st=m.status==="live"?'<span class="tag live">En direct</span>':m.status==="fin"?'<span class="tag fin">Terminé</span>':`<span class="tag plain">${esc(m.time||"")}</span>`;
    const res=m.status==="fin"&&m.us!=null&&m.them!=null?(m.us>m.them?" · Victoire":" · Défaite"):"";
    return `<div class="match"><div><div class="eq">${esc(m.team)} <span>${m.home?"reçoit":"chez"} ${esc(m.opp)}</span></div><div>${st}<span class="note">${res}</span></div></div>
    <div class="score" data-m="${esc(m.id)}"><input type="number" min="0" inputmode="numeric" aria-label="Score ASM" data-f="us" value="${m.us??""}"${m.status==="fin"?" disabled":""}><b>–</b><input type="number" min="0" inputmode="numeric" aria-label="Score adversaire" data-f="them" value="${m.them??""}"${m.status==="fin"?" disabled":""}>
      <select data-f="status" aria-label="Statut"${m.status==="fin"?" disabled":""}><option value="avenir"${m.status==="avenir"?" selected":""}>À venir</option><option value="live"${m.status==="live"?" selected":""}>En direct</option><option value="fin"${m.status==="fin"?" selected":""}>Terminé</option></select>${m.status==="fin"?'<span class="lock">Score validé</span>':""}</div><div class="cf hide" id="cf-${esc(m.id)}"></div></div>`}
function renderMatches(){
  const L=teamList(),t=curTeam(),sel=$("teamSel");
  sel.innerHTML='<option value="all">Toutes les équipes</option>'+L.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join("");sel.value=t;
  const srt=(a,b)=>a.date.localeCompare(b.date)||tmin(a.time)-tmin(b.time);
  const all=S.matches.filter(m=>t==="all"||m.team===t);
  const up=all.filter(m=>m.status==="live"||(m.status!=="fin"&&m.date>=today)).sort(srt);
  let past=all.filter(m=>!up.includes(m)).sort((a,b)=>srt(b,a)),hidden=0;
  if(t==="all"){const lim=iso(new Date(Date.now()-8*864e5));const k=past.filter(m=>m.date>=lim);hidden=past.length-k.length;past=k}
  const block=(list,hd)=>{if(!list.length)return"";let o=`<h3 class="sub">${hd}</h3>`,d="";for(const m of list){if(m.date!==d){d=m.date;o+=`<div class="day">${esc(dayLabel(d))}</div>`}o+=matchRow(m)}return o};
  let out=block(up,"À venir et en direct")+block(past,t==="all"?"Derniers résultats":"Résultats de la saison");
  if(hidden)out+=`<p class="note">${hidden} résultat${hidden>1?"s":""} plus ancien${hidden>1?"s":""} : choisissez une équipe pour voir toute sa saison.</p>`;
  $("matchList").innerHTML=out||`<div class="empty">Aucun match ${t==="all"?"enregistré":"pour "+esc(t)}.</div>`;
  const tb=t==="all"?null:(S.tables||{})[t];
  $("standings").innerHTML=t==="all"?'<h3>Classement</h3><p class="note">Choisissez une équipe en haut pour afficher son classement.</p>':tb?`<h3>${esc(tb.title||t)}</h3><table><thead><tr><th>#</th><th>Équipe</th><th class="n">Pts</th><th class="n">V-D</th></tr></thead><tbody>${(tb.rows||[]).map((r,i)=>`<tr class="${/madeleine/i.test(r.eq)?"us":""}"><td>${i+1}</td><td>${esc(r.eq)}</td><td class="n">${esc(r.pts)}</td><td class="n">${esc(r.v)}-${esc(r.d)}</td></tr>`).join("")}</tbody></table>${tb.note?`<p class="note">${esc(tb.note)}</p>`:""}`:`<h3>Classement ${esc(t)}</h3><p class="note">Pas encore de classement saisi pour cette équipe.</p>`;
  show("clEdit",t!=="all");
  if(S.clFor!==t){S.clFor=t;$("cl_title").value=tb?.title||(t==="all"?"":t+" · ");$("cl_note").value=tb?.note||"";$("cl_rows").value=(tb?.rows||[]).map(r=>`${r.eq} ; ${r.pts} ; ${r.v} ; ${r.d}`).join("\n")}
}
$("teamSel").onchange=e=>{S.team=e.target.value;try{localStorage.setItem("asmTeam",S.team)}catch{}renderMatches()};
function parseTable(txt){const rows=[];for(let line of String(txt).split(/\r?\n/)){line=line.trim();if(!line)continue;
    let cells=/[\t;]/.test(line)?line.split(/\s*[\t;]\s*/).filter(c=>c!==""):null,eq,n;
    if(cells){if(/^\d+$/.test(cells[0])&&cells.length>1&&!/^\d+$/.test(cells[1]))cells.shift();const i=cells.findIndex(c=>!/^-?\d+$/.test(c));if(i<0)continue;eq=cells[i];n=cells.slice(i+1).filter(c=>/^-?\d+$/.test(c)).map(Number)}
    else{const w=line.split(/\s+/);if(/^\d+$/.test(w[0]))w.shift();const nums=[];while(w.length&&/^-?\d+$/.test(w[w.length-1])&&nums.length<3)nums.unshift(+w.pop());eq=w.join(" ");n=nums}
    if(!eq||n.length<3)continue;const [pts,v,d]=n.length>=4?[n[0],n[2],n[3]]:n;rows.push({eq,pts,v,d})}return rows}
$("clForm").onsubmit=async e=>{e.preventDefault();const t=curTeam();if(t==="all")return;const rows=parseTable($("cl_rows").value);
  if(!rows.length){toast("Je n'ai reconnu aucune ligne : une équipe par ligne, avec points, victoires et défaites");return}
  if(await safe(setDoc(doc(db,"meta","cl_"+t),{team:t,title:$("cl_title").value.trim()||t,rows,note:$("cl_note").value.trim(),updated:today}))!==false){toast(`Classement ${t} enregistré (${rows.length} équipes)`);$("clEdit").open=false;S.clFor=null}};
$("matchList").onchange=async e=>{const el=e.target;const box=el.closest("[data-m]");if(!box)return;
  const id=box.dataset.m;const m=S.matches.find(x=>x.id===id);if(!m||m.status==="fin"){renderMatches();return}
  const f=el.dataset.f;let v=el.value;
  if(f==="status"&&v==="fin"){el.value=m.status||"avenir";askFinish(id,box);return}
  if(f!=="status")v=v===""?null:Math.max(0,parseInt(v,10)||0);
  await safe(updateDoc(doc(db,"matches",id),{[f]:v}))};
function askFinish(id,box){const m=S.matches.find(x=>x.id===id);const us=box.querySelector('[data-f="us"]').value,th=box.querySelector('[data-f="them"]').value;
  if(us===""||th===""){toast("Saisissez les deux scores avant de terminer le match");return}
  const cf=$("cf-"+id);cf.innerHTML=`<p>Terminer <b>${esc(m.team)}</b> contre ${esc(m.opp)} sur le score de <b>${esc(us)} – ${esc(th)}</b> ? Le score sera définitif et ne pourra plus être modifié.</p><button type="button" class="pri sm" data-cfok="${esc(id)}">Confirmer le score final</button><button type="button" class="sm" data-cfno="${esc(id)}">Annuler</button>`;cf.classList.remove("hide");cf.querySelector("[data-cfok]").focus()}
$("matchList").addEventListener("click",async e=>{const ok=e.target.closest("[data-cfok]"),no=e.target.closest("[data-cfno]");
  if(no){const c=$("cf-"+no.dataset.cfno);c.classList.add("hide");c.innerHTML="";return}
  if(!ok)return;const id=ok.dataset.cfok;const box=document.querySelector(`.score[data-m="${id}"]`);if(!box)return;
  const us=parseInt(box.querySelector('[data-f="us"]').value,10),th=parseInt(box.querySelector('[data-f="them"]').value,10);
  if(isNaN(us)||isNaN(th)){toast("Score incomplet");return}ok.disabled=true;
  if(await safe(updateDoc(doc(db,"matches",id),{us:Math.max(0,us),them:Math.max(0,th),status:"fin"}))!==false)toast("Match terminé : score validé")});

/* ---------- Échanges ---------- */
function renderCats(){const n={};S.msgs.forEach(m=>n[m.cat]=(n[m.cat]||0)+1);if(S.cat==="ct"&&!isCT())S.cat="general";
  $("cats").innerHTML=(isCT()?`<button type="button" class="ct ${S.cat==="ct"?"on":""}" data-cat="ct">Commission technique${S.ctmsgs.length?`<i>${S.ctmsgs.length}</i>`:""}</button>`:"")+`<button type="button" class="gen ${S.cat==="general"?"on":""}" data-cat="general">Tous les coachs${n.general?`<i>${n.general}</i>`:""}</button><span class="sep"></span>`+CATS.map(c=>`<button type="button" class="${c===S.cat?"on":""}" data-cat="${c}">${c}${n[c]?`<i>${n[c]}</i>`:""}</button>`).join("");$("msgCat").textContent=catLabel(S.cat)}
const catLabel=c=>c==="general"?"tous les coachs":c==="ct"?"la commission technique (staff, bureau, admins)":c;
$("cats").onclick=e=>{const b=e.target.closest("[data-cat]");if(!b)return;S.cat=b.dataset.cat;renderCats();renderMsgs()};
function renderMsgs(){
  const ct=S.cat==="ct";$("ctNote").classList.toggle("hide",!ct);
  const list=(ct?S.ctmsgs:S.msgs.filter(m=>m.cat===S.cat)).sort((a,b)=>a.ts-b.ts);
  if(!list.length){$("msgList").innerHTML=`<div class="empty">${ct?"Pas encore de message dans la commission technique.":S.cat==="general"?"Pas encore de message pour tous les coachs. Utilisez ce fil pour les consignes générales du club.":"Pas encore d'échange pour "+esc(S.cat)+"."}</div>`;return}
  $("msgList").innerHTML=list.map(m=>{const dt=new Date(m.ts);return`<div class="msg ${S.user&&m.author===S.user.uid?"me":""}"><small>${esc(m.who||"Membre du club")} · ${dt.toLocaleDateString("fr-FR",{day:"numeric",month:"short"})} ${dt.toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"})}</small><p>${esc(m.text)}</p></div>`}).join("");
}
$("msgForm").onsubmit=async e=>{e.preventDefault();const t=$("m_text").value.trim();if(!t)return;
  if(await safe(addDoc(collection(db,S.cat==="ct"?"ctmsgs":"msgs"),{cat:S.cat,text:t,author:S.user.uid,who:S.user.displayName||S.user.email,ts:Date.now()}))!==false)$("m_text").value=""};

/* ---------- Événements ---------- */
function weekPosts(){
  const days=[...new Set(S.conv.map(c=>c.date))].filter(d=>d>=today&&(new Date(d+"T12:00")-new Date(today+"T12:00"))/864e5<=3).sort();
  const JL=["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"];
  return days.map(d=>{const L=S.conv.filter(c=>c.date===d).sort((a,b)=>tmin(a.match)-tmin(b.match));const dom=L.filter(c=>c.home),ext=L.filter(c=>!c.home);
    const x=new Date(d+"T12:00"),jour=JL[x.getDay()],lab=jour+" "+x.getDate()+" "+MOIS[x.getMonth()];
    const when=d===today?"Aujourd'hui":(new Date(d+"T12:00")-new Date(today+"T12:00"))/864e5===1?"Demain":"Ce "+jour;
    const txt=`ALERTE MATCHS · ${lab.toUpperCase()}\n${L.length} match${L.length>1?"s":""} pour l'AS La Madeleine !\n`+(dom.length?`\nÀ DOMICILE, salle de La Madeleine :\n`+dom.map(c=>`· ${c.match} ${c.team} contre ${c.opp}`).join("\n")+"\n":"")+(ext.length?`\nÀ L'EXTÉRIEUR :\n`+ext.map(c=>`· ${c.match} ${c.team} chez ${c.opp}`).join("\n")+"\n":"")+`\nVenez nombreux encourager nos équipes ! Allez La Madeleine !`;
    return`<article class="wk"><div class="k">${esc(when)} · alerte matchs</div><h3>${esc(lab)} : ${L.length} match${L.length>1?"s":""}</h3><div class="cols">${dom.length?`<div><h4>À domicile · salle de La Madeleine</h4><ul>${dom.map(c=>`<li><b>${esc(c.match)}</b>${esc(c.team)} contre ${esc(c.opp)}</li>`).join("")}</ul></div>`:""}${ext.length?`<div><h4>À l'extérieur</h4><ul>${ext.map(c=>`<li><b>${esc(c.match)}</b>${esc(c.team)} chez ${esc(c.opp)}</li>`).join("")}</ul></div>`:""}</div><p class="cta">${dom.length?"Venez nous soutenir à la salle !":"Soutenez nos équipes en déplacement !"}</p><button type="button" class="sm" data-copy="${esc(txt)}">Copier le texte pour Facebook / WhatsApp</button></article>`}).join("")}
function renderEvents(){
  $("wkPosts").innerHTML=weekPosts();
  const ev=S.events.filter(v=>v.kind!=="actu"),news=S.events.filter(v=>v.kind==="actu").sort((a,b)=>b.date.localeCompare(a.date));
  const row=v=>{const x=new Date(v.date+"T12:00");return`<div class="ev"><div class="d">${x.getDate()}<span>${MOIS[x.getMonth()]}</span></div><div><h3>${esc(v.title)}</h3><div class="note">${[v.place,v.owner&&("Responsable : "+v.owner)].filter(Boolean).map(esc).join(" · ")}</div>${v.notes?`<p style="margin:6px 0 0">${esc(v.notes)}</p>`:""}</div><button class="sm x" data-dele="${esc(v.id)}">Suppr.</button></div>`};
  const up=ev.filter(v=>v.date>=today).sort((a,b)=>a.date.localeCompare(b.date)),past=ev.filter(v=>v.date<today).sort((a,b)=>b.date.localeCompare(a.date));
  $("evList").innerHTML=(up.length?up.map(row).join(""):'<div class="empty">Aucun événement à venir.</div>')+(past.length?`<details><summary class="note">Événements passés (${past.length})</summary>${past.map(row).join("")}</details>`:"");
  $("newsList").innerHTML=news.length?news.map(v=>`<div class="news"><div class="note">${esc(dayLabel(v.date))}</div><h3>${esc(v.title)}</h3>${v.notes?`<p>${esc(v.notes)}</p>`:""}<button class="sm x" data-dele="${esc(v.id)}">Suppr.</button></div>`).join(""):'<div class="empty">Pas encore d\'actu publiée.</div>'}
$("v-evenements").addEventListener("click",async e=>{const c=e.target.closest("[data-copy]");if(c){try{await navigator.clipboard.writeText(c.dataset.copy);toast("Texte copié : collez-le sur Facebook ou WhatsApp")}catch{toast("Copie impossible sur cet appareil")}return}
  const b=e.target.closest("[data-dele]");if(b){b.disabled=true;await safe(deleteDoc(doc(db,"events",b.dataset.dele)))}});
$("evForm").onsubmit=async e=>{e.preventDefault();
  if(await safe(addDoc(collection(db,"events"),{kind:$("e_kind").value,date:$("e_date").value,title:$("e_title").value.trim(),place:$("e_place").value.trim(),owner:$("e_owner").value.trim(),notes:$("e_notes").value.trim()}))!==false)e.target.reset()};

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
    S.events.filter(v=>v.date===ds&&v.kind!=="actu").forEach(v=>items.push(`<li class="k-ev">${esc(v.title)}</li>`));
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
  const order={pending:0,player:1,coach:2,staff:3,admin:4};
  const list=[...S.members].sort((a,b)=>(order[a.role]??0)-(order[b.role]??0)||(a.at||0)-(b.at||0));
  if(!list.length){$("memList").innerHTML='<div class="empty">Personne pour l\'instant.</div>';return}
  $("memList").innerHTML=list.map(m=>{const ps=linked(m).map(id=>S.pmap[id]||{id,prenom:"",nom:id,licence:id});return`<div class="mem"><div><b>${esc(m.name||m.email)}</b>${m.role==="pending"?' <span class="tag dom">À valider</span>':""}<small>${esc(m.email)}</small><div>${ps.map(p=>`<span class="lk">${esc((p.prenom+" "+p.nom).trim()+" · "+p.licence)}<button type="button" data-unlink="${esc(m.id)}" data-pid="${esc(p.id)}" aria-label="Retirer ce licencié">×</button></span>`).join("")}</div></div>
    <div class="acts"><input list="peopleList" data-link="${esc(m.id)}" placeholder="${ps.length?"Ajouter un autre licencié":"Relier à un licencié"}" aria-label="Ajouter un licencié" value="">${m.email===SUPER_ADMIN?'<span class="tag">Admin principal</span>':`<select data-mem="${esc(m.id)}" aria-label="Rôle"><option value="pending"${m.role==="pending"?" selected":""}>En attente</option><option value="player"${m.role==="player"?" selected":""}>Joueur</option><option value="coach"${m.role==="coach"?" selected":""}>Coach</option><option value="staff"${m.role==="staff"?" selected":""}>Staff</option><option value="admin"${m.role==="admin"?" selected":""}>Admin</option></select><button class="sm x" data-delm="${esc(m.id)}">Retirer</button>`}</div></div>`}).join("");
  const p=list.filter(m=>m.role==="pending").length;$("navMembres").textContent=p?`Membres (${p})`:"Membres";
}
$("memList").addEventListener("change",async e=>{const i=e.target.closest("[data-link]");if(!i)return;const lic=(i.value.split("·").pop()||"").trim();
  if(!i.value)return;if(!S.pmap[lic]){toast("Choisissez un licencié dans la liste");return}
  const m=S.members.find(x=>x.id===i.dataset.link);const upd={persons:arrayUnion(lic)};if(!m||!m.person)upd.person=lic;
  if(m&&m.person&&!(m.persons||[]).includes(m.person))upd.persons=arrayUnion(m.person,lic);
  if(await safe(updateDoc(doc(db,"members",i.dataset.link),upd))!==false)toast("Compte relié à "+S.pmap[lic].prenom+" "+S.pmap[lic].nom)});
$("memList").addEventListener("click",async e=>{const b=e.target.closest("[data-unlink]");if(!b)return;const m=S.members.find(x=>x.id===b.dataset.unlink);if(!m)return;
  const rest=linked(m).filter(id=>id!==b.dataset.pid);
  if(await safe(updateDoc(doc(db,"members",m.id),{persons:rest,person:rest[0]||null}))!==false)toast("Licencié retiré de ce compte")});
$("memList").onchange=async e=>{const s=e.target.closest("[data-mem]");if(s&&await safe(updateDoc(doc(db,"members",s.dataset.mem),{role:s.value}))!==false)toast("Rôle mis à jour")};
$("memList").onclick=async e=>{const b=e.target.closest("[data-delm]");if(b){b.disabled=true;await safe(deleteDoc(doc(db,"members",b.dataset.delm)))}};
