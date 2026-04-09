// BLUN Agent System — Performance Scoring, Self-Healing, Mentoring, Gamification
// Extracted from agent-engine.js

var { query, queryOne } = require("../db");

// Forward declarations — set by agent-engine.js after require
var _sendAgentMessage = null;
var _saveAgentMemory = null;
var _routeTask = null;

function setDeps(deps) {
  _sendAgentMessage = deps.sendAgentMessage;
  _saveAgentMemory = deps.saveAgentMemory;
  _routeTask = deps.routeTask;
}

// === SELF-HEALING: Auto-retry failed tasks with error analysis ===
async function selfHealTask(taskId) {
  var task = await queryOne("SELECT t.*, a.name, a.department, a.company_id FROM agent_tasks t JOIN blun_agents a ON a.id = t.agent_id WHERE t.id = $1", [taskId]);
  if (!task || (task.status !== 'failed' && task.status !== 'completed_no_code' && task.status !== 'error')) return null;

  // Analyze error from task result
  var errorContext = (task.result || '').substring(0, 500);
  var diagnosis = '';
  var newTask = task.task;

  // Pattern matching on common errors
  if (errorContext.match(/syntax error|unexpected token|SyntaxError/i)) {
    diagnosis = 'Syntax-Fehler im Code';
    newTask = task.task + '\nWICHTIG: Vorheriger Versuch hatte Syntax-Fehler. Pruefe den Code mit node -c vor dem Commit. Fehler war: ' + errorContext.substring(0, 200);
  } else if (errorContext.match(/cannot find module|module not found/i)) {
    diagnosis = 'Fehlender Import/Require';
    newTask = task.task + '\nWICHTIG: Vorheriger Versuch hatte fehlenden Import. Pruefe alle require() Pfade. Fehler: ' + errorContext.substring(0, 200);
  } else if (errorContext.match(/timeout|ETIMEDOUT/i)) {
    diagnosis = 'Timeout — Task zu komplex oder API nicht erreichbar';
    newTask = task.task + '\nWICHTIG: Vorheriger Versuch hatte Timeout. Halte die Loesung einfach und kompakt. Maximal eine Datei aendern.';
  } else if (errorContext.match(/permission|EACCES|forbidden/i)) {
    diagnosis = 'Permission-Problem';
    newTask = task.task + '\nWICHTIG: Vorheriger Versuch hatte Permission-Fehler. Pruefe Dateipfade und Berechtigungen.';
  } else if (errorContext.match(/no code|no changes|completed_no_code/i)) {
    diagnosis = 'Kein Code produziert — Agent hat nur analysiert';
    newTask = 'WICHTIG: Schreibe SOFORT echten Code. Kein Analysieren, kein Planen.\n' + task.task;
  } else {
    diagnosis = 'Unbekannter Fehler';
    newTask = task.task + '\nWICHTIG: Vorheriger Versuch ist fehlgeschlagen. Versuche einen einfacheren Ansatz. Fehler: ' + errorContext.substring(0, 150);
  }

  // Try different agent if same agent failed 2+ times on this task
  var failCount = await queryOne("SELECT count(*) as c FROM agent_tasks WHERE agent_id = $1 AND status IN ('failed','error','completed_no_code') AND created_at > NOW() - interval '2 hours'", [task.agent_id]);
  var targetAgentId = task.agent_id;

  if (parseInt(failCount.c) >= 2) {
    // Route to different agent in same department
    var alt = await _routeTask(task.task, task.company_id);
    if (alt && alt.id !== task.agent_id) {
      targetAgentId = alt.id;
      console.log('[self-heal] Switching from agent ' + task.agent_id + ' to ' + alt.id + ' (' + alt.name + ')');
    }
  }

  // Create retry task
  var retry = await queryOne(
    "INSERT INTO agent_tasks (agent_id, task, status, parent_task_id, created_at) VALUES ($1, $2, 'pending', $3, NOW()) RETURNING *",
    [targetAgentId, newTask, taskId]
  );

  // Log the heal
  console.log('[self-heal] Task ' + taskId + ' retried as ' + retry.id + ' (diagnosis: ' + diagnosis + ')');

  // Send message to agent about the retry
  await _sendAgentMessage(1, targetAgentId, 'Retry: ' + diagnosis, 'Dein vorheriger Task ist fehlgeschlagen (' + diagnosis + '). Neuer Versuch mit verbesserten Anweisungen. Liefere diesmal sauberen Code.', 'urgent', null);

  return {originalTask: taskId, retryTask: retry.id, diagnosis: diagnosis, agent: targetAgentId};
}

