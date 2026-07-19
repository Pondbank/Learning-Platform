/* ==========================================================
   AI LMS STUDIO — FRONTEND
   ========================================================== */

const state = { user: null, token: null, course: null, lesson: null, quiz: null, result: null, config: null };
let loadingCount = 0;
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

document.addEventListener("DOMContentLoaded", init);

async function init() {
  initTheme();
  bindStatic();
  await loadConfig();
  const token = ls("lmsToken");
  const userId = ls("lmsUserId");
  if (token && userId) {
    state.token = token;
    state.user = { userId, name: ls("lmsUserName") || "Learner", email: ls("lmsUserEmail") || "" };
    enterApp();
  } else {
    showView("login");
  }
}

/* ---- Config ---- */
async function loadConfig() {
  try {
    const cfg = await api("getConfig", {}, true);
    state.config = cfg;
    if (cfg.googleSignIn && cfg.googleClientId) setupGoogleSignIn(cfg.googleClientId);
    if (cfg.turnstile && cfg.turnstileSiteKey) setupTurnstile(cfg.turnstileSiteKey);
    if (cfg.requireInvite) $("#invite-field").classList.remove("hidden");
  } catch (e) {
    // Fallback: use config.js values
    if (CONFIG.GOOGLE_CLIENT_ID) setupGoogleSignIn(CONFIG.GOOGLE_CLIENT_ID);
    if (CONFIG.TURNSTILE_SITE_KEY) setupTurnstile(CONFIG.TURNSTILE_SITE_KEY);
  }
}

function setupGoogleSignIn(clientId) {
  $("#google-signin-container").classList.remove("hidden");
  $("#auth-divider").classList.remove("hidden");
  const el = $("#g_id_onload");
  el.setAttribute("data-client_id", clientId);
  el.setAttribute("data-callback", "handleGoogleCredential");
  window.handleGoogleCredential = async (res) => {
    try {
      const data = await api("authGoogle", {
        idToken: res.credential,
        captchaToken: getTurnstileToken(),
        inviteCode: $("#login-invite").value.trim(),
        userAgent: navigator.userAgent
      }, true);
      completeLogin(data);
    } catch (e) { /* toast shown */ }
  };
}

