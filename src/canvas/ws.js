// BLUN - AI Organisator | MIT License
// Canvas WebSocket — real-time collaborative code editing

const { query, queryOne } = require("../db");
const { broadcast } = require("../redis");

const canvasSockets = new Map(); // fileId -> Set<{ws, userId, userName, color}>
const cursorPositions = new Map(); // fileId -> Map<userId, {line, col, userName, color}>

const COLORS = ["#22d3ee","#a78bfa","#f472b6","#34d399","#fbbf24","#fb923c","#e879f9","#38bdf8"];
let colorIdx = 0;
function nextColor() { return COLORS[colorIdx++ % COLORS.length]; }

function handleCanvasConnection(ws, user) {
  const color = nextColor();
  const client = { ws, userId: user.id, userName: user.name || user.email, color };
  let currentFileId = null;

  ws.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw);
      switch (msg.type) {
        case "file.open": {
          // Leave previous file room
          if (currentFileId && canvasSockets.has(currentFileId)) {
            canvasSockets.get(currentFileId).delete(client);
            broadcastToFile(currentFileId, { type: "cursor.leave", userId: user.id }, client);
          }
          currentFileId = msg.fileId;
          if (!canvasSockets.has(currentFileId)) canvasSockets.set(currentFileId, new Set());
          canvasSockets.get(currentFileId).add(client);
          // Send file content
          const file = await queryOne("SELECT * FROM canvas_files WHERE id = $1", [currentFileId]);
          if (file) {
            ws.send(JSON.stringify({ type: "file.content", file }));
          }
          // Send existing cursors
          if (cursorPositions.has(currentFileId)) {
            for (const [uid, pos] of cursorPositions.get(currentFileId)) {
              if (uid !== user.id) ws.send(JSON.stringify({ type: "cursor.move", ...pos, userId: uid }));
            }
          }
          // Announce join
          broadcastToFile(currentFileId, { type: "user.joined", userId: user.id, userName: client.userName, color }, client);
          break;
        }
        case "file.edit": {
          // Last-write-wins: apply edit, broadcast to others
          const { fileId, content, cursorLine, cursorCol } = msg;
          if (!fileId) break;
          await query("UPDATE canvas_files SET content = $1, last_editor = $2, updated_at = NOW() WHERE id = $3", [content, client.userName, fileId]);
          broadcastToFile(fileId, { type: "file.edit", fileId, content, editorId: user.id, editorName: client.userName, editorColor: color, cursorLine, cursorCol }, client);
          break;
        }
        case "file.save": {
          const { fileId, content } = msg;
          if (!fileId) break;
          await query("UPDATE canvas_files SET content = $1, last_editor = $2, updated_at = NOW() WHERE id = $3", [content, client.userName, fileId]);
          broadcastToFile(fileId, { type: "file.saved", fileId, by: client.userName }, null);
          break;
        }
        case "cursor.move": {
          const { fileId, line, col } = msg;
          if (!fileId) break;
          if (!cursorPositions.has(fileId)) cursorPositions.set(fileId, new Map());
          cursorPositions.get(fileId).set(user.id, { line, col, userName: client.userName, color });
          broadcastToFile(fileId, { type: "cursor.move", userId: user.id, userName: client.userName, color, line, col }, client);
          break;
        }
      }
    } catch (e) {
      console.error("[canvas-ws] Error:", e.message);
    }
  });

  ws.on("close", () => {
    if (currentFileId && canvasSockets.has(currentFileId)) {
      canvasSockets.get(currentFileId).delete(client);
      broadcastToFile(currentFileId, { type: "cursor.leave", userId: user.id }, null);
      if (cursorPositions.has(currentFileId)) cursorPositions.get(currentFileId).delete(user.id);
    }
  });

  ws.send(JSON.stringify({ type: "canvas.ready", userId: user.id, userName: client.userName, color }));
}

function broadcastToFile(fileId, msg, exclude) {
  const clients = canvasSockets.get(fileId);
  if (!clients) return;
  const data = JSON.stringify(msg);
  for (const c of clients) {
    if (c !== exclude && c.ws.readyState === 1) c.ws.send(data);
  }
}

module.exports = { handleCanvasConnection };
