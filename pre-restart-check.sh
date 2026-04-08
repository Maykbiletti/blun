#!/bin/bash
node -c /root/blun/server.js 2>/dev/null && \
node -c /root/blun/src/agent-engine.js 2>/dev/null && \
node -c /root/blun/src/routes/organisator.js 2>/dev/null && \
echo "Syntax OK" || { echo "SYNTAX ERROR — aborting restart"; exit 1; }