// === MENTORING: Senior agent reviews junior code before QA ===
async function mentorReview(taskId) {
  var task = await queryOne("SELECT t.*, a.name, a.department, a.company_id FROM agent_tasks t JOIN blun_agents a ON a.id = t.agent_id WHERE t.id = $1", [taskId]);
  if (!task || task.status !== 'completed') return null;

  // Find senior agent in same department (or Leon/Helmut as fallback)
  var mentor = await queryOne(
    "SELECT a.id, a.name FROM blun_agents a JOIN agent_performance p ON p.agent_id = a.id WHERE a.department = $1 AND a.id != $2 AND a.status = 'active' AND p.level IN ('senior','mid') ORDER BY p.avg_score DESC LIMIT 1",
    [task.department, task.agent_id]
  );

  // Fallback: Leon (27) for code, Helmut (29) for QA
  if (!mentor) {
    var fallbackId = task.department === 'Qualitaetskontrolle' ? 29 : 27;
    mentor = await queryOne("SELECT id, name FROM blun_agents WHERE id = $1", [fallbackId]);
  }
  if (!mentor) return null;

  // Create mentor review task
  var reviewTask = 'MENTOR-REVIEW fuer Task #' + taskId + ' von ' + task.name + ':\n' +
    'Original-Task: ' + task.task.substring(0, 300) + '\n' +
    'Ergebnis: ' + (task.result || '').substring(0, 500) + '\n\n' +
    'Pruefe den Code auf: 1) Korrektheit 2) Best Practices 3) Sicherheit 4) Edge Cases\n' +
    'Antworte mit MENTOR:PASS oder MENTOR:FAIL + konkretem Feedback.';

  var review = await queryOne(
    "INSERT INTO agent_tasks (agent_id, task, status, parent_task_id, created_at) VALUES ($1, $2, 'pending', $3, NOW()) RETURNING *",
    [mentor.id, reviewTask, taskId]
  );

  console.log('[mentor] Task ' + taskId + ' sent to ' + mentor.name + ' for review');

  return {taskId: taskId, mentorId: mentor.id, mentorName: mentor.name, reviewTaskId: review.id};
}

// === GAMIFICATION: XP, Badges, Achievements ===
async function awardXP(agentId, amount, reason) {
  // XP stored in agent_performance, calculated from tasks
  var perf = await queryOne("SELECT * FROM agent_performance WHERE agent_id = $1", [agentId]);
  if (!perf) return null;

  // Check for achievements
  var achievements = [];
  var completed = parseInt(perf.completed_tasks) || 0;
  var streak = parseInt(perf.streak) || 0;
  var avg = parseFloat(perf.avg_score) || 0;

  if (completed === 10) achievements.push('Erstling: 10 Tasks abgeschlossen');
  if (completed === 50) achievements.push('Arbeiter: 50 Tasks abgeschlossen');
  if (completed === 100) achievements.push('Maschine: 100 Tasks abgeschlossen');
  if (streak >= 10) achievements.push('Unaufhaltbar: 10er Streak');
  if (streak >= 20) achievements.push('Legende: 20er Streak');
  if (avg >= 9.0 && completed >= 20) achievements.push('Perfektionist: 9.0+ Durchschnitt');

  // Save achievements to memory
  if (achievements.length > 0) {
    var existingAch = [];
    try {
      var achMem = await queryOne("SELECT content FROM agent_memory WHERE agent_id = $1 AND key = 'achievements'", [agentId]);
      if (achMem) existingAch = JSON.parse(achMem.content);
    } catch(e) {}

    var newAch = achievements.filter(function(a) { return existingAch.indexOf(a) === -1; });
    if (newAch.length > 0) {
      var allAch = existingAch.concat(newAch);
      await _saveAgentMemory(agentId, 'achievements', JSON.stringify(allAch), ['achievement', 'gamification'], 'achievement');
      // CEO congratulates
      for (var i = 0; i < newAch.length; i++) {
        await _sendAgentMessage(1, agentId, 'Achievement freigeschaltet!', newAch[i], 'normal', null);
        console.log('[gamification] Agent ' + agentId + ' earned: ' + newAch[i]);
      }
    }
  }

  return {agentId: agentId, completed: completed, streak: streak, avg: avg, achievements: achievements};
}

