/* ========================================
   AI LMS FRONTEND - COMPLETE LOGIC
   ======================================== */

const state = {
  user: null,
  token: null,
  course: null,
  lesson: null,
  quiz: null,
  result: null,
  config: null,
  stats: null
};

let loadingCount = 0;

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

document.addEventListener("DOMContentLoaded", init);

/* ========================================
   INITIALIZATION
   ======================================== */

async function init() {
  initTheme();
  bindStaticEvents();
  await loadConfig();
  
  const token = ls("lmsToken");
  const userId = ls("lmsUserId");
  
  if (token && userId) {
    state.token = token;
    state.user = {
      userId,
      name: ls("lmsUserName") || "Learner",
      email: ls("lmsUserEmail") || ""
    };
    await enterApp();
  } else {
    showView("login");
  }
}

/* ========================================
   CONFIG & AUTH SETUP
   ======================================== */

async function loadConfig() {
  try {
    const cfg = await api("getConfig", {}, true);
    state.config = cfg;
    
    if (cfg.googleSignIn && cfg.googleClientId) {
      setupGoogleSignIn(cfg.googleClientId);
    }
    
    if (cfg.turnstile && cfg.turnstileSiteKey) {
      setupTurnstile(cfg.turnstileSiteKey);
    }
    
    if (cfg.requireInvite) {
      $("#invite-field").classList.remove("hidden");
    }
  } catch (e) {
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
    } catch (e) {}
  };
}

function setupTurnstile(siteKey) {
  $("#turnstile-container").classList.remove("hidden");
  
  const render = () => {
    if (window.turnstile) {
      turnstile.render("#turnstile-container", {
        sitekey: siteKey,
        theme: document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light"
      });
    } else {
      setTimeout(render, 500);
    }
  };
  render();
}

function getTurnstileToken() {
  try {
    return window.turnstile ? turnstile.getResponse() : "";
  } catch (e) {
    return "";
  }
}

/* ========================================
   THEME
   ======================================== */

function initTheme() {
  const saved = ls("theme");
  const preferred = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  const theme = saved || preferred;
  
  document.documentElement.setAttribute("data-theme", theme);
  updateThemeIcon();
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  
  document.documentElement.setAttribute("data-theme", next);
  lss("theme", next);
  updateThemeIcon();
}

function updateThemeIcon() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  $("#theme-toggle").textContent = isDark ? "☀️" : "🌙";
}

/* ========================================
   LOCAL STORAGE
   ======================================== */

function ls(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}

function lss(k, v) {
  try { localStorage.setItem(k, v); } catch {}
}

function lsr(k) {
  try { localStorage.removeItem(k); } catch {}
}

/* ========================================
   API
   ======================================== */

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
    
    if (!data.success) {
      throw new Error(data.error || "Request failed");
    }
    
    return data.data;
  } catch (err) {
    showToast(err.message || "Network error", true);
    throw err;
  } finally {
    hideLoading();
  }
}

/* ========================================
   UI HELPERS
   ======================================== */

function showView(name) {
  $$(".view").forEach(v => v.classList.add("hidden"));
  $(`#view-${name}`).classList.remove("hidden");
  scrollTo(0, 0);
}

function showLoading(text = "Working...") {
  loadingCount++;
  $("#loading").classList.remove("hidden");
  $("#loading-text").textContent = text;
}

function hideLoading() {
  loadingCount = Math.max(0, loadingCount - 1);
  if (!loadingCount) $("#loading").classList.add("hidden");
}

function showToast(message, isError = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.className = isError ? "toast error show" : "toast success show";
  
  setTimeout(() => toast.classList.remove("show"), 4000);
}

