# Self-Healing Review — PM2 Error Analysis
Generated: 2026-04-10T08:24:42.749Z
Period: Last 24 hours
Logs analyzed: blun-error.log, blun-out.log, dieter-daemon-error.log, dieter-daemon-out.log, paperclip-error.log

## Top 5 Recurring Errors

### 1. PostgreSQL authentication failure for user "blun"
- **Category:** `DB_AUTH_FAILURE`
- **Occurrences:** 120
- **Log:** dieter-daemon-error.log

**Root Cause:** PostgreSQL user "blun" password mismatch or pg_hba.conf rejects md5/scram auth. dieter-daemon retries every ~30s, flooding logs.

**Fix:**
```
1. Verify password: sudo -u postgres psql -c "ALTER USER blun PASSWORD '<correct_pw>';"
2. Check pg_hba.conf auth method matches (md5 vs scram-sha-256)
3. Restart: sudo systemctl restart postgresql
4. Update .env DB_PASSWORD if changed
```

**Example:**
```
error: password authentication failed for user "blun"
```

---

### 2. WebSocket dashboard client disconnections
- **Category:** `WS_DISCONNECT`
- **Occurrences:** 88
- **Log:** blun-out.log

**Root Cause:** Browser tabs losing WebSocket connections (network idle, tab sleep, navigation). 88 disconnects indicate missing reconnect logic or aggressive keepalive timeout.

**Fix:**
```
1. Add exponential backoff reconnect in dashboard JS client
2. Increase WebSocket pingInterval/pingTimeout in server config
3. Suppress noisy disconnect logs (log only if disconnect is unexpected)
4. Add heartbeat mechanism to detect stale connections
```

**Example:**
```
[ws] Dashboard client disconnected
```

---

### 3. agent_memory foreign key violation (agent_id_fkey)
- **Category:** `FK_CONSTRAINT_AGENT_MEMORY`
- **Occurrences:** 51
- **Log:** dieter-daemon-out.log

**Root Cause:** dieter-daemon inserts into agent_memory with agent_id that does not exist in agents table. Runs every 5min via cron/interval, causing 51+ violations.

**Fix:**
```
1. Check orphan references: SELECT DISTINCT agent_id FROM agent_memory WHERE agent_id NOT IN (SELECT id FROM agents);
2. Fix dieter-daemon to validate agent_id exists before INSERT
3. Add ON DELETE CASCADE or SET NULL to the FK constraint
4. Clean orphans: DELETE FROM agent_memory WHERE agent_id NOT IN (SELECT id FROM agents);
```

**Example:**
```
[2026-04-06T22:23:50.480Z] ERROR: insert or update on table "agent_memory" violates foreign key constraint "agent_memory_agent_id_fkey"
```

---

### 4. Agent task-runner failures (no commits/changes)
- **Category:** `TASK_RUNNER_FAIL`
- **Occurrences:** 40
- **Log:** blun-out.log

**Root Cause:** Claude Code agents complete tasks but produce no git commits or file changes, causing task-runner to mark them as FAIL. 41 failures indicate agents either cannot write to worktrees or tasks require no code changes.

**Fix:**
```
1. Allow tasks to succeed with report-only output (not just commits)
2. Check worktree write permissions: ls -la /root/blun-worktrees/
3. Add task type distinction: code-task vs analysis-task
4. Improve task-runner success criteria beyond "has commits"
```

**Example:**
```
[task-runner] Klaus FAIL task #1795 — no commits or file changes
```

---

### 5. Agent chat API returning HTTP 500 errors
- **Category:** `AGENT_CHAT_500`
- **Occurrences:** 13
- **Log:** blun-out.log

**Root Cause:** POST /api/organisator/agents/:id/chat returns 500. Likely caused by upstream DB auth failure (error #1) or missing agent record. 17 occurrences across multiple agent IDs.

**Fix:**
```
1. Fix DB auth (see error #1) — most 500s cascade from this
2. Add try/catch with specific error response in chat route handler
3. Validate agent exists before forwarding chat request
4. Add circuit breaker to prevent cascading failures when DB is down
```

**Example:**
```
::ffff:127.0.0.1 - POST /api/organisator/agents/24/chat HTTP/1.1 500 61 - 5.350 ms
```

---

## Self-Healing Priority Actions

| Priority | Action | Impact |
|----------|--------|--------|
| P0 | Fix PostgreSQL auth for user "blun" | Stops 120+ DB auth errors + cascading 500s |
| P1 | Fix dieter-daemon agent_memory FK inserts | Stops 51+ constraint violations every 5min |
| P2 | Add WebSocket reconnect + reduce disconnect noise | Stops 88+ noisy log entries |
| P3 | Improve task-runner success criteria | Reduces 41+ false-negative task failures |
| P4 | Fix embedded-postgres permissions | Stops paperclip startup failures |
