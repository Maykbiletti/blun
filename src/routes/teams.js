// BLUN - AI Organisator | MIT License
const express = require("express");
const crypto = require("crypto");
const { pool } = require("../db");

var router = express.Router();

// Helper: check membership + role
async function getMembership(teamId, userId) {
  var r = await pool.query("SELECT role FROM team_members WHERE team_id=$1 AND user_id=$2", [teamId, userId]);
  return r.rows[0] || null;
}

// POST /api/teams — create team
router.post("/", async function(req, res) {
  try {
    var { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Team name required" });
    var r = await pool.query(
      "INSERT INTO teams (id, name, owner_id, plan, created_at) VALUES (gen_random_uuid(), $1, $2, $3, NOW()) RETURNING *",
      [name.trim(), req.user.id, "free"]
    );
    var team = r.rows[0];
    await pool.query(
      "INSERT INTO team_members (id, team_id, user_id, role, joined_at) VALUES (gen_random_uuid(), $1, $2, $3, NOW())",
      [team.id, req.user.id, "owner"]
    );
    res.json(team);
  } catch(e) { console.error("[teams] create error:", e); res.status(500).json({ error: "Failed to create team" }); }
});

// GET /api/teams — list user teams
router.get("/", async function(req, res) {
  try {
    var r = await pool.query(
      "SELECT t.*, tm.role AS my_role, (SELECT count(*) FROM team_members WHERE team_id=t.id) AS member_count FROM teams t JOIN team_members tm ON tm.team_id=t.id WHERE tm.user_id=$1 ORDER BY t.created_at DESC",
      [req.user.id]
    );
    res.json(r.rows);
  } catch(e) { console.error("[teams] list error:", e); res.status(500).json({ error: "Failed to list teams" }); }
});

// GET /api/teams/:id — team details + members
router.get("/:id", async function(req, res) {
  try {
    var mem = await getMembership(req.params.id, req.user.id);
    if (!mem) return res.status(403).json({ error: "Not a member" });
    var t = await pool.query("SELECT * FROM teams WHERE id=$1", [req.params.id]);
    if (!t.rows[0]) return res.status(404).json({ error: "Team not found" });
    var members = await pool.query(
      "SELECT tm.id, tm.user_id, tm.role, tm.joined_at, u.email, u.name AS user_name FROM team_members tm JOIN users u ON u.id=tm.user_id WHERE tm.team_id=$1 ORDER BY tm.joined_at",
      [req.params.id]
    );
    var invites = await pool.query("SELECT id, email, role, created_at, expires_at FROM team_invites WHERE team_id=$1 AND expires_at > NOW() ORDER BY created_at DESC", [req.params.id]);
    res.json({ ...t.rows[0], members: members.rows, invites: invites.rows, my_role: mem.role });
  } catch(e) { console.error("[teams] detail error:", e); res.status(500).json({ error: "Failed to get team" }); }
});

// PUT /api/teams/:id — update team name
router.put("/:id", async function(req, res) {
  try {
    var mem = await getMembership(req.params.id, req.user.id);
    if (!mem || (mem.role !== "owner" && mem.role !== "admin")) return res.status(403).json({ error: "Owner or admin only" });
    var { name } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: "Team name required" });
    var r = await pool.query("UPDATE teams SET name=$1 WHERE id=$2 RETURNING *", [name.trim(), req.params.id]);
    res.json(r.rows[0]);
  } catch(e) { console.error("[teams] update error:", e); res.status(500).json({ error: "Failed to update team" }); }
});

// DELETE /api/teams/:id — delete team (owner only)
router.delete("/:id", async function(req, res) {
  try {
    var mem = await getMembership(req.params.id, req.user.id);
    if (!mem || mem.role !== "owner") return res.status(403).json({ error: "Owner only" });
    await pool.query("DELETE FROM team_invites WHERE team_id=$1", [req.params.id]);
    await pool.query("DELETE FROM team_members WHERE team_id=$1", [req.params.id]);
    await pool.query("DELETE FROM teams WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch(e) { console.error("[teams] delete error:", e); res.status(500).json({ error: "Failed to delete team" }); }
});

// POST /api/teams/:id/invite — invite member
router.post("/:id/invite", async function(req, res) {
  try {
    var mem = await getMembership(req.params.id, req.user.id);
    if (!mem || (mem.role !== "owner" && mem.role !== "admin")) return res.status(403).json({ error: "Owner or admin only" });
    var { email, role } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });
    if (!["admin", "member"].includes(role)) role = "member";
    var token = crypto.randomBytes(32).toString("hex");
    var expires = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    var r = await pool.query(
      "INSERT INTO team_invites (id, team_id, email, role, token, expires_at, created_at) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW()) RETURNING *",
      [req.params.id, email, role, token, expires]
    );
    res.json({ ...r.rows[0], invite_link: "/api/teams/" + req.params.id + "/join?token=" + token });
  } catch(e) { console.error("[teams] invite error:", e); res.status(500).json({ error: "Failed to invite" }); }
});