// === CEO INTELLIGENCE: Performance Scoring, Dynamic Routing, Sub-Tasks ===

// Score a completed task (called after QA or completion)
async function scoreTask(taskId, score, feedback) {
  score = Math.max(1, Math.min(10, parseInt(score) || 5));
  await query("UPDATE agent_tasks SET score = $2, feedback = $3 WHERE id = $1", [taskId, score, feedback || '']);

  // Update agent performance stats
  var task = await queryOne("SELECT agent_id FROM agent_tasks WHERE id = $1", [taskId]);
  if (task) {
    await updatePerformance(task.agent_id);
  }
  return {taskId: taskId, score: score};
}

// Recalculate agent performance from task history
async function updatePerformance(agentId) {
  var stats = await queryOne(
    "SELECT count(*) as total, count(*) FILTER (WHERE status = 'completed') as completed, count(*) FILTER (WHERE status = 'failed') as failed, COALESCE(avg(score) FILTER (WHERE score IS NOT NULL), 0) as avg_score FROM agent_tasks WHERE agent_id = $1 AND created_at > NOW() - interval '7 days'",
    [agentId]
  );

  // Calculate streak (consecutive completions)
  var recent = await query(
    "SELECT status FROM agent_tasks WHERE agent_id = $1 ORDER BY completed_at DESC NULLS LAST LIMIT 10",
    [agentId]
  );
  var streak = 0;
  for (var i = 0; i < recent.length; i++) {
    if (recent[i].status === 'completed') streak++;
    else break;
  }

  // Determine level based on performance
  var avg = parseFloat(stats.avg_score) || 0;
  var completed = parseInt(stats.completed) || 0;
  var level = 'junior';
  if (completed >= 20 && avg >= 8) level = 'senior';
  else if (completed >= 10 && avg >= 7) level = 'mid';
  else if (completed >= 5 && avg >= 6) level = 'advanced_junior';

  await query(
    "INSERT INTO agent_performance (agent_id, total_tasks, completed_tasks, failed_tasks, avg_score, streak, level, last_updated) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) ON CONFLICT (agent_id) DO UPDATE SET total_tasks = $2, completed_tasks = $3, failed_tasks = $4, avg_score = $5, streak = $6, level = $7, last_updated = NOW()",
    [agentId, parseInt(stats.total), completed, parseInt(stats.failed), avg, streak, level]
  );

  // Zuckerbrot: Agent mit hohem Score bekommt Lob-Memory
  if (streak >= 5 && avg >= 8) {
    await _saveAgentMemory(agentId, 'ceo_feedback', 'CEO Dieter Junior: Hervorragende Arbeit! ' + streak + ' Tasks in Folge erfolgreich. Du bist auf Senior-Level. Weiter so!', ['feedback', 'praise'], 'feedback');
  }
  // Peitsche: Agent mit niedrigem Score bekommt Warnung
  if (streak === 0 && parseInt(stats.failed) >= 2) {
    await _saveAgentMemory(agentId, 'ceo_feedback', 'CEO Dieter Junior: WARNUNG. ' + stats.failed + ' fehlgeschlagene Tasks in den letzten 7 Tagen. Naechster Fail = Pause. Konzentrier dich und liefere sauberen Code.', ['feedback', 'warning'], 'feedback');
  }

  return {agentId: agentId, level: level, avg_score: avg, streak: streak};
}

