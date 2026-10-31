require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");

const { MONGODB_URI, JWT_SECRET, ADMIN_PASSWORD, FRONTEND_ORIGIN, DB_NAME = "classroompoll", PORT = 3000 } = process.env;
if (!MONGODB_URI || !JWT_SECRET || !ADMIN_PASSWORD) {
  console.error("MONGODB_URI, JWT_SECRET aur ADMIN_PASSWORD teeno environment variables zaroori hain.");
  process.exit(1);
}

const app = express();
app.set("trust proxy", 1); // Render proxy ke peeche sahi IP ke liye
app.use(express.json({ limit: "20kb" }));
const origins = (FRONTEND_ORIGIN || "").split(",").map(s => s.trim().replace(/\/$/, "")).filter(Boolean);
app.use(cors({ origin: origins.length ? origins : true }));

let db;
const col = name => db.collection(name);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const wrap = fn => (req, res) => fn(req, res).catch(e => { console.error(e); bad(res, "Server me gadbad hui. Thodi der baad try karo.", 500); });
const str = (v, max) => String(v ?? "").trim().slice(0, max);
const sign = (payload, exp) => jwt.sign(payload, JWT_SECRET, { expiresIn: exp });

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false,
  message: { error: "Bahut zyada attempts hue. 15 minute baad try karo." }
});

function need(role) {
  return (req, res, next) => {
    try {
      const p = jwt.verify((req.headers.authorization || "").replace(/^Bearer /, ""), JWT_SECRET);
      if (p.role !== role) throw new Error("role");
      req.auth = p; next();
    } catch (e) { bad(res, "Login dobara karo.", 401); }
  };
}

app.get("/", (req, res) => res.json({ ok: true, service: "classroom-poll" }));
app.get("/api/health", (req, res) => res.json({ ok: true }));

/* ---------------- student ---------------- */
app.post("/api/signup", authLimiter, wrap(async (req, res) => {
  const name = str(req.body.name, 60), email = str(req.body.email, 120).toLowerCase(), phone = str(req.body.phone, 10);
  const password = String(req.body.password || "");
  if (!name || !email || !phone || !password) return bad(res, "Saari details bharo.");
  if (!/^\S+@\S+\.\S+$/.test(email)) return bad(res, "Email sahi nahi hai.");
  if (!/^\d{10}$/.test(phone)) return bad(res, "Phone 10 digit ka hona chahiye.");
  if (password.length < 4 || password.length > 100) return bad(res, "Password 4 se 100 akshar ka rakho.");
  try {
    await col("users").insertOne({ _id: email, name, phone, pw: await bcrypt.hash(password, 10), t: Date.now() });
  } catch (e) {
    if (e.code === 11000) return bad(res, "Ye email pehle se registered hai.", 409);
    throw e;
  }
  res.json({ token: sign({ role: "student", email }, "30d"), user: { name, email } });
}));

app.post("/api/login", authLimiter, wrap(async (req, res) => {
  const email = str(req.body.email, 120).toLowerCase();
  const u = await col("users").findOne({ _id: email });
  if (!u || !(await bcrypt.compare(String(req.body.password || ""), u.pw))) return bad(res, "Email ya password galat hai.", 401);
  res.json({ token: sign({ role: "student", email }, "30d"), user: { name: u.name, email } });
}));

app.get("/api/me", need("student"), wrap(async (req, res) => {
  const u = await col("users").findOne({ _id: req.auth.email });
  if (!u) return bad(res, "Account nahi mila.", 401);
  res.json({ name: u.name, email: u._id });
}));

app.get("/api/questions", need("student"), wrap(async (req, res) => {
  const qs = await col("questions").find({}).sort({ t: 1 }).toArray();
  const mine = {};
  (await col("answers").find({ email: req.auth.email }).toArray()).forEach(a => { mine[a.qid] = a.v; });
  res.json({ questions: qs.map(q => ({ id: q._id, text: q.text, type: q.type, opts: q.opts })), mine });
}));

