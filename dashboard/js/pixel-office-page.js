(function () {
  "use strict";

  var SCALE = 3;
  var MIN_WIDTH = 800;
  var MIN_HEIGHT = 500;
  var MOVE_MS = 500;

  var canvas = document.getElementById("pixelOfficeCanvas");
  if (!canvas) return;
  var ctx = canvas.getContext("2d");

  var buffer = document.createElement("canvas");
  var bctx = buffer.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  bctx.imageSmoothingEnabled = false;

  var logicalW = 320;
  var logicalH = 180;

  var agentStates = new Map();
  var deskRects = [];
  var running = true;
  var lastFrameTs = performance.now();

  var zoneDefs = {
    desks: { x: 10, y: 20, w: 110, h: 140, label: "DESKS" },
    whiteboard: { x: 125, y: 8, w: 110, h: 48, label: "WHITEBOARD" },
    server: { x: 245, y: 15, w: 65, h: 130, label: "SERVER-RACK" },
    coffee: { x: 120, y: 126, w: 120, h: 46, label: "KAFFEEKUECHE" }
  };

  function hashCode(input) {
    var s = String(input || "");
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return Math.abs(h >>> 0);
  }

  function shortTask(agent) {
    var raw = agent.current_task || agent.task || agent.task_title || agent.currentTask || agent.title || agent.last_task || "";
    if (!raw && agent.config && typeof agent.config === "object") {
      raw = agent.config.current_task || agent.config.task || "";
    }
    raw = String(raw || "").trim();
    if (!raw) return "";
    return raw.length > 30 ? raw.slice(0, 27) + "..." : raw;
  }

  function initials(name) {
    var n = String(name || "A").trim();
    if (!n) return "A";
    var parts = n.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function colorFromName(name) {
    var palette = ["#2563eb", "#22c55e", "#f97316", "#eab308", "#ef4444", "#06b6d4", "#ec4899", "#8b5cf6"];
    return palette[hashCode(name) % palette.length];
  }

  function normalizeStatus(status) {
    return String(status || "idle").toLowerCase();
  }

  function agentZone(agent) {
    var status = normalizeStatus(agent.status);
    if (status === "deploying") return "server";
    if (status === "rate_limited" || status === "offline") return "coffee";
    if (status === "processing" || status === "working" || status === "active") {
      return (hashCode(agent.id || agent.name) % 2 === 0) ? "whiteboard" : "desks";
    }
    return "desks";
  }

  function isIdle(agent) {
    var status = normalizeStatus(agent.status);
    return status === "idle" || status === "online";
  }

  function createDeskRects() {
    deskRects = [];
    var startX = zoneDefs.desks.x + 10;
    var startY = zoneDefs.desks.y + 18;
    for (var r = 0; r < 4; r++) {
      for (var c = 0; c < 2; c++) {
        deskRects.push({ x: startX + c * 44, y: startY + r * 28, w: 28, h: 14 });
      }
    }
  }

  function calcSlots() {
    var slots = {
      desks: [],
      whiteboard: [],
      server: [],
      coffee: []
    };

    for (var i = 0; i < deskRects.length; i++) {
      slots.desks.push({ x: deskRects[i].x + 6, y: deskRects[i].y + 16 });
    }

    for (var w = 0; w < 6; w++) {
      slots.whiteboard.push({ x: zoneDefs.whiteboard.x + 8 + w * 16, y: zoneDefs.whiteboard.y + 30 + ((w % 2) * 5) });
    }

    for (var s = 0; s < 6; s++) {
      slots.server.push({ x: zoneDefs.server.x + 12 + ((s % 2) * 22), y: zoneDefs.server.y + 20 + Math.floor(s / 2) * 26 });
    }

    for (var k = 0; k < 6; k++) {
      slots.coffee.push({ x: zoneDefs.coffee.x + 10 + (k * 17), y: zoneDefs.coffee.y + 18 + ((k % 2) * 8) });
    }

    return slots;
  }

  function assignTargets(agents) {
    var slots = calcSlots();
    var grouped = { desks: [], whiteboard: [], server: [], coffee: [] };

    agents.slice().sort(function (a, b) {
      return String(a.id || a.name).localeCompare(String(b.id || b.name));
    }).forEach(function (agent) {
      grouped[agentZone(agent)].push(agent);
    });

    Object.keys(grouped).forEach(function (zoneName) {
      var list = grouped[zoneName];
      var zoneSlots = slots[zoneName];
      for (var i = 0; i < list.length; i++) {
        var ag = list[i];
        var slot = zoneSlots[i % zoneSlots.length];
        var lane = Math.floor(i / zoneSlots.length);
        var jitterX = ((hashCode(String(ag.id || ag.name) + "x") % 5) - 2);
        var jitterY = ((hashCode(String(ag.id || ag.name) + "y") % 5) - 2);
        var targetX = slot.x + jitterX;
        var targetY = slot.y + jitterY + lane * 6;
        setTarget(ag, targetX, targetY);
      }
    });
  }

  function setTarget(agent, tx, ty) {
    var id = String(agent.id || agent.name || Math.random());
    var now = performance.now();
    var state = agentStates.get(id);
    if (!state) {
      state = {
        id: id,
        name: String(agent.name || "Agent"),
        initials: initials(agent.name),
        color: colorFromName(agent.name),
        status: normalizeStatus(agent.status),
        task: shortTask(agent),
        x: tx,
        y: ty,
        fromX: tx,
        fromY: ty,
        targetX: tx,
        targetY: ty,
        moveStart: now
      };
      agentStates.set(id, state);
      return;
    }

    state.name = String(agent.name || state.name);
    state.initials = initials(state.name);
    state.status = normalizeStatus(agent.status);
    state.task = shortTask(agent);

    if (Math.abs(state.targetX - tx) > 0.2 || Math.abs(state.targetY - ty) > 0.2) {
      state.fromX = state.x;
      state.fromY = state.y;
      state.targetX = tx;
      state.targetY = ty;
      state.moveStart = now;
    }
  }

  async function pollAgents() {
    try {
      var res = await fetch("/api/agents", { credentials: "include" });
      if (!res.ok) return;
      var data = await res.json();
      var agents = Array.isArray(data) ? data : (data.agents || []);
      assignTargets(agents);

      var liveIds = new Set(agents.map(function (a) { return String(a.id || a.name); }));
      Array.from(agentStates.keys()).forEach(function (id) {
        if (!liveIds.has(id)) agentStates.delete(id);
      });
    } catch (err) {
      console.error("Pixel Office polling error:", err);
    }
  }

  function updateAnimation(now) {
    var dt = now - lastFrameTs;
    if (dt < 0) dt = 0;
    lastFrameTs = now;

    agentStates.forEach(function (a) {
      var t = Math.min(1, (now - a.moveStart) / MOVE_MS);
      a.x = a.fromX + (a.targetX - a.fromX) * t;
      a.y = a.fromY + (a.targetY - a.fromY) * t;
    });
  }

  function drawZoneRect(zone, fill, border) {
    bctx.fillStyle = fill;
    bctx.fillRect(zone.x, zone.y, zone.w, zone.h);
    bctx.strokeStyle = border;
    bctx.lineWidth = 1;
    bctx.strokeRect(zone.x + 0.5, zone.y + 0.5, zone.w - 1, zone.h - 1);
    bctx.fillStyle = "#ffffff";
    bctx.font = "bold 6px monospace";
    bctx.fillText(zone.label, zone.x + 3, zone.y + 7);
  }

  function drawOfficeLayout() {
    bctx.fillStyle = "#20263a";
    bctx.fillRect(0, 0, logicalW, logicalH);

    for (var gx = 0; gx < logicalW; gx += 8) {
      bctx.fillStyle = (Math.floor(gx / 8) % 2 === 0) ? "#232a41" : "#252d45";
      bctx.fillRect(gx, 0, 8, logicalH);
    }

    drawZoneRect(zoneDefs.desks, "#2a314a", "#44507a");
    drawZoneRect(zoneDefs.whiteboard, "#2f374f", "#60709f");
    drawZoneRect(zoneDefs.server, "#2a3040", "#495a87");
    drawZoneRect(zoneDefs.coffee, "#3a2e3a", "#8b5b8f");

    for (var i = 0; i < deskRects.length; i++) {
      var d = deskRects[i];
      bctx.fillStyle = "#6d4a30";
      bctx.fillRect(d.x, d.y, d.w, d.h);
      bctx.fillStyle = "#4b301f";
      bctx.fillRect(d.x, d.y + d.h - 3, d.w, 3);
      bctx.fillStyle = "#2b2f45";
      bctx.fillRect(d.x + 3, d.y + 3, 7, 5);
    }

    bctx.fillStyle = "#f8fafc";
    bctx.fillRect(zoneDefs.whiteboard.x + 8, zoneDefs.whiteboard.y + 10, zoneDefs.whiteboard.w - 16, 14);
    bctx.fillStyle = "#7891c9";
    bctx.fillRect(zoneDefs.whiteboard.x + 12, zoneDefs.whiteboard.y + 13, 12, 1);
    bctx.fillRect(zoneDefs.whiteboard.x + 28, zoneDefs.whiteboard.y + 18, 16, 1);

    for (var s = 0; s < 3; s++) {
      var rackX = zoneDefs.server.x + 10;
      var rackY = zoneDefs.server.y + 16 + s * 34;
      bctx.fillStyle = "#1f2534";
      bctx.fillRect(rackX, rackY, 44, 22);
      bctx.strokeStyle = "#5f6a89";
      bctx.strokeRect(rackX + 0.5, rackY + 0.5, 43, 21);
      for (var l = 0; l < 4; l++) {
        bctx.fillStyle = (l % 2 === 0) ? "#4ade80" : "#60a5fa";
        bctx.fillRect(rackX + 4 + l * 9, rackY + 5, 3, 2);
      }
    }

    bctx.fillStyle = "#7a573f";
    bctx.fillRect(zoneDefs.coffee.x + 12, zoneDefs.coffee.y + 8, 30, 18);
    bctx.fillRect(zoneDefs.coffee.x + 54, zoneDefs.coffee.y + 8, 30, 18);
    bctx.fillStyle = "#d7dee9";
    bctx.fillRect(zoneDefs.coffee.x + 93, zoneDefs.coffee.y + 7, 17, 24);
    bctx.fillStyle = "#3b425f";
    bctx.fillRect(zoneDefs.coffee.x + 97, zoneDefs.coffee.y + 12, 9, 6);
    bctx.fillStyle = "#2f354d";
    bctx.fillRect(zoneDefs.coffee.x + 18, zoneDefs.coffee.y + 28, 12, 8);
    bctx.fillRect(zoneDefs.coffee.x + 60, zoneDefs.coffee.y + 28, 12, 8);
  }

  function drawBubble(x, y, text) {
    if (!text) return;
    bctx.font = "6px monospace";
    var tw = Math.ceil(bctx.measureText(text).width);
    var bx = Math.round(x - tw / 2 - 3);
    var by = Math.round(y - 11);
    var bw = tw + 6;
    var bh = 8;

    bctx.fillStyle = "#ffffff";
    bctx.fillRect(bx, by, bw, bh);
    bctx.fillRect(Math.round(x - 1), by + bh, 2, 2);
    bctx.strokeStyle = "#000000";
    bctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    bctx.fillStyle = "#111827";
    bctx.fillText(text, bx + 3, by + 6);
  }

  function drawAgent(agent) {
    var x = Math.round(agent.x);
    var y = Math.round(agent.y);

    if (!isIdle(agent) && agent.task) {
      drawBubble(x + 8, y - 2, agent.task);
    }

    bctx.fillStyle = agent.color;
    bctx.fillRect(x, y, 16, 16);
    bctx.fillStyle = "#ffffff";
    bctx.font = "bold 7px monospace";
    var w = bctx.measureText(agent.initials).width;
    bctx.fillText(agent.initials, x + (16 - w) / 2, y + 11);

    bctx.strokeStyle = "#000000";
    bctx.strokeRect(x + 0.5, y + 0.5, 15, 15);
  }

  function render() {
    drawOfficeLayout();
    agentStates.forEach(drawAgent);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(buffer, 0, 0, logicalW, logicalH, 0, 0, canvas.width, canvas.height);
  }

  function frame(ts) {
    if (!running) return;
    updateAnimation(ts);
    render();
    requestAnimationFrame(frame);
  }

  function resize() {
    var topbar = document.querySelector(".topbar");
    var topbarH = topbar ? topbar.offsetHeight : 52;
    var targetW = Math.max(MIN_WIDTH, window.innerWidth - 20);
    var targetH = Math.max(MIN_HEIGHT, window.innerHeight - topbarH - 22);
    targetW = Math.floor(targetW / SCALE) * SCALE;
    targetH = Math.floor(targetH / SCALE) * SCALE;

    canvas.width = targetW;
    canvas.height = targetH;
    logicalW = Math.floor(targetW / SCALE);
    logicalH = Math.floor(targetH / SCALE);
    buffer.width = logicalW;
    buffer.height = logicalH;

    zoneDefs.desks = { x: 8, y: 16, w: Math.floor(logicalW * 0.35), h: Math.floor(logicalH * 0.72), label: "DESKS" };
    zoneDefs.whiteboard = { x: Math.floor(logicalW * 0.37), y: 8, w: Math.floor(logicalW * 0.34), h: Math.floor(logicalH * 0.24), label: "WHITEBOARD" };
    zoneDefs.server = { x: Math.floor(logicalW * 0.74), y: 14, w: Math.floor(logicalW * 0.22), h: Math.floor(logicalH * 0.64), label: "SERVER-RACK" };
    zoneDefs.coffee = { x: Math.floor(logicalW * 0.34), y: Math.floor(logicalH * 0.70), w: Math.floor(logicalW * 0.40), h: Math.floor(logicalH * 0.24), label: "KAFFEEKUECHE" };

    createDeskRects();
  }

  window.addEventListener("resize", resize);
  window.addEventListener("beforeunload", function () { running = false; });

  resize();
  pollAgents();
  setInterval(pollAgents, 3000);
  requestAnimationFrame(frame);
})();
