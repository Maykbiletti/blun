// BLUN - AI Organisator | MIT License
// Federation Engine — cross-instance agent communication

const { pool } = require("../db");

async function addPeer(name, url, apiKey) {
  var result = await pool.query(
    "INSERT INTO federation_peers (name, url, api_key, status, trust_level) VALUES ($1, $2, $3, 'pending', 'restricted') RETURNING *",
    [name || url, url.replace(/\/+$/, ""), apiKey || null]
  );
  return result.rows[0];
}

async function removePeer(id) {
  await pool.query("DELETE FROM federation_peers WHERE id = $1", [id]);
}

async function updatePeer(id, fields) {
  var sets = [];
  var vals = [];
  var i = 1;
  if (fields.trust_level) { sets.push("trust_level = $" + i++); vals.push(fields.trust_level); }
  if (fields.name) { sets.push("name = $" + i++); vals.push(fields.name); }
  if (fields.status) { sets.push("status = $" + i++); vals.push(fields.status); }
  if (sets.length === 0) return null;
  vals.push(id);
  var result = await pool.query(
    "UPDATE federation_peers SET " + sets.join(", ") + " WHERE id = $" + i + " RETURNING *",
    vals
  );
  return result.rows[0];
}

async function listPeers() {
  var result = await pool.query("SELECT * FROM federation_peers ORDER BY created_at DESC");
  return result.rows;
}

async function getPeer(id) {
  var result = await pool.query("SELECT * FROM federation_peers WHERE id = $1", [id]);
  return result.rows[0] || null;
}

async function sendMessage(peerId, fromAgentId, toAgentName, content) {
  var peer = await getPeer(peerId);
  if (!peer) throw new Error("Peer not found");
  if (peer.trust_level === "blocked") throw new Error("Peer is blocked");

  var msg = await pool.query(
    "INSERT INTO federation_messages (peer_id, direction, from_agent, to_agent, content, status) VALUES ($1, 'out', $2, $3, $4, 'sending') RETURNING *",
    [peerId, fromAgentId, toAgentName, content]
  );
  var record = msg.rows[0];

  try {
    var fetch = (await import("node-fetch")).default;
    var headers = { "Content-Type": "application/json" };
    if (peer.api_key) headers["x-blun-key"] = peer.api_key;

    var resp = await fetch(peer.url + "/federation/receive", {
      method: "POST",
      headers: headers,
      body: JSON.stringify({
        from_agent: fromAgentId,
        to_agent: toAgentName,
        content: content,
        source_instance: process.env.BLUN_INSTANCE_NAME || "unknown"
      }),
      timeout: 10000
    });

    var status = resp.ok ? "delivered" : "failed";
    await pool.query("UPDATE federation_messages SET status = $1 WHERE id = $2", [status, record.id]);
    record.status = status;
  } catch (err) {
    await pool.query("UPDATE federation_messages SET status = 'failed' WHERE id = $1", [record.id]);
    record.status = "failed";
    record.error = err.message;
  }

  return record;
}

async function receiveMessage(fromInstance, fromAgent, toAgent, content) {
  var peers = await pool.query(
    "SELECT * FROM federation_peers WHERE url LIKE $1 OR name = $2 LIMIT 1",
    ["%" + fromInstance + "%", fromInstance]
  );
  var peer = peers.rows[0];
  var peerId = peer ? peer.id : null;

  if (peer && peer.trust_level === "blocked") {
    return { accepted: false, reason: "blocked" };
  }

  var needsApproval = !peer || peer.trust_level === "restricted";

  var msg = await pool.query(
    "INSERT INTO federation_messages (peer_id, direction, from_agent, to_agent, content, status) VALUES ($1, 'in', $2, $3, $4, $5) RETURNING *",
    [peerId, fromAgent, toAgent, content, needsApproval ? "pending_approval" : "accepted"]
  );

  if (!needsApproval) {
    try {
      var { pub } = require("../redis");
      pub.publish("blun:federation:incoming", JSON.stringify({
        id: msg.rows[0].id,
        from_agent: fromAgent,
        to_agent: toAgent,
        content: content
      }));
    } catch (e) {}
  }

  return { accepted: true, status: msg.rows[0].status, id: msg.rows[0].id };
}

async function heartbeat() {
  var peers = await listPeers();
  var results = [];
  var fetch;
  try { fetch = (await import("node-fetch")).default; } catch (e) { return results; }

  for (var peer of peers) {
    if (peer.trust_level === "blocked") continue;
    try {
      var headers = {};
      if (peer.api_key) headers["x-blun-key"] = peer.api_key;
      var resp = await fetch(peer.url + "/api/health", { headers: headers, timeout: 5000 });
      var status = resp.ok ? "online" : "unreachable";
      await pool.query("UPDATE federation_peers SET status = $1, last_seen = NOW() WHERE id = $2", [status, peer.id]);
      results.push({ id: peer.id, name: peer.name, status: status });
    } catch (err) {
      await pool.query("UPDATE federation_peers SET status = 'offline' WHERE id = $1", [peer.id]);
      results.push({ id: peer.id, name: peer.name, status: "offline" });
    }
  }
  return results;
}

async function getMessages(limit, offset) {
  var result = await pool.query(
    "SELECT m.*, p.name AS peer_name, p.url AS peer_url FROM federation_messages m LEFT JOIN federation_peers p ON m.peer_id = p.id ORDER BY m.created_at DESC LIMIT $1 OFFSET $2",
    [limit || 50, offset || 0]
  );
  return result.rows;
}

module.exports = { addPeer, removePeer, updatePeer, listPeers, getPeer, sendMessage, receiveMessage, heartbeat, getMessages };