function setupTurnstile(siteKey) {
  $("#turnstile-container").classList.remove("hidden");
  const render = () => {
    if (window.turnstile) {
      turnstile.render("#turnstile-container", { sitekey: siteKey, theme: document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light" });
    } else { setTimeout(render, 500); }
  };
  render();
}

function getTurnstileToken() {
  try { return window.turnstile ? turnstile.getResponse() : ""; } catch (e) { return ""; }
}

/* ---- Theme ---- */
function initTheme() {
  const t = ls("theme") || (matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", t);
  updateThemeIcon();
}
function toggleTheme() {
  const n = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", n);
  lss("theme", n);
  updateThemeIcon();
}
function updateThemeIcon() { $("#theme-toggle").textContent = document.documentElement.getAttribute("data-theme") === "dark" ? "☀️" : "🌙"; }

/* ---- Storage ---- */
function ls(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lss(k, v) { try { localStorage.setItem(k, v); } catch {} }
function lsr(k) { try { localStorage.removeItem(k); } catch {} }

/* ---- API ---- */
async function api(action, params = {}, noAuth = false) {
  showLoading(action.includes("generate") || action.includes("submit") ? "AI is thinking..." : "Working...");
  try {
    const body = { action, params };
    if (!noAuth && state.token) body.token = state.token;
    const res = await fetch(CONFIG.API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
      redirect: "follow",
      cache: "no-store"
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Request failed.");
    return data.data;
  } catch (err) {
    showToast(err.message || "Network error.", true);
    throw err;
  } finally { hideLoading(); }
}

/* ---- UI helpers ---- */
function showView(n) { $$(".view").forEach(v => v.classList.add("hidden")); $(`#view-${n}`).classList.remove("hidden"); scrollTo(0, 0); }
function showLoading(t = "Working...") { loadingCount++; $("#loading").classList.remove("hidden"); $("#loading-text").textContent = t; }
function hideLoading() { loadingCount = Math.max(0, loadingCount - 1); if (!loadingCount) $("#loading").classList.add("hidden"); }
function showToast(m, err = false) { const t = $("#toast"); t.textContent = m; t.className = err ? "toast error show" : "toast show"; setTimeout(() => t.classList.remove("show"), 4500); }
function esc(v) { return v == null ? "" : String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }
function textHtml(v) { return esc(v).replace(/\n/g, "<br>"); }
function listHtml(items) { return items && items.length ? `<ul>${items.map(i => `<li>${textHtml(i)}</li>`).join("")}</ul>` : ""; }
function emptyBox(m) { return `<div class="empty">${esc(m)}</div>`; }
function fmtDate(v) { const d = new Date(v); return isNaN(d) ? esc(v || "") : d.toLocaleString(); }
function toggleBox(id) { const e = document.getElementById(id); if (e) e.classList.toggle("hidden"); }

/* ---- Static bindings ---- */
function bindStatic() {
  $("#theme-toggle").addEventListener("click", toggleTheme);
  $("#send-code-btn").addEventListener("click", sendMagicLink);
  $("#verify-code-btn").addEventListener("click", verifyMagicLink);
  $("#resend-btn").addEventListener("click", sendMagicLink);
  $("#login-code").addEventListener("keyup", e => { if (e.key === "Enter") verifyMagicLink(); });
  $("#login-email").addEventListener("keyup", e => { if (e.key === "Enter") sendMagicLink(); });
  $("#nav-dashboard").addEventListener("click", loadDashboard);
  $("#nav-generate").addEventListener("click", () => showView("generate"));
  $("#nav-logout").addEventListener("click", logout);
  $("#dashboard-new").addEventListener("click", () => showView("generate"));
  $("#gen-back").addEventListener("click", loadDashboard);
  $("#gen-btn").addEventListener("click", generateCourse);
}

/* ---- Auth ---- */
async function sendMagicLink() {
  const email = $("#login-email").value.trim();
  if (!email || email.indexOf("@") < 0) { showToast("Enter a valid email.", true); return; }
  try {
    await api("sendMagicLink", { email, captchaToken: getTurnstileToken() }, true);
    $("#magic-link-form").classList.add("hidden");
    $("#verify-code-form").classList.remove("hidden");
    showToast("Code sent to your email.");
  } catch {}
}

async function verifyMagicLink() {
  const email = $("#login-email").value.trim();
  const code = $("#login-code").value.trim();
  if (!email || !code) { showToast("Enter email and code.", true); return; }
  try {
    const data = await api("verifyMagicLink", {
      email, code, captchaToken: getTurnstileToken(),
      inviteCode: $("#login-invite").value.trim(), userAgent: navigator.userAgent
    }, true);
    completeLogin(data);
  } catch {}
}

function completeLogin(data) {
  state.user = data.user;
  state.token = data.session.token;
  lss("lmsUserId", data.user.userId);
  lss("lmsUserName", data.user.name);
  lss("lmsUserEmail", data.user.email);
  lss("lmsToken", data.session.token);
  enterApp();
}

async function logout() {
  try { await api("logout", {}); } catch {}
  state.user = null; state.token = null;
  ["lmsUserId","lmsUserName","lmsUserEmail","lmsToken"].forEach(lsr);
  location.reload();
}

function enterApp() {
  ["nav-dashboard","nav-generate","nav-logout","nav-user"].forEach(id => $(`#${id}`).classList.remove("hidden"));
  $("#nav-user").textContent = state.user?.name || "";
  loadDashboard();
}

/* ---- Dashboard ---- */
async function loadDashboard() {
  if (!state.user) { showView("login"); return; }
  try {
    const d = await api("getDashboard", { userId: state.user.userId });
    renderDashboard(d);
    showView("dashboard");
  } catch {}
}

function renderDashboard(d) {
  const name = (state.user?.name || "Learner").split(" ")[0];
  $("#dashboard-greeting").textContent = `Welcome back, ${name}`;
  $("#dashboard-stats").innerHTML = `
    <div class="stat"><strong>${esc(d.courses.length)}</strong><span>Courses</span></div>
    <div class="stat"><strong>${esc(d.completedLessons)}</strong><span>Lessons Done</span></div>
    <div class="stat"><strong>${esc(d.averageScore)}%</strong><span>Avg Quiz Score</span></div>
    <div class="stat"><strong>🔥 ${esc(d.streak)}</strong><span>Day Streak</span></div>`;
  const cb = $("#dashboard-continue");
  if (d.continueCourseId) { cb.classList.remove("hidden"); cb.onclick = () => openCourse(d.continueCourseId); }
  else cb.classList.add("hidden");
  const ce = $("#dashboard-courses");
  if (!d.courses?.length) { ce.innerHTML = emptyBox("No courses yet. Generate your first course!"); }
  else {
    ce.innerHTML = d.courses.map(c => `
      <div class="course-card">
        <h4>${esc(c.title)}</h4>
        <p class="muted">${esc(c.description || "")}</p>
        <div class="badge-row">
          <span class="badge">${esc(c.level || "course")}</span>
          <span class="badge">${esc(c.estimatedHours || "?")}h</span>
        </div>
        <button class="btn primary" data-oc="${esc(c.courseId)}">Open</button>
      </div>`).join("");
    $$("[data-oc]").forEach(b => b.addEventListener("click", () => openCourse(b.dataset.oc)));
  }
  const se = $("#dashboard-scores");
  if (!d.recentScores?.length) { se.innerHTML = emptyBox("No quiz attempts yet."); }
  else {
    se.innerHTML = `<div class="table-wrap"><table class="table"><thead><tr><th>Lesson</th><th>Score</th><th>Date</th></tr></thead><tbody>
      ${d.recentScores.map(s => `<tr><td>${esc(s.lessonTitle)}</td><td>${esc(s.score)}%</td><td>${fmtDate(s.createdAt)}</td></tr>`).join("")}
      </tbody></table></div>`;
  }
}

/* ---- Generate ---- */
async function generateCourse() {
  const prompt = $("#gen-prompt").value.trim();
  if (!prompt) { showToast("Enter a topic.", true); return; }
  try {
    const c = await api("generateCourse", {
      userId: state.user.userId, prompt,
      level: $("#gen-level").value,
      timeAvailable: $("#gen-time").value,
      learningStyle: $("#gen-style").value
    });
    showToast("Course generated!");
    openCourse(c.courseId);
  } catch {}
}

/* ---- Course ---- */
async function openCourse(id) {
  try {
    const c = await api("getCourseById", { courseId: id, userId: state.user.userId });
    state.course = c;
    renderCourse(c);
    showView("course");
  } catch {}
}

function renderCourse(c) {
  const mods = c.structure?.modules || [];
  let h = `<button id="course-back" class="btn">← Dashboard</button>
    <div class="card" style="margin:16px 0">
      <div class="eyebrow">Course</div>
      <h2>${esc(c.title)}</h2>
      <p class="muted">${textHtml(c.description || "")}</p>
      <div class="badge-row">
        <span class="badge">${esc(c.level || "")}</span>
        <span class="badge">${esc(c.estimatedHours || "?")}h</span>
        <span class="badge success">${esc(c.progressPercent || 0)}% complete</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${c.progressPercent || 0}%"></div></div>
    </div>`;
  if (!mods.length) h += emptyBox("No modules.");
  else h += mods.map((m, mi) => `
    <div class="panel">
      <div class="panel-head"><h3>Module ${mi+1}: ${esc(m.title)}</h3></div>
      ${(m.lessons||[]).map((l, li) => {
        const done = c.completedKeys?.indexOf(`${m.title}::${l.title}`) >= 0;
        return `<div class="lesson-item"><div><strong>${esc(l.title)}</strong><p>${esc(l.summary||"")}</p></div>
          <button class="btn ${done?"":"primary"}" data-mi="${mi}" data-li="${li}">${done?"Review":"Start"}</button></div>`;
      }).join("")}
    </div>`).join("");
  $("#course-content").innerHTML = h;
  $("#course-back").addEventListener("click", loadDashboard);
  $$("[data-mi]").forEach(b => b.addEventListener("click", () => {
    const m = state.course.structure.modules[+b.dataset.mi];
    const l = m.lessons[+b.dataset.li];
    openLesson(m.title, l.title, l.summary || "");
  }));
}

/* ---- Lesson ---- */
async function openLesson(mt, lt, ls_) {
  try {
    const l = await api("generateLesson", { userId: state.user.userId, courseId: state.course.courseId, moduleTitle: mt, lessonTitle: lt, lessonSummary: ls_ });
    state.lesson = l;
    renderLesson(l);
    showView("lesson");
  } catch {}
}

function renderLesson(l) {
  const h = `<button id="lesson-back" class="btn">← Course</button>
    <div class="panel" style="margin-top:16px">
      <div class="eyebrow">Lesson</div>
      <h2>${esc(l.title||l.lessonTitle)}</h2>
      <div class="badge-row"><span class="badge">${esc(l.moduleTitle)}</span>${l.completed?'<span class="badge success">✓ Completed</span>':""}</div>
      <div class="lesson-text">${textHtml(l.content)}</div>
      ${l.examples?.length ? `<h4>Examples</h4>${listHtml(l.examples)}` : ""}
      ${l.commonMistakes?.length ? `<h4>Common Mistakes</h4>${listHtml(l.commonMistakes)}` : ""}
      <h4>Practice Exercise</h4><div class="note">${textHtml(l.exercise||"No exercise.")}</div>
      <div class="toolbar"><button id="hint-btn" class="btn">Show Hint</button><button id="solution-btn" class="btn">Show Solution</button></div>
      <div id="hint-box" class="hidden note">${textHtml(l.hint||"No hint.")}</div>
      <div id="solution-box" class="hidden note">${textHtml(l.solution||"No solution.")}</div>
      ${l.summary ? `<h4>Summary</h4><div class="note">${textHtml(l.summary)}</div>` : ""}
      <div class="toolbar">
        <button id="complete-btn" class="btn ${l.completed?"":"primary"}">${l.completed?"Completed":"Complete Lesson"}</button>
        <button id="quiz-btn" class="btn primary">Generate Quiz</button>
      </div>
      <div class="notes-area">
        <h4>My Notes</h4>
        <textarea id="note-input" placeholder="Write notes about this lesson..."></textarea>
        <button id="save-note-btn" class="btn" style="margin-top:8px">Save Notes</button>
      </div>
      <div class="panel tutor" style="margin-top:22px">
        <div class="panel-head"><h3>AI Tutor</h3><p class="muted">Ask about this lesson.</p></div>
        <div id="tutor-messages" class="tutor-messages"></div>
        <div class="tutor-input">
          <input id="tutor-question" type="text" placeholder="Ask a question..."/>
          <button id="tutor-send" class="btn primary">Send</button>
        </div>
      </div>
    </div>`;
  $("#lesson-content").innerHTML = h;
  $("#lesson-back").addEventListener("click", () => openCourse(state.course.courseId));
  $("#hint-btn").addEventListener("click", () => toggleBox("hint-box"));
  $("#solution-btn").addEventListener("click", () => toggleBox("solution-box"));
  $("#complete-btn").addEventListener("click", completeLesson);
  $("#quiz-btn").addEventListener("click", openQuiz);
  $("#tutor-send").addEventListener("click", sendTutor);
  $("#tutor-question").addEventListener("keyup", e => { if (e.key === "Enter") sendTutor(); });
  $("#save-note-btn").addEventListener("click", saveNote);
  appendTutor("Tutor", "Ask me anything about this lesson.");
  loadNotes();
}

async function completeLesson() {
  if (!state.lesson || state.lesson.completed) return;
  try {
    await api("markLessonComplete", { userId: state.user.userId, courseId: state.lesson.courseId, lessonId: state.lesson.lessonId });
    state.lesson.completed = true;
    const b = $("#complete-btn"); b.textContent = "Completed"; b.classList.remove("primary");
    showToast("Lesson completed!");
  } catch {}
}

async function saveNote() {
  if (!state.lesson) return;
  try {
    await api("saveNote", { userId: state.user.userId, lessonId: state.lesson.lessonId, content: $("#note-input").value });
    showToast("Notes saved.");
  } catch {}
}

async function loadNotes() {
  if (!state.lesson) return;
  try {
    const n = await api("getNotes", { userId: state.user.userId, lessonId: state.lesson.lessonId });
    if (n && $("#note-input")) $("#note-input").value = n;
  } catch {}
}

/* ---- Tutor ---- */
async function sendTutor() {
  if (!state.lesson) return;
  const inp = $("#tutor-question"), q = inp.value.trim();
  if (!q) return;
  appendTutor("You", q); inp.value = "";
  try { const r = await api("askTutor", { userId: state.user.userId, lessonId: state.lesson.lessonId, question: q }); appendTutor("Tutor", r.answer); } catch {}
}

function appendTutor(sender, msg) {
  const el = $("#tutor-messages"); if (!el) return;
  const d = document.createElement("div");
  d.className = `tutor-msg ${sender === "You" ? "user" : "ai"}`;
  d.innerHTML = `<strong>${esc(sender)}</strong><br>${textHtml(msg)}`;
  el.appendChild(d); el.scrollTop = el.scrollHeight;
}

/* ---- Quiz ---- */
async function openQuiz() {
  if (!state.lesson) return;
  try {
    const q = await api("generateQuiz", { userId: state.user.userId, courseId: state.lesson.courseId, lessonId: state.lesson.lessonId });
    state.quiz = q; renderQuiz(q); showView("quiz");
  } catch {}
}

function renderQuiz(q) {
  const h = `<button id="quiz-back" class="btn">← Lesson</button>
    <div class="panel" style="margin-top:16px">
      <div class="eyebrow">Quiz</div>
      <h2>${esc(state.lesson.title||state.lesson.lessonTitle)}</h2>
      <div id="quiz-form">${q.questions.map((q, i) => {
        let body = q.type === "short_answer"
          ? `<input type="text" class="quiz-answer" data-id="${esc(q.id)}" placeholder="Your answer"/>`
          : `<div class="options">${(q.type==="true_false"?["True","False"]:q.options||[]).map(o =>
              `<label class="option"><input type="radio" name="${esc(q.id)}" value="${esc(o)}"/><span>${esc(o)}</span></label>`).join("")}</div>`;
        return `<div class="question"><p><strong>${i+1}. ${esc(q.question)}</strong></p>${body}</div>`;
      }).join("")}</div>
      <div class="toolbar"><button id="submit-quiz" class="btn primary">Submit Quiz</button></div>
      <div id="quiz-result"></div>
    </div>`;
  $("#quiz-content").innerHTML = h;
  $("#quiz-back").addEventListener("click", () => showView("lesson"));
  $("#submit-quiz").addEventListener("click", submitQuiz);
}

async function submitQuiz() {
  if (!state.quiz || !state.lesson) return;
  const answers = state.quiz.questions.map(q => {
    if (q.type === "short_answer") { const i = document.querySelector(`.quiz-answer[data-id="${q.id}"]`); return i ? i.value : ""; }
    const c = document.querySelector(`input[name="${q.id}"]:checked`); return c ? c.value : "";
  });
  try {
    const r = await api("submitQuiz", { userId: state.user.userId, courseId: state.lesson.courseId, lessonId: state.lesson.lessonId, answers });
    state.result = r; renderResult(r);
  } catch {}
}

function renderResult(r) {
  let h = `<div class="panel" style="margin-top:16px">
    <div class="eyebrow">Result</div>
    <h3>Score: ${esc(r.score)}%</h3>
    <p class="muted">${esc(r.correct)} of ${esc(r.total)} correct</p>
    ${r.results.map(x => `<div class="result-item ${x.correct?"correct":"incorrect"}">
      <p><strong>${esc(x.question)}</strong></p>
      <p>Your answer: ${esc(x.userAnswer||"—")}</p>
      <p>Correct: ${esc(x.correctAnswer)}</p>
      <p>${textHtml(x.explanation)}</p></div>`).join("")}
    ${r.score < 70 ? `<button id="review-btn" class="btn primary" style="margin-top:14px">Generate Review</button>` : ""}
    <div id="review-area"></div></div>`;
  $("#quiz-result").innerHTML = h;
  if (r.score < 70) $("#review-btn").addEventListener("click", genReview);
}

async function genReview() {
  if (!state.result || !state.lesson) return;
  const weak = state.result.results.filter(r => !r.correct).map(r => r.question);
  const b = $("#review-btn"); if (b) b.disabled = true;
  try {
    const r = await api("generateReview", { userId: state.user.userId, courseId: state.lesson.courseId, lessonId: state.lesson.lessonId, weakTopics: weak, score: state.result.score });
    renderReview(r);
  } catch { if (b) b.disabled = false; }
}

function renderReview(r) {
  $("#review-area").innerHTML = `<div class="panel" style="margin-top:16px">
    <div class="eyebrow">Adaptive Review</div>
    <h4>Simplified Explanation</h4><div class="note">${textHtml(r.simplifiedExplanation)}</div>
    <h4>Review Lesson</h4><div class="note">${textHtml(r.reviewLesson)}</div>
    ${r.practiceQuestions?.length ? `<h4>Extra Practice</h4>${r.practiceQuestions.map((q,i) =>
      `<div class="question"><p><strong>${i+1}. ${esc(q.question)}</strong></p><p>Answer: ${esc(q.correctAnswer)}</p><p>${textHtml(q.explanation)}</p></div>`).join("")}` : ""}
  </div>`;
}