// Dynamic Routing: Find best agent for a task based on performance + department
async function routeTask(taskDescription, companyId) {
  var tdl = taskDescription.toLowerCase();

  // Determine target department from task content
  var dept = null;
  if (tdl.indexOf('css') !== -1 || tdl.indexOf('design') !== -1 || tdl.indexOf('responsive') !== -1 || tdl.indexOf('html') !== -1 || tdl.indexOf('ui') !== -1) dept = 'Frontend & Design';
  else if (tdl.indexOf('route') !== -1 || tdl.indexOf('api') !== -1 || tdl.indexOf('backend') !== -1 || tdl.indexOf('sql') !== -1 || tdl.indexOf('db') !== -1) dept = 'Backend & Coding';
  else if (tdl.indexOf('test') !== -1 || tdl.indexOf('qa') !== -1 || tdl.indexOf('bug') !== -1) dept = 'Qualitaetskontrolle';
  else if (tdl.indexOf('deploy') !== -1 || tdl.indexOf('server') !== -1 || tdl.indexOf('nginx') !== -1 || tdl.indexOf('pm2') !== -1) dept = 'Infrastruktur & DevOps';
  else if (tdl.indexOf('seo') !== -1 || tdl.indexOf('marketing') !== -1 || tdl.indexOf('content') !== -1 || tdl.indexOf('social') !== -1) dept = 'Marketing';
  else if (tdl.indexOf('stripe') !== -1 || tdl.indexOf('billing') !== -1 || tdl.indexOf('payment') !== -1) dept = 'Business & Billing';

  // Find best agent: active, matching department, highest performance
  var whereClause = "WHERE a.status = 'active' AND a.id != 1";
  var params = [];
  if (companyId) { whereClause += " AND a.company_id = $1"; params.push(companyId); }
  if (dept) { whereClause += " AND a.department = $" + (params.length + 1); params.push(dept); }

  var candidates = await query(
    "SELECT a.id, a.name, a.department, COALESCE(p.avg_score, 0) as score, COALESCE(p.level, 'junior') as level, COALESCE(p.streak, 0) as streak, (SELECT count(*) FROM agent_tasks t WHERE t.agent_id = a.id AND t.status IN ('pending','in_progress','processing')) as active_tasks FROM blun_agents a LEFT JOIN agent_performance p ON p.agent_id = a.id " + whereClause + " ORDER BY active_tasks ASC, score DESC, streak DESC LIMIT 5",
    params
  );

  if (!candidates.length) return null;

  // Prefer agent with fewest active tasks and highest score
  return candidates[0];
}

// Split a large task into sub-tasks
async function splitTask(parentTaskId, subTasks) {
  var parent = await queryOne("SELECT * FROM agent_tasks WHERE id = $1", [parentTaskId]);
  if (!parent) return [];

  var created = [];
  for (var i = 0; i < subTasks.length; i++) {
    var sub = subTasks[i];
    var agent = sub.agent_id || (await routeTask(sub.task, null));
    var agentId = agent ? (agent.id || agent) : parent.agent_id;

    var row = await queryOne(
      "INSERT INTO agent_tasks (agent_id, task, status, parent_task_id, created_at) VALUES ($1, $2, 'pending', $3, NOW()) RETURNING *",
      [agentId, sub.task, parentTaskId]
    );
    created.push(row);
  }

  // Mark parent as 'split'
  await query("UPDATE agent_tasks SET status = 'split', result = $2 WHERE id = $1", [parentTaskId, created.length + ' sub-tasks created']);

  return created;
}

// Get performance leaderboard
async function getLeaderboard(companyId) {
  var where = companyId ? "WHERE a.company_id = $1" : "";
  var params = companyId ? [companyId] : [];
  var rows = await query(
    "SELECT a.id, a.name, a.department, p.total_tasks, p.completed_tasks, p.failed_tasks, p.avg_score, p.streak, p.level FROM blun_agents a JOIN agent_performance p ON p.agent_id = a.id " + where + " ORDER BY p.avg_score DESC, p.completed_tasks DESC",
    params
  );
  return rows;
}

