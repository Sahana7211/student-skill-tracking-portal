const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
let currentUser = null, subjectList = [], dashboard = null, authMode = "login";
let activeFilter = "All", taskFilter = "all", assessment = null, questionIndex = 0, answers = {};

const palette = {
  "C Programming":["#eeefff","#5447bd"], "C++":["#e6f5ff","#087eb5"], "Java":["#fff0e4","#d76d24"],
  "Python":["#e6f7ef","#19865f"], "JavaScript":["#fff8db","#9b7900"], "HTML & CSS":["#ffedf0","#d13a57"],
  "SQL & Databases":["#f0eaff","#7852c5"], "Data Structures":["#e5f7fa","#087d90"],
  "Web Development":["#e7f8eb","#208c4b"], "Git & GitHub":["#ffedf1","#bd3454"]
};
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function toast(msg,error=false){const t=$("#toast");t.textContent=msg;t.className="toast show"+(error?" error":"");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.className="toast",3200);}
async function api(url,options={}){const res=await fetch(url,{credentials:"same-origin",headers:{"Content-Type":"application/json",...(options.headers||{})},...options});let data={};try{data=await res.json()}catch{}if(!res.ok)throw new Error(data.error||"Something went wrong.");return data;}
function initials(name){return (name||"S").trim().split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase();}
function formatDate(value,opts={day:"numeric",month:"short",year:"numeric"}){if(!value)return "No due date";return new Date(value+"T12:00:00").toLocaleDateString(undefined,opts);}
function formatMoment(value){return new Date(value).toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"});}
function iconStyle(name){const [bg,fg]=palette[name]||["#f0edff","#6555ce"];return `background:${bg};color:${fg}`;}
function iconMarkup(s){return `<div class="subject-icon" style="${iconStyle(s.name)}">${esc(s.icon)}</div>`;}

async function init(){
  const me=await api("/api/me");
  if(me.user){currentUser=me.user;await showApp();}else showAuth();
  subjectList=await api("/api/subjects");
  $("#subjectCount").textContent=subjectList.length;
  $("#taskSubject").innerHTML=subjectList.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join("");
  renderSubjects(); setupEvents();
  $("#todayDate").textContent=new Date().toLocaleDateString(undefined,{weekday:"short",day:"numeric",month:"short"});
}
function showAuth(){ $("#authView").classList.remove("hidden");$("#appView").classList.add("hidden"); }
async function showApp(){
  $("#authView").classList.add("hidden");$("#appView").classList.remove("hidden");
  $("#sideName").textContent=currentUser.name;$("#sideAvatar").textContent=initials(currentUser.name);$("#topAvatar").textContent=initials(currentUser.name);
  $("#welcomeTitle").textContent=`Good to see you, ${currentUser.name.split(" ")[0]} ✨`;
  await refreshDashboard();navigate("overview");
}
function setAuthMode(mode){
  authMode=mode; $$(".auth-tab").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode));
  $("#nameField").classList.toggle("hidden",mode!=="register");
  $("#authHeading").innerHTML=mode==="login"?'<h2>Welcome back</h2><p class="muted">Pick up where your learning left off.</p>':'<h2>Create your space</h2><p class="muted">Start tracking your growth today.</p>';
  $("#authSubmit").innerHTML=mode==="login"?'Sign in <span>→</span>':'Create account <span>→</span>';
  $("#password").autocomplete=mode==="login"?"current-password":"new-password";$("#authError").textContent="";
}
function setupEvents(){
  $$(".auth-tab").forEach(b=>b.addEventListener("click",()=>setAuthMode(b.dataset.mode)));
  $("#authForm").addEventListener("submit",async e=>{
    e.preventDefault();$("#authError").textContent="";
    const payload={email:$("#email").value,password:$("#password").value};
    if(authMode==="register")payload.name=$("#name").value;
    try{const data=await api(`/api/${authMode}`,{method:"POST",body:JSON.stringify(payload)});currentUser=data.user;await showApp();}
    catch(err){$("#authError").textContent=err.message;}
  });
  $$(".nav-item").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.page)));
  $$("[data-goto]").forEach(b=>b.addEventListener("click",()=>navigate(b.dataset.goto)));
  $("#logoutBtn").addEventListener("click",async()=>{await api("/api/logout",{method:"POST"});currentUser=null;dashboard=null;$("#authForm").reset();setAuthMode("login");showAuth();});
  $("#subjectSearch").addEventListener("input",renderSubjects);
  $("#categoryFilters").addEventListener("click",e=>{const b=e.target.closest("[data-filter]");if(!b)return;activeFilter=b.dataset.filter;$$(".filter-chip").forEach(x=>x.classList.toggle("active",x===b));renderSubjects();});
  $("#openTaskModal").addEventListener("click",()=>{ $("#taskModal").classList.remove("hidden");$("#taskError").textContent="";});
  $("#closeTaskModal").addEventListener("click",closeTaskModal);
  $("#taskModal").addEventListener("click",e=>{if(e.target===$("#taskModal"))closeTaskModal();});
  $("#taskForm").addEventListener("submit",async e=>{e.preventDefault();try{await api("/api/tasks",{method:"POST",body:JSON.stringify({title:$("#taskTitle").value,subject:$("#taskSubject").value,dueDate:$("#taskDue").value})});closeTaskModal();$("#taskForm").reset();await refreshDashboard();renderTasks();toast("Task added. One step closer!");}catch(err){$("#taskError").textContent=err.message;}});
  $$(".task-tab").forEach(b=>b.addEventListener("click",()=>{taskFilter=b.dataset.taskFilter;$$(".task-tab").forEach(x=>x.classList.toggle("active",x===b));renderTasks();}));
  $("#taskList").addEventListener("click",async e=>{
    const row=e.target.closest("[data-task-id]");if(!row)return;const id=row.dataset.taskId;
    try{if(e.target.closest("[data-toggle-task]")){const task=dashboard.tasks.find(t=>t.id===id);await api(`/api/tasks/${id}`,{method:"PATCH",body:JSON.stringify({completed:!task.completed})});await refreshDashboard();renderTasks();}
    else if(e.target.closest("[data-delete-task]")){await api(`/api/tasks/${id}`,{method:"DELETE"});await refreshDashboard();renderTasks();toast("Task removed.");}}catch(err){toast(err.message,true);}
  });
  $("#miniTasks").addEventListener("click",async e=>{const row=e.target.closest("[data-task-id]");if(!row)return;const task=dashboard.tasks.find(t=>t.id===row.dataset.taskId);if(!task)return;try{await api(`/api/tasks/${task.id}`,{method:"PATCH",body:JSON.stringify({completed:!task.completed})});await refreshDashboard();}catch(err){toast(err.message,true);}});
  $("#featuredSubjects").addEventListener("click",e=>{const card=e.target.closest("[data-subject]");if(card)startAssessment(card.dataset.subject);});
  $("#subjectGrid").addEventListener("click",e=>{const b=e.target.closest("[data-assess]");if(b)startAssessment(b.dataset.assess);});
  $("#closeAssessment").addEventListener("click",closeAssessment);$("#assessmentModal").addEventListener("click",e=>{if(e.target===$("#assessmentModal"))closeAssessment();});
  $("#assessmentContent").addEventListener("click",e=>{
    const opt=e.target.closest("[data-answer]");if(opt){answers[assessment.questions[questionIndex].id]=Number(opt.dataset.answer);renderQuestion();}
    if(e.target.closest("[data-next]")){if(answers[assessment.questions[questionIndex].id]===undefined){toast("Choose an answer to continue.",true);return;}if(questionIndex<assessment.questions.length-1){questionIndex++;renderQuestion();}else submitAssessment();}
    if(e.target.closest("[data-prev]")){if(questionIndex>0){questionIndex--;renderQuestion();}}
    if(e.target.closest("[data-review-subjects]")){closeAssessment();navigate("subjects");}
    if(e.target.closest("[data-show-certificate]")){const id=e.target.closest("[data-show-certificate]").dataset.showCertificate;closeAssessment();showCertificate(id);}
  });
  $("#closeCertificate").addEventListener("click",()=>$("#certificateModal").classList.add("hidden"));
  $("#certificateModal").addEventListener("click",e=>{if(e.target===$("#certificateModal"))$("#certificateModal").classList.add("hidden");if(e.target.closest("[data-print-cert]"))window.print();});
  $("#certificateGrid").addEventListener("click",e=>{const b=e.target.closest("[data-certificate]");if(b)showCertificate(b.dataset.certificate);});
}
function closeTaskModal(){$("#taskModal").classList.add("hidden");}
function navigate(page){
  const names={overview:"Overview",subjects:"Skill library",tasks:"My tasks",certificates:"Certificates"};
  $$(".page").forEach(p=>p.classList.add("hidden"));$(`#${page}Page`).classList.remove("hidden");
  $$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.page===page));$("#pageCrumb").textContent=names[page]||"Overview";
  if(page==="tasks")renderTasks();if(page==="certificates")renderCertificates();window.scrollTo({top:0,behavior:"smooth"});
}
async function refreshDashboard(){
  dashboard=await api("/api/dashboard");
  const s=dashboard.stats;
  $("#statTasks").innerHTML=`${s.completedTasks} <small>/ ${s.totalTasks}</small>`;
  $("#taskProgress").style.width=(s.totalTasks?s.completedTasks/s.totalTasks*100:0)+"%";
  $("#statPassed").textContent=s.passedAssessments;$("#statCerts").textContent=s.certificates;$("#statAverage").innerHTML=`${s.averageScore}<small>%</small>`;
  renderFeatured();renderMiniTasks();renderRecent();renderSubjects();renderTasks();renderCertificates();
}
function renderFeatured(){
  $("#featuredSubjects").innerHTML=subjectList.slice(0,4).map(s=>`<div class="featured-item" data-subject="${s.id}">${iconMarkup(s)}<div><strong>${esc(s.name)}</strong><small>25 questions · Assessment</small></div><span class="featured-arrow">↗</span></div>`).join("");
}
function renderMiniTasks(){
  const tasks=dashboard.tasks.slice(0,4);
  $("#miniTasks").innerHTML=tasks.length?tasks.map(t=>`<div class="mini-task" data-task-id="${t.id}"><button class="check-circle ${t.completed?"done":""}" data-toggle-task>${t.completed?"✓":""}</button><span class="mini-task-text ${t.completed?"done":""}">${esc(t.title)}</span><small>${esc(subjectList.find(s=>s.id===t.subject)?.name||"")}</small></div>`).join(""):'<div class="empty-state">Your checklist is a blank canvas.<br>Add one small task to get started.</div>';
}
function renderRecent(){
  const results=dashboard.results.slice(0,3);
  $("#recentResults").innerHTML=results.length?results.map(r=>`<div class="result-row"><div class="result-symbol">✧</div><div class="result-info"><strong>${esc(r.subjectName)}</strong><small>${formatMoment(r.completedAt)} · ${r.correct}/${r.total} correct</small></div><span class="score-pill ${r.passed?"pass":"fail"}">${r.score}% · ${r.passed?"Passed":"Try again"}</span></div>`).join(""):'<div class="empty-state">No assessment attempts yet.<br>Your first result is waiting in the skill library.</div>';
}
function renderSubjects(){
  if(!subjectList.length)return;
  const q=($("#subjectSearch")?.value||"").toLowerCase().trim();
  const filtered=subjectList.filter(s=>(activeFilter==="All"||s.category===activeFilter)&&`${s.name} ${s.description} ${s.category}`.toLowerCase().includes(q));
  $("#subjectGrid").innerHTML=filtered.length?filtered.map(s=>{
    const best=dashboard?.results.filter(r=>r.subjectId===s.id).sort((a,b)=>b.score-a.score)[0];
    return `<article class="subject-card"><div class="subject-card-top">${iconMarkup(s)}<span class="subject-tag">${esc(s.category)}</span></div><h3>${esc(s.name)}</h3><p>${esc(s.description)}</p><div class="subject-meta"><span>◷ ${s.questionCount} questions</span><strong>${best?`Best score ${best.score}%`:"Assessment · 25 Qs"}</strong></div><button class="btn btn-primary" data-assess="${s.id}">${best?.passed?"Retake assessment":"Start assessment"} <span>→</span></button></article>`;
  }).join(""):'<div class="empty-state">No skills match your search. Try another term.</div>';
}
function renderTasks(){
  if(!dashboard)return;
  const tasks=dashboard.tasks;const done=tasks.filter(t=>t.completed).length;
  $("#taskDoneCount").textContent=done;$("#taskRemaining").textContent=tasks.length-done;$("#allTaskCount").textContent=tasks.length;
  $("#taskSummaryProgress").style.width=(tasks.length?done/tasks.length*100:0)+"%";
  const filtered=tasks.filter(t=>taskFilter==="all"||(taskFilter==="active"&&!t.completed)||(taskFilter==="completed"&&t.completed));
  $("#taskList").innerHTML=filtered.length?filtered.map(t=>`<div class="task-row" data-task-id="${t.id}"><button class="check-circle ${t.completed?"done":""}" data-toggle-task>${t.completed?"✓":""}</button><div class="task-details"><strong class="${t.completed?"task-done":""}">${esc(t.title)}</strong><small>${esc(subjectList.find(s=>s.id===t.subject)?.name||"")} · Added ${formatMoment(t.createdAt)}</small></div><span class="task-due">${t.dueDate?`Due ${formatDate(t.dueDate)}`:"No due date"}</span><button class="task-delete" title="Delete task" data-delete-task>×</button></div>`).join(""):'<div class="empty-state">Nothing here just yet.<br>Add a task and make your next move.</div>';
}
function renderCertificates(){
  if(!dashboard)return;
  const certs=dashboard.results.filter(r=>r.passed);
  $("#certificateGrid").innerHTML=certs.length?certs.map(r=>`<article class="certificate-card"><div class="certificate-mini"><span>✧</span><small>CERTIFIED</small></div><div class="certificate-card-info"><h3>${esc(r.subjectName)}</h3><p>Earned ${formatMoment(r.completedAt)} · Score ${r.score}%</p><span class="score-pill pass">✓ Assessment passed</span><div class="certificate-card-actions"><button data-certificate="${r.id}">View certificate ↗</button><button data-certificate="${r.id}">Print / Save PDF</button></div></div></article>`).join(""):'<div class="empty-state">Your first certificate is closer than you think.<br>Pass any subject assessment with 60% or more to earn one.</div>';
}
async function startAssessment(subjectId){
  try{assessment=await api(`/api/assessment/${subjectId}`);assessment.subjectId=subjectId;questionIndex=0;answers={};$("#assessmentModal").classList.remove("hidden");renderQuestion();}
  catch(err){toast(err.message,true);}
}
function renderQuestion(){
  const q=assessment.questions[questionIndex],picked=answers[q.id];
  const progress=(questionIndex/assessment.questions.length)*100;
  $("#assessmentContent").innerHTML=`<div class="assessment-head"><div class="eyebrow dark-eyebrow">${esc(assessment.subject.name.toUpperCase())} · SKILL CHECK</div><h2>${esc(assessment.subject.name)} assessment</h2><p class="muted">Take your time. Choose the best answer for each question.</p><div class="assessment-progress"><span style="width:${progress}%"></span></div><div class="question-count">QUESTION ${questionIndex+1} OF ${assessment.total}</div><div class="question-text">${esc(q.prompt)}</div><div class="answer-options">${q.options.map((o,i)=>`<button class="answer-option ${picked===i?"selected":""}" data-answer="${i}"><span class="option-letter">${"ABCD"[i]}</span><span>${esc(o)}</span></button>`).join("")}</div><div class="assessment-foot"><span class="muted">${Object.keys(answers).length} of ${assessment.total} answered · Pass mark 60%</span><div>${questionIndex>0?'<button class="btn" style="background:#f3f1f8;color:#625e70;margin-right:6px" data-prev>← Back</button>':""}<button class="btn btn-primary" data-next>${questionIndex===assessment.total-1?"Submit assessment":"Next question →"}</button></div></div></div>`;
}
async function submitAssessment(){
  const missing=assessment.questions.find(q=>answers[q.id]===undefined);
  if(missing){questionIndex=assessment.questions.indexOf(missing);renderQuestion();toast("Please answer every question before submitting.",true);return;}
  const btn=$("[data-next]",$("#assessmentContent"));if(btn){btn.disabled=true;btn.textContent="Checking…";}
  try{
    const data=await api(`/api/assessment/${assessment.subjectId}/submit`,{method:"POST",body:JSON.stringify({answers})});
    const r=data.result;await refreshDashboard();
    $("#assessmentContent").innerHTML=`<div class="result-screen"><div class="result-medal ${r.passed?"":"fail"}">${r.passed?"✧":"↻"}</div><div class="eyebrow dark-eyebrow">${r.passed?"MILESTONE UNLOCKED":"EVERY ATTEMPT TEACHES YOU"}</div><h2>${r.passed?"You did it!":"Keep growing."}</h2><div class="result-score">${r.score}%</div><p>${r.passed?`Congratulations! You passed the ${esc(r.subjectName)} assessment with ${r.correct} out of ${r.total} correct answers. Your certificate is ready.`:`You got ${r.correct} out of ${r.total} answers correct. You need 60% to pass. Review the subject and give it another try — you've got this.`}</p><div class="result-actions">${r.passed?`<button class="btn btn-primary" data-show-certificate="${r.id}">View certificate ↗</button>`:""}<button class="btn" style="background:#f0eef7;color:#6254c7" data-review-subjects>Back to skills</button></div></div>`;
    toast(r.passed?"Assessment passed — certificate unlocked!":"Assessment saved. Try again when you're ready.");
  }catch(err){toast(err.message,true);renderQuestion();}
}
function closeAssessment(){$("#assessmentModal").classList.add("hidden");assessment=null;}
async function showCertificate(resultId){
  try{
    const {result,user}=await api(`/api/certificate/${resultId}`);
    const date=formatMoment(result.completedAt);
    $("#certificateContent").innerHTML=`<div class="certificate-paper"><div class="certificate-inner"><div class="cert-rosette">✳</div><div class="cert-small">SKILLSPRING · LEARNING ACHIEVEMENT</div><h2>CERTIFICATE<br>OF COMPLETION</h2><div class="cert-sub">This certificate is proudly presented to</div><div class="cert-name">${esc(user.name)}</div><p class="cert-description">for successfully completing the skill assessment in</p><div class="cert-subject">${esc(result.subjectName)}</div><p class="cert-description">demonstrating knowledge and commitment to continuous learning with a score of <strong>${result.score}%</strong>.</p><div class="certificate-meta"><div>DATE AWARDED<strong>${date}</strong></div><div>ASSESSMENT SCORE<strong>${result.score}% · ${result.correct}/${result.total}</strong></div><div>CERTIFICATE ID<strong>${esc(result.certificateCode)}</strong></div></div><div class="cert-seal">✧</div></div></div><div class="cert-modal-actions"><button class="btn btn-primary" data-print-cert>Print / Save as PDF ↗</button><button class="btn" style="background:#e9e7f0;color:#625e70" id="closeCertAction">Close</button></div>`;
    $("#certificateModal").classList.remove("hidden");
    $("#closeCertAction").addEventListener("click",()=>$("#certificateModal").classList.add("hidden"));
  }catch(err){toast(err.message,true);}
}
init().catch(err=>{console.error(err);toast("Could not load the portal. Please refresh.",true);});