app.post("/api/answer", need("student"), wrap(async (req, res) => {
  const q = await col("questions").findOne({ _id: str(req.body.qid, 50) });
  if (!q) return bad(res, "Ye question ab available nahi hai.", 404);
  const raw = req.body.v;
  const okIdx = i => Number.isInteger(i) && i >= 0 && i < q.opts.length;
  let v;
  if (q.type === "text") { v = str(raw, 300); if (!v) return bad(res, "Jawab likho."); }
  else if (q.type === "multi") {
    if (!Array.isArray(raw) || !raw.length || !raw.every(okIdx)) return bad(res, "Sahi option chuno.");
    v = [...new Set(raw)].sort((a, b) => a - b);
  } else { if (!okIdx(raw)) return bad(res, "Sahi option chuno."); v = raw; }
  const email = req.auth.email;
  await col("answers").updateOne({ _id: q._id + "__" + email }, { $set: { qid: q._id, email, v, t: Date.now() } }, { upsert: true });
  res.json({ ok: true });
}));

/* ---------------- admin ---------------- */
async function adminOk(p) {
  const s = await col("settings").findOne({ _id: "admin" });
  return s ? bcrypt.compare(String(p || ""), s.pw) : String(p || "") === ADMIN_PASSWORD;
}

app.post("/api/admin/login", authLimiter, wrap(async (req, res) => {
  if (!(await adminOk(req.body.password))) return bad(res, "Password galat hai.", 401);
  res.json({ token: sign({ role: "admin" }, "12h") });
}));

app.get("/api/admin/data", need("admin"), wrap(async (req, res) => {
  const [users, questions, answers] = await Promise.all([
    col("users").find({}).sort({ t: 1 }).toArray(),
    col("questions").find({}).sort({ t: 1 }).toArray(),
    col("answers").find({}).toArray()
  ]);
  res.json({
    users: users.map(u => ({ email: u._id, name: u.name, phone: u.phone })),
    questions: questions.map(q => ({ id: q._id, text: q.text, type: q.type, opts: q.opts })),
    answers: answers.map(a => ({ qid: a.qid, email: a.email, v: a.v }))
  });
}));

app.post("/api/admin/question", need("admin"), wrap(async (req, res) => {
  const type = str(req.body.type, 10), text = str(req.body.text, 200);
  if (!["mcq", "multi", "tf", "text"].includes(type)) return bad(res, "Question type galat hai.");
  if (!text) return bad(res, "Question likho.");
  let opts = [];
  if (type === "tf") opts = ["True", "False"];
  else if (type !== "text") {
    opts = (Array.isArray(req.body.opts) ? req.body.opts : []).map(o => str(o, 100));
    if (opts.length !== 4 || opts.some(o => !o)) return bad(res, "Chaaron options bharo.");
  }
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  await col("questions").insertOne({ _id: id, text, type, opts, t: Date.now() });
  res.json({ id });
}));

app.post("/api/admin/question/delete", need("admin"), wrap(async (req, res) => {
  const id = str(req.body.id, 50);
  await col("answers").deleteMany({ qid: id });
  await col("questions").deleteOne({ _id: id });
  res.json({ ok: true });
}));

app.post("/api/admin/user/reset", need("admin"), wrap(async (req, res) => {
  const email = str(req.body.email, 120).toLowerCase(), password = String(req.body.password || "");
  if (password.length < 4 || password.length > 100) return bad(res, "Password 4 se 100 akshar ka rakho.");
  const r = await col("users").updateOne({ _id: email }, { $set: { pw: await bcrypt.hash(password, 10) } });
  if (!r.matchedCount) return bad(res, "Student nahi mila.", 404);
  res.json({ ok: true });
}));

app.post("/api/admin/user/delete", need("admin"), wrap(async (req, res) => {
  const email = str(req.body.email, 120).toLowerCase();
  await col("answers").deleteMany({ email });
  await col("users").deleteOne({ _id: email });
  res.json({ ok: true });
}));

app.post("/api/admin/password", need("admin"), wrap(async (req, res) => {
  const n = String(req.body.newPassword || "");
  if (!(await adminOk(req.body.oldPassword))) return bad(res, "Purana password galat hai.", 401);
  if (n.length < 4 || n.length > 100) return bad(res, "Naya password 4 se 100 akshar ka ho.");
  await col("settings").updateOne({ _id: "admin" }, { $set: { pw: await bcrypt.hash(n, 10) } }, { upsert: true });
  res.json({ ok: true });
}));

MongoClient.connect(MONGODB_URI)
  .then(client => {
    db = client.db(DB_NAME);
    app.listen(PORT, () => console.log("Server chal raha hai, port " + PORT));
  })
  .catch(e => { console.error("MongoDB se connect nahi hua:", e.message); process.exit(1); });