// Auto-score tasks based on hasChanges and QA result
async function autoScoreTask(taskId, hasChanges, qaPassed) {
  var score = 5; // baseline
  if (hasChanges) score += 2; // produced code
  if (qaPassed === true) score += 2; // passed QA
  if (qaPassed === false) score -= 3; // failed QA
  if (!hasChanges) score -= 2; // no code produced
  score = Math.max(1, Math.min(10, score));

  var feedback = '';
  if (score >= 8) feedback = 'Sehr gut — Code produziert und QA bestanden.';
  else if (score >= 5) feedback = 'Akzeptabel — aber Verbesserungspotential.';
  else feedback = 'Mangelhaft — kein brauchbares Ergebnis.';

  return scoreTask(taskId, score, feedback);
}



// === CEO INTELLIGENCE: Performance Scoring, Dynamic Routing, Sub-Tasks ===

// Score a completed task (called after QA or completion)
async function scoreTask(taskId, score, feedback) {
  score = Math.max(1, Math.min(10, parseInt(score) || 5));
  await query("UPDATE agent_tasks SET score = $2, feedback = $3 WHERE id = $1", [taskId, score, feedback || '']);

  // Update agent performance stats
  var task = await queryOne("SELECT agent_id FROM agent_tasks WHERE id = $1", [taskId]);
  if (task) {
    await updatePerformance(task.agent_id);
  }
  return {taskId: taskId, score: score};
}

// Recalculate agent performance from task history
async function updatePerformance(agentId) {
  var stats = await queryOne(
    "SELECT count(*) as total, count(*) FILTER (WHERE status = 'completed') as completed, count(*) FILTER (WHERE status = 'failed') as failed, COALESCE(avg(score) FILTER (WHERE score IS NOT NULL), 0) as avg_score FROM agent_tasks WHERE agent_id = $1 AND created_at > NOW() - interval '7 days'",
    [agentId]
  );

  // Calculate streak (consecutive completions)
  var recent = await query(
    "SELECT status FROM agent_tasks WHERE agent_id = $1 ORDER BY completed_at DESC NULLS LAST LIMIT 10",
    [agentId]
  );
  var streak = 0;
  for (var i = 0; i < recent.length; i++) {
    if (recent[i].status === 'completed') streak++;
    else break;
  }

  // Determine level based on performance
  var avg = parseFloat(stats.avg_score) || 0;
  var completed = parseInt(stats.completed) || 0;
  var level = 'junior';
  if (completed >= 20 && avg >= 8) level = 'senior';
  else if (completed >= 10 && avg >= 7) level = 'mid';
  else if (completed >= 5 && avg >= 6) level = 'advanced_junior';

  await query(
    "INSERT INTO agent_performance (agent_id, total_tasks, completed_tasks, failed_tasks, avg_score, streak, level, last_updated) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) ON CONFLICT (agent_id) DO UPDATE SET total_tasks = $2, completed_tasks = $3, failed_tasks = $4, avg_score = $5, streak = $6, level = $7, last_updated = NOW()",
    [agentId, parseInt(stats.total), completed, parseInt(stats.failed), avg, streak, level]
  );

  // Zuckerbrot: Agent mit hohem Score bekommt Lob-Memory
  if (streak >= 5 && avg >= 8) {
    await saveAgentMemory(agentId, 'ceo_feedback', 'CEO Dieter Junior: Hervorragende Arbeit! ' + streak + ' Tasks in Folge erfolgreich. Du bist auf Senior-Level. Weiter so!', ['feedback', 'praise'], 'feedback');
  }
  // Peitsche: Agent mit niedrigem Score bekommt Warnung
  if (streak === 0 && parseInt(stats.failed) >= 2) {
    await saveAgentMemory(agentId, 'ceo_feedback', 'CEO Dieter Junior: WARNUNG. ' + stats.failed + ' fehlgeschlagene Tasks in den letzten 7 Tagen. Naechster Fail = Pause. Konzentrier dich und liefere sauberen Code.', ['feedback', 'warning'], 'feedback');
  }

  return {agentId: agentId, level: level, avg_score: avg, streak: streak};
}

