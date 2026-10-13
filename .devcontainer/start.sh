#!/usr/bin/env bash
# Runs every time the Codespace starts: launch the app in the background.
cd "$(dirname "$0")/../review-3"
pkill -f "node server.js" 2>/dev/null || true
nohup npm start > /tmp/bank-app.log 2>&1 &
echo "App starting on port 3000 (log: /tmp/bank-app.log)"