// POST /api/teams/:id/join — accept invite via token
router.post("/:id/join", async function(req, res) {
  try {
    var token = req.body.token || req.query.token;
    if (!token) return res.status(400).json({ error: "Token required" });
    var inv = await pool.query("SELECT * FROM team_invites WHERE team_id=$1 AND token=$2 AND expires_at > NOW()", [req.params.id, token]);
    if (!inv.rows[0]) return res.status(404).json({ error: "Invalid or expired invite" });
    var existing = await getMembership(req.params.id, req.user.id);
    if (existing) return res.status(400).json({ error: "Already a member" });
    await pool.query(
      "INSERT INTO team_members (id, team_id, user_id, role, joined_at) VALUES (gen_random_uuid(), $1, $2, $3, NOW())",
      [req.params.id, req.user.id, inv.rows[0].role]
    );
    await pool.query("DELETE FROM team_invites WHERE id=$1", [inv.rows[0].id]);
    res.json({ ok: true, role: inv.rows[0].role });
  } catch(e) { console.error("[teams] join error:", e); res.status(500).json({ error: "Failed to join" }); }
});

// PUT /api/teams/:id/members/:userId — change role (owner only)
router.put("/:id/members/:userId", async function(req, res) {
  try {
    var mem = await getMembership(req.params.id, req.user.id);
    if (!mem || mem.role !== "owner") return res.status(403).json({ error: "Owner only" });
    if (req.params.userId === req.user.id) return res.status(400).json({ error: "Cannot change own role" });
    var { role } = req.body;
    if (!["admin", "member"].includes(role)) return res.status(400).json({ error: "Invalid role" });
    await pool.query("UPDATE team_members SET role=$1 WHERE team_id=$2 AND user_id=$3", [role, req.params.id, req.params.userId]);
    res.json({ ok: true });
  } catch(e) { console.error("[teams] role change error:", e); res.status(500).json({ error: "Failed to change role" }); }
});

// DELETE /api/teams/:id/members/:userId — remove member
router.delete("/:id/members/:userId", async function(req, res) {
  try {
    var mem = await getMembership(req.params.id, req.user.id);
    if (!mem || (mem.role !== "owner" && mem.role !== "admin")) return res.status(403).json({ error: "Owner or admin only" });
    if (req.params.userId === req.user.id) return res.status(400).json({ error: "Cannot remove yourself" });
    var target = await getMembership(req.params.id, req.params.userId);
    if (target && target.role === "owner") return res.status(403).json({ error: "Cannot remove owner" });
    await pool.query("DELETE FROM team_members WHERE team_id=$1 AND user_id=$2", [req.params.id, req.params.userId]);
    res.json({ ok: true });
  } catch(e) { console.error("[teams] remove error:", e); res.status(500).json({ error: "Failed to remove member" }); }
});

// GET /api/teams/:id/agents — list team shared agents
router.get("/:id/agents", async function(req, res) {
  try {
    var mem = await getMembership(req.params.id, req.user.id);
    if (!mem) return res.status(403).json({ error: "Not a member" });
    var team = await pool.query("SELECT owner_id FROM teams WHERE id=$1", [req.params.id]);
    if (!team.rows[0]) return res.status(404).json({ error: "Team not found" });
    var r = await pool.query(
      "SELECT a.* FROM agents a JOIN team_members tm ON tm.user_id=a.user_id WHERE tm.team_id=$1 ORDER BY a.created_at DESC",
      [req.params.id]
    );
    res.json(r.rows);
  } catch(e) { console.error("[teams] agents error:", e); res.status(500).json({ error: "Failed to list agents" }); }
});

module.exports = router;