// Dynamic Routing: Find best agent for a task based on performance + department
async function routeTask(taskDescription, companyId) {
  var tdl = taskDescription.toLowerCase();

  // Determine target department from task content
  var dept = null;
  if (tdl.indexOf('css') !== -1 || tdl.indexOf('design') !== -1 || tdl.indexOf('responsive') !== -1 || tdl.indexOf('html') !== -1 || tdl.indexOf('ui') !== -1) dept = 'Frontend & Design';
  else if (tdl.indexOf('route') !== -1 || tdl.indexOf('api') !== -1 || tdl.indexOf('backend') !== -1 || tdl.indexOf('sql') !== -1 || tdl.indexOf('db') !== -1) dept = 'Backend & Coding';
  else if (tdl.indexOf('test') !== -1 || tdl.indexOf('qa') !== -1 || tdl.indexOf('bug') !== -1) dept = 'Qualitaetskontrolle';
  else if (tdl.indexOf('deploy') !== -1 || tdl.indexOf('server') !== -1 || tdl.indexOf('nginx') !== -1 || tdl.indexOf('pm2') !== -1) dept = 'Infrastruktur & DevOps';
  else if (tdl.indexOf('seo') !== -1 || tdl.indexOf('marketing') !== -1 || tdl.indexOf('content') !== -1 || tdl.indexOf('social') !== -1) dept = 'Marketing';
  else if (tdl.indexOf('stripe') !== -1 || tdl.indexOf('billing') !== -1 || tdl.indexOf('payment') !== -1) dept = 'Business & Billing';

  // Find best agent: active, matching department, highest performance
  var whereClause = "WHERE a.status = 'active' AND a.id != 1";
  var params = [];
  if (companyId) { whereClause += " AND a.company_id = $1"; params.push(companyId); }
  if (dept) { whereClause += " AND a.department = $" + (params.length + 1); params.push(dept); }

  var candidates = await query(
    "SELECT a.id, a.name, a.department, COALESCE(p.avg_score, 0) as score, COALESCE(p.level, 'junior') as level, COALESCE(p.streak, 0) as streak, (SELECT count(*) FROM agent_tasks t WHERE t.agent_id = a.id AND t.status IN ('pending','in_progress','processing')) as active_tasks FROM blun_agents a LEFT JOIN agent_performance p ON p.agent_id = a.id " + whereClause + " ORDER BY active_tasks ASC, score DESC, streak DESC LIMIT 5",
    params
  );

  if (!candidates.length) return null;

  // Prefer agent with fewest active tasks and highest score
  return candidates[0];
}

// Split a large task into sub-tasks
async function splitTask(parentTaskId, subTasks) {
  var parent = await queryOne("SELECT * FROM agent_tasks WHERE id = $1", [parentTaskId]);
  if (!parent) return [];

  var created = [];
  for (var i = 0; i < subTasks.length; i++) {
    var sub = subTasks[i];
    var agent = sub.agent_id || (await routeTask(sub.task, null));
    var agentId = agent ? (agent.id || agent) : parent.agent_id;

    var row = await queryOne(
      "INSERT INTO agent_tasks (agent_id, task, status, parent_task_id, created_at) VALUES ($1, $2, 'pending', $3, NOW()) RETURNING *",
      [agentId, sub.task, parentTaskId]
    );
    created.push(row);
  }

  // Mark parent as 'split'
  await query("UPDATE agent_tasks SET status = 'split', result = $2 WHERE id = $1", [parentTaskId, created.length + ' sub-tasks created']);

  return created;
}

// Get performance leaderboard
async function getLeaderboard(companyId) {
  var where = companyId ? "WHERE a.company_id = $1" : "";
  var params = companyId ? [companyId] : [];
  var rows = await query(
    "SELECT a.id, a.name, a.department, p.total_tasks, p.completed_tasks, p.failed_tasks, p.avg_score, p.streak, p.level FROM blun_agents a JOIN agent_performance p ON p.agent_id = a.id " + where + " ORDER BY p.avg_score DESC, p.completed_tasks DESC",
    params
  );
  return rows;
}