function esc(v) {
  return v == null ? "" : String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textHtml(v) {
  return esc(v).replace(/\n/g, "<br>");
}

function listHtml(items) {
  return items && items.length 
    ? `<ul>${items.map(i => `<li>${textHtml(i)}</li>`).join("")}</ul>` 
    : "";
}

function emptyBox(message, icon = "📭") {
  return `<div class="empty"><div class="empty-icon">${icon}</div>${esc(message)}</div>`;
}

function fmtDate(v) {
  const d = new Date(v);
  return isNaN(d) ? esc(v || "") : d.toLocaleDateString();
}

/* ========================================
   EVENT BINDINGS
   ======================================== */

function bindStaticEvents() {
  // Theme
  $("#theme-toggle").addEventListener("click", toggleTheme);
  
  // Auth
  $("#send-code-btn").addEventListener("click", sendMagicLink);
  $("#verify-code-btn").addEventListener("click", verifyMagicLink);
  $("#resend-btn").addEventListener("click", sendMagicLink);
  $("#login-code").addEventListener("keyup", e => { if (e.key === "Enter") verifyMagicLink(); });
  $("#login-email").addEventListener("keyup", e => { if (e.key === "Enter") sendMagicLink(); });
  
  // Navigation
  $("#nav-dashboard").addEventListener("click", loadDashboard);
  $("#nav-generate").addEventListener("click", () => showView("generate"));
  $("#nav-logout").addEventListener("click", logout);
  
  // Dashboard
  $("#dashboard-new").addEventListener("click", () => showView("generate"));
  
  // Generate
  $("#gen-back").addEventListener("click", loadDashboard);
  $("#gen-btn").addEventListener("click", generateCourse);
}

/* ========================================
   AUTHENTICATION
   ======================================== */

async function sendMagicLink() {
  const email = $("#login-email").value.trim();
  
  if (!email || email.indexOf("@") < 0) {
    showToast("Enter a valid email", true);
    return;
  }
  
  try {
    await api("sendMagicLink", {
      email,
      captchaToken: getTurnstileToken()
    }, true);
    
    $("#magic-link-form").classList.add("hidden");
    $("#verify-code-form").classList.remove("hidden");
    showToast("Code sent to your email!");
  } catch (e) {}
}

async function verifyMagicLink() {
  const email = $("#login-email").value.trim();
  const code = $("#login-code").value.trim();
  
  if (!email || !code) {
    showToast("Enter email and code", true);
    return;
  }
  
  try {
    const data = await api("verifyMagicLink", {
      email,
      code,
      captchaToken: getTurnstileToken(),
      inviteCode: $("#login-invite").value.trim(),
      userAgent: navigator.userAgent
    }, true);
    
    completeLogin(data);
  } catch (e) {}
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
  try {
    await api("logout", {});
  } catch (e) {}
  
  state.user = null;
  state.token = null;
  
  ["lmsUserId", "lmsUserName", "lmsUserEmail", "lmsToken"].forEach(lsr);
  
  location.reload();
}

async function enterApp() {
  ["nav-dashboard", "nav-generate", "nav-logout", "nav-stats"].forEach(id => {
    $(`#${id}`).classList.remove("hidden");
  });
  
  await loadDashboard();
}

/* ========================================
   DASHBOARD
   ======================================== */

async function loadDashboard() {
  if (!state.user) {
    showView("login");
    return;
  }
  
  try {
    const data = await api("getDashboard", { userId: state.user.userId });
    state.stats = data;
    renderDashboard(data);
    showView("dashboard");
  } catch (e) {}
}

function renderDashboard(data) {
  const firstName = (state.user?.name || "Learner").split(" ")[0];
  $("#dashboard-greeting").textContent = `Hey ${firstName}! 👋`;
  $("#dashboard-subtitle").textContent = `${data.streak} day streak • ${data.completedLessons} lessons completed`;
  
  // Update streak pill
  $("#streak-count").textContent = data.streak;
  
  // Stats
  $("#dashboard-stats").innerHTML = `
    <div class="stat-card">
      <div class="stat-icon-large">📚</div>
      <div class="stat-value">${esc(data.courses.length)}</div>
      <div class="stat-label">Courses</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon-large">✅</div>
      <div class="stat-value">${esc(data.completedLessons)}</div>
      <div class="stat-label">Lessons Done</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon-large">🎯</div>
      <div class="stat-value">${esc(data.averageScore)}%</div>
      <div class="stat-label">Avg Quiz Score</div>
    </div>
    <div class="stat-card">
      <div class="stat-icon-large">🔥</div>
      <div class="stat-value">${esc(data.streak)}</div>
      <div class="stat-label">Day Streak</div>
    </div>
  `;
  
  // Continue button
  const cb = $("#dashboard-continue");
  if (data.continueCourseId) {
    cb.classList.remove("hidden");
    cb.onclick = () => openCourse(data.continueCourseId);
  } else {
    cb.classList.add("hidden");
  }
  
  // Achievements
  renderAchievements(data.achievements || []);
  
  // Courses
  const ce = $("#dashboard-courses");
  if (!data.courses?.length) {
    ce.innerHTML = emptyBox("No courses yet. Generate your first course!", "✨");
  } else {
    ce.innerHTML = data.courses.map(c => `
      <div class="course-card" data-course="${esc(c.courseId)}">
        <h4>${esc(c.title)}</h4>
        <p class="muted">${esc(c.description || "")}</p>
        <div class="course-meta">
          <span class="badge">${esc(c.level || "course")}</span>
          <span class="badge">${esc(c.estimatedHours || "?")}h</span>
        </div>
      </div>
    `).join("");
    
    $$("[data-course]").forEach(card => {
      card.addEventListener("click", () => openCourse(card.dataset.course));
    });
  }
  
  // Recent scores
  const se = $("#dashboard-scores");
  if (!data.recentScores?.length) {
    se.innerHTML = emptyBox("No quiz attempts yet", "📝");
  } else {
    se.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Lesson</th>
              <th>Score</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            ${data.recentScores.map(s => `
              <tr>
                <td>${esc(s.lessonTitle)}</td>
                <td><strong>${esc(s.score)}%</strong></td>
                <td>${fmtDate(s.createdAt)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }
}

function renderAchievements(achievements) {
  const grid = $("#achievements-grid");
  const count = $("#achievements-count");
  
  count.textContent = `${achievements.length} unlocked`;
  
  if (!achievements.length) {
    grid.innerHTML = emptyBox("Complete lessons to unlock achievements!", "🏆");
    return;
  }
  
  grid.innerHTML = achievements.map(a => `
    <div class="achievement-card">
      <div class="achievement-icon">${esc(a.icon)}</div>
      <div class="achievement-name">${esc(a.name)}</div>
      <div class="achievement-desc">${esc(a.description)}</div>
    </div>
  `).join("");
}

/* ========================================
   GENERATE COURSE
   ======================================== */

async function generateCourse() {
  const prompt = $("#gen-prompt").value.trim();
  
  if (!prompt) {
    showToast("Enter a topic to learn", true);
    return;
  }
  
  try {
    const course = await api("generateCourse", {
      userId: state.user.userId,
      prompt,
      level: $("#gen-level").value,
      timeAvailable: $("#gen-time").value,
      learningStyle: $("#gen-style").value
    });
    
    showToast("Course generated! 🎉");
    openCourse(course.courseId);
  } catch (e) {}
}

/* ========================================
   COURSE VIEW
   ======================================== */

async function openCourse(courseId) {
  try {
    const course = await api("getCourseById", {
      courseId,
      userId: state.user.userId
    });
    
    state.course = course;
    renderCourse(course);
    showView("course");
  } catch (e) {}
}

function renderCourse(course) {
  const mods = course.structure?.modules || [];
  
  let html = `
    <button id="course-back" class="btn ghost">← Back to Dashboard</button>
    
    <div class="panel" style="margin-top: 16px">
      <div class="eyebrow">Course</div>
      <h2>${esc(course.title)}</h2>
      <p class="muted">${textHtml(course.description || "")}</p>
      
      <div class="course-meta">
        <span class="badge">${esc(course.level || "")}</span>
        <span class="badge">${esc(course.estimatedHours || "?")} hours</span>
        <span class="badge success">${esc(course.progressPercent || 0)}% complete</span>
      </div>
      
      <div class="progress-container">
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${course.progressPercent || 0}%"></div>
        </div>
        <div class="progress-text">
          <span>${esc(course.completedCount || 0)} of ${esc(course.totalLessons || 0)} lessons</span>
          <span>${esc(course.progressPercent || 0)}%</span>
        </div>
      </div>
    </div>
  `;
  
  if (!mods.length) {
    html += emptyBox("No modules found", "📚");
  } else {
    html += mods.map((m, mi) => `
      <div class="panel">
        <h3>Module ${mi + 1}: ${esc(m.title)}</h3>
        ${(m.lessons || []).map((l, li) => {
          const done = course.completedKeys?.indexOf(`${m.title}::${l.title}`) >= 0;
          return `
            <div class="lesson-item ${done ? 'completed' : ''}" data-mi="${mi}" data-li="${li}">
              <div class="lesson-item-content">
                <div class="lesson-item-title">
                  ${done ? '✅' : '📖'} ${esc(l.title)}
                </div>
                <div class="lesson-item-summary">${esc(l.summary || "")}</div>
              </div>
              <button class="btn ${done ? 'ghost' : 'primary'} small">
                ${done ? 'Review' : 'Start'}
              </button>
            </div>
          `;
        }).join("")}
      </div>
    `).join("");
  }
  
  $("#course-content").innerHTML = html;
  
  $("#course-back").addEventListener("click", loadDashboard);
  
  $$("[data-mi]").forEach(item => {
    item.addEventListener("click", () => {
      const mi = +item.dataset.mi;
      const li = +item.dataset.li;
      const m = state.course.structure.modules[mi];
      const l = m.lessons[li];
      openLesson(m.title, l.title, l.summary || "");
    });
  });
}

/* ========================================
   LESSON VIEW
   ======================================== */

async function openLesson(moduleTitle, lessonTitle, lessonSummary) {
  try {
    const lesson = await api("generateLesson", {
      userId: state.user.userId,
      courseId: state.course.courseId,
      moduleTitle,
      lessonTitle,
      lessonSummary
    });
    
    state.lesson = lesson;
    renderLesson(lesson);
    showView("lesson");
  } catch (e) {}
}

function renderLesson(lesson) {
  const html = `
    <div class="lesson-container">
      <button id="lesson-back" class="btn ghost">← Back to Course</button>
      
      <div class="panel" style="margin-top: 16px">
        <div class="eyebrow">Lesson</div>
        <h2>${esc(lesson.title || lesson.lessonTitle)}</h2>
        <div class="course-meta">
          <span class="badge">${esc(lesson.moduleTitle)}</span>
          ${lesson.completed ? '<span class="badge success">✓ Completed</span>' : ''}
        </div>
        
        <div class="lesson-content">
          ${textHtml(lesson.content)}
        </div>
        
        ${lesson.keyPoints?.length ? `
          <div class="lesson-section">
            <h4>🎯 Key Points</h4>
            <ul class="key-points">
              ${lesson.keyPoints.map(p => `<li>${esc(p)}</li>`).join("")}
            </ul>
          </div>
        ` : ''}
        
        ${lesson.examples?.length ? `
          <div class="lesson-section">
            <h4>💡 Examples</h4>
            ${listHtml(lesson.examples)}
          </div>
        ` : ''}
        
        ${lesson.commonMistakes?.length ? `
          <div class="lesson-section">
            <h4>⚠️ Common Mistakes</h4>
            ${listHtml(lesson.commonMistakes)}
          </div>
        ` : ''}
        
        ${lesson.exercise ? `
          <div class="lesson-section">
            <h4>🎮 Practice Exercise</h4>
            <p>${textHtml(lesson.exercise)}</p>
            <button id="hint-btn" class="btn ghost small" style="margin-top: 12px">💡 Show Hint</button>
            <button id="solution-btn" class="btn ghost small" style="margin-top: 12px">✓ Show Solution</button>
            <div id="hint-box" class="hidden" style="margin-top: 12px; padding: 16px; background: var(--bg-secondary); border-radius: var(--radius-sm)">
              ${textHtml(lesson.hint || "No hint available")}
            </div>
            <div id="solution-box" class="hidden" style="margin-top: 12px; padding: 16px; background: var(--bg-secondary); border-radius: var(--radius-sm)">
              ${textHtml(lesson.solution || "No solution available")}
            </div>
          </div>
        ` : ''}
        
        ${lesson.summary ? `
          <div class="lesson-section">
            <h4>📝 Summary</h4>
            <p>${textHtml(lesson.summary)}</p>
          </div>
        ` : ''}
        
        <div style="display: flex; gap: 12px; margin-top: 24px; flex-wrap: wrap">
          <button id="complete-btn" class="btn ${lesson.completed ? 'ghost' : 'primary'} large">
            ${lesson.completed ? '✓ Completed' : '✓ Complete Lesson'}
          </button>
          <button id="quiz-btn" class="btn secondary large">📝 Take Quiz</button>
        </div>
      </div>
      
      <div class="tutor-container">
        <h3>🤖 AI Tutor</h3>
        <p class="muted">Ask questions about this lesson</p>
        <div id="tutor-messages" class="tutor-messages"></div>
        <div class="tutor-input">
          <input id="tutor-question" type="text" placeholder="Ask a question..."/>
          <button id="tutor-send" class="btn primary">Send</button>
        </div>
      </div>
    </div>
  `;
  
  $("#lesson-content").innerHTML = html;
  
  $("#lesson-back").addEventListener("click", () => openCourse(state.course.courseId));
  $("#hint-btn")?.addEventListener("click", () => $("#hint-box").classList.toggle("hidden"));
  $("#solution-btn")?.addEventListener("click", () => $("#solution-box").classList.toggle("hidden"));
  $("#complete-btn").addEventListener("click", completeLesson);
  $("#quiz-btn").addEventListener("click", openQuiz);
  $("#tutor-send").addEventListener("click", sendTutor);
  $("#tutor-question").addEventListener("keyup", e => { if (e.key === "Enter") sendTutor(); });
  
  appendTutor("Tutor", "Hi! Ask me anything about this lesson.");
}

async function completeLesson() {
  if (!state.lesson || state.lesson.completed) return;
  
  try {
    await api("markLessonComplete", {
      userId: state.user.userId,
      courseId: state.lesson.courseId,
      lessonId: state.lesson.lessonId
    });
    
    state.lesson.completed = true;
    
    const btn = $("#complete-btn");
    btn.textContent = "✓ Completed";
    btn.classList.remove("primary");
    btn.classList.add("ghost");
    
    showToast("Lesson completed! 🎉");
  } catch (e) {}
}

/* ========================================
   TUTOR
   ======================================== */

async function sendTutor() {
  if (!state.lesson) return;
  
  const input = $("#tutor-question");
  const question = input.value.trim();
  
  if (!question) return;
  
  appendTutor("You", question);
  input.value = "";
  
  try {
    const result = await api("askTutor", {
      userId: state.user.userId,
      lessonId: state.lesson.lessonId,
      question
    });
    
    appendTutor("Tutor", result.answer);
  } catch (e) {}
}

function appendTutor(sender, message) {
  const el = $("#tutor-messages");
  if (!el) return;
  
  const div = document.createElement("div");
  div.className = `tutor-msg ${sender === "You" ? "user" : "ai"}`;
  div.innerHTML = `<strong>${esc(sender)}:</strong> ${textHtml(message)}`;
  
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

/* ========================================
   QUIZ
   ======================================== */

async function openQuiz() {
  if (!state.lesson) return;
  
  try {
    const quiz = await api("generateQuiz", {
      userId: state.user.userId,
      courseId: state.lesson.courseId,
      lessonId: state.lesson.lessonId
    });
    
    state.quiz = quiz;
    renderQuiz(quiz);
    showView("quiz");
  } catch (e) {}
}

function renderQuiz(quiz) {
  const html = `
    <div class="lesson-container">
      <button id="quiz-back" class="btn ghost">← Back to Lesson</button>
      
      <div class="panel" style="margin-top: 16px">
        <div class="eyebrow">Quiz</div>
        <h2>${esc(state.lesson.title || state.lesson.lessonTitle)}</h2>
        
        <div id="quiz-form">
          ${quiz.questions.map((q, i) => {
            let body = "";
            
            if (q.type === "short_answer") {
              body = `<input type="text" class="quiz-answer" data-id="${esc(q.id)}" placeholder="Your answer"/>`;
            } else {
              const options = q.type === "true_false" ? ["True", "False"] : (q.options || []);
              body = `
                <div class="options">
                  ${options.map(o => `
                    <label class="option">
                      <input type="radio" name="${esc(q.id)}" value="${esc(o)}"/>
                      <span>${esc(o)}</span>
                    </label>
                  `).join("")}
                </div>
              `;
            }
            
            return `
              <div class="question-card">
                <div class="question-text">${i + 1}. ${esc(q.question)}</div>
                ${body}
              </div>
            `;
          }).join("")}
        </div>
        
        <button id="submit-quiz" class="btn primary block large">Submit Quiz</button>
        <div id="quiz-result"></div>
      </div>
    </div>
  `;
  
  $("#quiz-content").innerHTML = html;
  
  $("#quiz-back").addEventListener("click", () => showView("lesson"));
  $("#submit-quiz").addEventListener("click", submitQuiz);
}

async function submitQuiz() {
  if (!state.quiz || !state.lesson) return;
  
  const answers = state.quiz.questions.map(q => {
    if (q.type === "short_answer") {
      const input = document.querySelector(`.quiz-answer[data-id="${q.id}"]`);
      return input ? input.value : "";
    }
    
    const checked = document.querySelector(`input[name="${q.id}"]:checked`);
    return checked ? checked.value : "";
  });
  
  try {
    const result = await api("submitQuiz", {
      userId: state.user.userId,
      courseId: state.lesson.courseId,
      lessonId: state.lesson.lessonId,
      answers
    });
    
    state.result = result;
    renderQuizResult(result);
  } catch (e) {}
}

function renderQuizResult(result) {
  const html = `
    <div class="score-display">
      <div class="score-value">${esc(result.score)}%</div>
      <div class="score-label">${esc(result.correct)} of ${esc(result.total)} correct</div>
    </div>
    
    <h3>Results</h3>
    ${result.results.map(r => `
      <div class="result-card ${r.correct ? 'correct' : 'incorrect'}">
        <p><strong>${esc(r.question)}</strong></p>
        <p>Your answer: ${esc(r.userAnswer || "—")}</p>
        <p>Correct answer: ${esc(r.correctAnswer)}</p>
        <p class="muted">${textHtml(r.explanation)}</p>
      </div>
    `).join("")}
    
    ${result.score < 70 ? `
      <button id="review-btn" class="btn primary block large" style="margin-top: 24px">
        📖 Generate Review
      </button>
    ` : ''}
    
    <div id="review-area"></div>
  `;
  
  $("#quiz-result").innerHTML = html;
  
  if (result.score < 70) {
    $("#review-btn").addEventListener("click", generateReview);
  }
}

async function generateReview() {
  if (!state.result || !state.lesson) return;
  
  const weak = state.result.results
    .filter(r => !r.correct)
    .map(r => r.question);
  
  const btn = $("#review-btn");
  if (btn) btn.disabled = true;
  
  try {
    const review = await api("generateReview", {
      userId: state.user.userId,
      courseId: state.lesson.courseId,
      lessonId: state.lesson.lessonId,
      weakTopics: weak,
      score: state.result.score
    });
    
    renderReview(review);
  } catch (e) {
    if (btn) btn.disabled = false;
  }
}

function renderReview(review) {
  $("#review-area").innerHTML = `
    <div class="panel" style="margin-top: 24px">
      <div class="eyebrow">Review</div>
      <h3>📖 Simplified Explanation</h3>
      <div class="lesson-section">
        ${textHtml(review.simplifiedExplanation)}
      </div>
      
      <h3 style="margin-top: 24px">🎯 Review Lesson</h3>
      <div class="lesson-section">
        ${textHtml(review.reviewLesson)}
      </div>
      
      ${review.practiceQuestions?.length ? `
        <h3 style="margin-top: 24px">✏️ Extra Practice</h3>
        ${review.practiceQuestions.map((q, i) => `
          <div class="question-card">
            <div class="question-text">${i + 1}. ${esc(q.question)}</div>
            <p><strong>Answer:</strong> ${esc(q.correctAnswer)}</p>
            <p class="muted">${textHtml(q.explanation)}</p>
          </div>
        `).join("")}
      ` : ''}
    </div>
  `;
}
