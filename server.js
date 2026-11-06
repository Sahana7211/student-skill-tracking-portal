const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const { questionBank, subjects } = require("./questions");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], tasks: [], results: [] }, null, 2));

function readDB() { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
function writeDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || "replace-this-secret-before-deployment",
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", maxAge: 1000 * 60 * 60 * 8 }
}));
app.use(express.static(path.join(__dirname, "public")));

function auth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Please log in to continue." });
  next();
}
function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt };
}

app.get("/api/subjects", (req, res) => {
  res.json(subjects.map(s => ({ ...s, questionCount: questionBank[s.id].length })));
});

app.post("/api/register", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (name.length < 2) return res.status(400).json({ error: "Enter your full name (at least 2 characters)." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });
  const db = readDB();
  if (db.users.some(u => u.email === email)) return res.status(409).json({ error: "An account with this email already exists. Please log in." });
  const user = { id: "u_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8), name, email, passwordHash: await bcrypt.hash(password, 10), createdAt: new Date().toISOString() };
  db.users.push(user); writeDB(db);
  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

app.post("/api/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const db = readDB();
  const user = db.users.find(u => u.email === email);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: "Incorrect email or password." });
  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

app.post("/api/logout", (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.get("/api/me", (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = readDB().users.find(u => u.id === req.session.userId);
  res.json({ user: user ? publicUser(user) : null });
});

app.get("/api/dashboard", auth, (req, res) => {
  const db = readDB();
  const tasks = db.tasks.filter(t => t.userId === req.session.userId);
  const results = db.results.filter(r => r.userId === req.session.userId);
  const completedTasks = tasks.filter(t => t.completed).length;
  const passed = results.filter(r => r.passed);
  res.json({
    tasks, results, stats: {
      totalTasks: tasks.length, completedTasks,
      assessments: results.length, passedAssessments: passed.length,
      certificates: passed.length,
      averageScore: results.length ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length) : 0
    }
  });
});

app.post("/api/tasks", auth, (req, res) => {
  const title = String(req.body.title || "").trim();
  const subject = String(req.body.subject || "").trim();
  const dueDate = String(req.body.dueDate || "").trim();
  if (title.length < 3) return res.status(400).json({ error: "Task title must be at least 3 characters." });
  if (!subjects.some(s => s.id === subject)) return res.status(400).json({ error: "Choose a valid subject." });
  const db = readDB();
  const task = { id: "t_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6), userId: req.session.userId, title, subject, dueDate, completed: false, createdAt: new Date().toISOString() };
  db.tasks.unshift(task); writeDB(db); res.json({ task });
});

app.patch("/api/tasks/:id", auth, (req, res) => {
  const db = readDB();
  const task = db.tasks.find(t => t.id === req.params.id && t.userId === req.session.userId);
  if (!task) return res.status(404).json({ error: "Task not found." });
  task.completed = Boolean(req.body.completed);
  task.updatedAt = new Date().toISOString();
  writeDB(db); res.json({ task });
});

app.delete("/api/tasks/:id", auth, (req, res) => {
  const db = readDB();
  const before = db.tasks.length;
  db.tasks = db.tasks.filter(t => !(t.id === req.params.id && t.userId === req.session.userId));
  if (db.tasks.length === before) return res.status(404).json({ error: "Task not found." });
  writeDB(db); res.json({ ok: true });
});

app.get("/api/assessment/:subject", auth, (req, res) => {
  const bank = questionBank[req.params.subject];
  if (!bank) return res.status(404).json({ error: "Subject not found." });
  // The answer is intentionally omitted from the client payload.
  res.json({ subject: subjects.find(s => s.id === req.params.subject), questions: bank.map(({ id, prompt, options }) => ({ id, prompt, options })), total: bank.length, passMark: 60 });
});

app.post("/api/assessment/:subject/submit", auth, (req, res) => {
  const bank = questionBank[req.params.subject];
  if (!bank) return res.status(404).json({ error: "Subject not found." });
  const answers = req.body.answers || {};
  const correct = bank.reduce((n, q) => n + (Number(answers[q.id]) === q.answer ? 1 : 0), 0);
  const score = Math.round((correct / bank.length) * 100);
  const passed = score >= 60;
  const db = readDB();
  const subject = subjects.find(s => s.id === req.params.subject);
  const result = {
    id: "r_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
    userId: req.session.userId, subjectId: subject.id, subjectName: subject.name,
    score, correct, total: bank.length, passed, completedAt: new Date().toISOString(),
    certificateCode: passed ? "SSP-" + new Date().getFullYear() + "-" + Math.random().toString(36).slice(2, 8).toUpperCase() : null
  };
  db.results.unshift(result); writeDB(db);
  res.json({ result });
});

app.get("/api/certificate/:id", auth, (req, res) => {
  const db = readDB();
  const result = db.results.find(r => r.id === req.params.id && r.userId === req.session.userId);
  const user = db.users.find(u => u.id === req.session.userId);
  if (!result || !result.passed) return res.status(404).json({ error: "Certificate is not available. Pass the assessment first (60% or higher)." });
  res.json({ result, user: publicUser(user) });
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`Student Skill Portal running at http://localhost:${PORT}`));