// Auto-score tasks based on hasChanges and QA result
async function autoScoreTask(taskId, hasChanges, qaPassed) {
  var score = 5; // baseline
  if (hasChanges) score += 2; // produced code
  if (qaPassed === true) score += 2; // passed QA
  if (qaPassed === false) score -= 3; // failed QA
  if (!hasChanges) score -= 2; // no code produced
  score = Math.max(1, Math.min(10, score));

  var feedback = '';
  if (score >= 8) feedback = 'Sehr gut — Code produziert und QA bestanden.';
  else if (score >= 5) feedback = 'Akzeptabel — aber Verbesserungspotential.';
  else feedback = 'Mangelhaft — kein brauchbares Ergebnis.';

  return scoreTask(taskId, score, feedback);
}

// === AGENT-TO-AGENT MESSAGING ===
async function sendAgentMessage(fromId, toId, subject, content, priority, replyTo) {
  var msg = await queryOne(
    "INSERT INTO agent_messages (from_agent_id, to_agent_id, subject, content, priority, in_reply_to) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
    [fromId, toId, subject || '', content, priority || 'normal', replyTo || null]
  );
  return msg;
}

async function getAgentInbox(agentId, status, limit) {
  limit = limit || 20;
  var where = "WHERE to_agent_id = $1";
  var params = [agentId];
  if (status) { where += " AND status = $2"; params.push(status); }
  params.push(limit);
  var rows = await query(
    "SELECT m.*, a.name as from_name FROM agent_messages m JOIN blun_agents a ON a.id = m.from_agent_id " + where + " ORDER BY created_at DESC LIMIT $" + params.length,
    params
  );
  return rows;
}

async function markMessageRead(messageId, agentId) {
  await query("UPDATE agent_messages SET status = 'read' WHERE id = $1 AND to_agent_id = $2", [messageId, agentId]);
}

async function replyToMessage(originalMsgId, fromId, content) {
  var orig = await queryOne("SELECT * FROM agent_messages WHERE id = $1", [originalMsgId]);
  if (!orig) return null;
  return sendAgentMessage(fromId, orig.from_agent_id, 'Re: ' + (orig.subject || ''), content, orig.priority, originalMsgId);
}

async function broadcastMessage(fromId, subject, content, department) {
  var where = department ? "WHERE department = $1 AND status != 'disabled'" : "WHERE status != 'disabled'";
  var params = department ? [department] : [];
  var agents = await query("SELECT id FROM blun_agents " + where, params);
  var sent = 0;
  for (var i = 0; i < agents.length; i++) {
    if (agents[i].id !== fromId) {
      await sendAgentMessage(fromId, agents[i].id, subject, content, 'normal', null);
      sent++;
    }
  }
  return sent;
}

async function getUnreadSummary(agentId) {
  var unread = await query(
    "SELECT m.subject, m.content, a.name as from_name, m.priority FROM agent_messages m JOIN blun_agents a ON a.id = m.from_agent_id WHERE m.to_agent_id = $1 AND m.status = 'unread' ORDER BY m.created_at DESC LIMIT 5",
    [agentId]
  );
  if (!unread.length) return '';
  var lines = unread.map(function(m) {
    return (m.priority === 'urgent' ? '[DRINGEND] ' : '') + m.from_name + ': ' + (m.subject ? m.subject + ' -- ' : '') + m.content.substring(0, 200);
  });
  await query("UPDATE agent_messages SET status = 'read' WHERE to_agent_id = $1 AND status = 'unread'", [agentId]);
  return '\nNachrichten von anderen Agents:\n' + lines.join('\n');
}


module.exports = { selfHealTask, mentorReview, awardXP, scoreTask, updatePerformance, routeTask, splitTask, getLeaderboard, autoScoreTask, setDeps };
