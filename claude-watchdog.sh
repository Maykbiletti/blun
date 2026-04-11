#!/bin/bash
# Claude Watchdog — runs every 10 min, silent (no Telegram), logs to /tmp/claude-watchdog.log
LOG=/tmp/claude-watchdog.log
TS=$(date '+%Y-%m-%d %H:%M:%S')
PGCMD="PGPASSWORD=blun2026secure psql -h localhost -U blun -d blun -t -A"

log() { echo "[$TS] $*" >> "$LOG"; }

# Step 2: Query last 15 min Claude completions
QUERY="SELECT id, agent_id, (result::jsonb->>'changed_files_count')::int AS files, (result::jsonb->>'output_length')::int AS olen FROM agent_tasks WHERE status='completed' AND created_at > NOW()-INTERVAL '15 minutes' AND result::jsonb->>'cli'='claude' ORDER BY id DESC LIMIT 20;"
ROWS=$(eval $PGCMD -c "'$QUERY'" 2>/dev/null)

# Step 3: No completions → nothing to check
if [ -z "$ROWS" ]; then
  log "CHECK no-claude-completions-15min — nothing to do"
  exit 0
fi

TOTAL=$(echo "$ROWS" | grep -c '|')
# Step 4: At least 1 with files>=1 AND olen>200 → OK
HAS_GOOD=0
while IFS='|' read -r id aid files olen; do
  files=${files:-0}; olen=${olen:-0}
  if [ "$files" -ge 1 ] 2>/dev/null && [ "$olen" -gt 200 ] 2>/dev/null; then
    HAS_GOOD=1
    break
  fi
done <<< "$ROWS"

if [ "$HAS_GOOD" -eq 1 ]; then
  log "CHECK OK — $TOTAL claude completions, at least 1 productive (id=$id files=$files olen=$olen)"
  exit 0
fi

# Step 5: All stubs
log "CHECK STUB — $TOTAL claude completions, ALL stubs (files=0/olen<200). Starting repair."

# 5a: Check OAuth token expiry
CREDS=/root/.claude/.credentials.json
if [ -f "$CREDS" ]; then
  EXPIRES=$(python3 -c "import json,sys; d=json.load(open('$CREDS')); print(d.get('expiresAt',''))" 2>/dev/null)
  if [ -n "$EXPIRES" ]; then
    NOW_MS=$(date +%s%3N 2>/dev/null || python3 -c "import time;print(int(time.time()*1000))")
    if [ "$EXPIRES" -lt "$NOW_MS" ] 2>/dev/null; then
      log "REPAIR OAUTH_EXPIRED — token expiresAt=$EXPIRES < now=$NOW_MS. Cannot auto-fix, need manual re-auth."
      exit 1
    else
      log "REPAIR oauth-token-valid (expiresAt=$EXPIRES)"
    fi
  fi
fi

# 5b: Direct CLI test
log "REPAIR testing-cli-direct"
CLI_OUT=$(echo "Reply with exactly: WATCHDOG_OK" | IS_SANDBOX=1 DISABLE_INTERACTIVITY=1 timeout 60 claude --print --dangerously-skip-permissions --add-dir /root/blun --max-turns 1 2>&1)
CLI_RC=$?
CLI_LEN=${#CLI_OUT}

if [ $CLI_RC -eq 0 ] && [ $CLI_LEN -gt 50 ]; then
  log "REPAIR cli-direct-ok (rc=$CLI_RC len=$CLI_LEN) — restarting dieter-daemon"
  # 5c: CLI works but tasks produce stubs → restart daemon
  pm2 restart dieter-daemon 2>/dev/null
  sleep 60

  # Recheck
  ROWS2=$(eval $PGCMD -c "'$QUERY'" 2>/dev/null)
  HAS_GOOD2=0
  while IFS='|' read -r id2 aid2 files2 olen2; do
    files2=${files2:-0}; olen2=${olen2:-0}
    if [ "$files2" -ge 1 ] 2>/dev/null && [ "$olen2" -gt 200 ] 2>/dev/null; then
      HAS_GOOD2=1; break
    fi
  done <<< "$ROWS2"

  if [ "$HAS_GOOD2" -eq 1 ]; then
    log "REPAIR SUCCESS after dieter-daemon restart (id=$id2 files=$files2 olen=$olen2)"
    exit 0
  fi
  log "REPAIR dieter-daemon restart did not fix stubs"
else
  log "REPAIR cli-direct-FAILED (rc=$CLI_RC len=$CLI_LEN)"

  # 5c: Compare with Paperclip args
  PAPERCLIP_ARGS=$(grep -A5 'buildClaudeArgs' /root/paperclip/packages/adapters/claude-local/src/server/execute.ts 2>/dev/null | head -8)
  BLUN_ARGS=$(grep -A5 'cliName === "claude"' /root/blun/src/agent/task-runner.js 2>/dev/null | head -6)
  log "REPAIR paperclip-args: $(echo $PAPERCLIP_ARGS | tr '\n' ' ')"
  log "REPAIR blun-args: $(echo $BLUN_ARGS | tr '\n' ' ')"

  # Check if IS_SANDBOX and DISABLE_INTERACTIVITY are set in task-runner
  HAS_SANDBOX=$(grep 'IS_SANDBOX' /root/blun/src/agent/task-runner.js | head -1)
  if [ -z "$HAS_SANDBOX" ]; then
    log "REPAIR MISSING IS_SANDBOX in task-runner.js — adding"
    DATEBAK=$(date '+%Y%m%d_%H%M%S')
    cp /root/blun/src/agent/task-runner.js /root/blun/src/agent/task-runner.js.bak_${DATEBAK}_watchdog
    # This is a known fix — add IS_SANDBOX=1
    sed -i 's/DISABLE_INTERACTIVITY: "1"/DISABLE_INTERACTIVITY: "1", IS_SANDBOX: "1"/' /root/blun/src/agent/task-runner.js
  fi
fi

# 5e: Full restart
log "REPAIR full-restart blun + dieter-daemon"
pm2 restart blun 2>/dev/null
pm2 restart dieter-daemon 2>/dev/null
sleep 60

# Final recheck
ROWS3=$(eval $PGCMD -c "'$QUERY'" 2>/dev/null)
HAS_GOOD3=0
while IFS='|' read -r id3 aid3 files3 olen3; do
  files3=${files3:-0}; olen3=${olen3:-0}
  if [ "$files3" -ge 1 ] 2>/dev/null && [ "$olen3" -gt 200 ] 2>/dev/null; then
    HAS_GOOD3=1; break
  fi
done <<< "$ROWS3"

if [ "$HAS_GOOD3" -eq 1 ]; then
  log "REPAIR SUCCESS after full restart (id=$id3 files=$files3 olen=$olen3)"
  exit 0
fi

log "REPAIR FAILED — all attempts exhausted. Will retry next 10-min run."
exit 1
