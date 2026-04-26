#!/bin/bash

set -e

# Define colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_PORT=4000
FRONTEND_PORT=5173
BACKEND_PID=""
FRONTEND_PID=""

kill_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo -e "${YELLOW}▶ Clearing port ${port}: ${pids}${NC}"
    kill $pids 2>/dev/null || true
    sleep 1
    pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
    if [ -n "$pids" ]; then
      echo -e "${YELLOW}▶ Force clearing port ${port}: ${pids}${NC}"
      kill -9 $pids 2>/dev/null || true
    fi
  fi
}

# Handle Exit (Ctrl+C)
cleanup() {
  echo ""
  echo "Stopping all processes..."
  if [ -n "$BACKEND_PID" ]; then kill $BACKEND_PID 2>/dev/null || true; fi
  if [ -n "$FRONTEND_PID" ]; then kill $FRONTEND_PID 2>/dev/null || true; fi
  echo "✔ Successfully shutdown!"
  exit
}

trap cleanup SIGINT SIGTERM EXIT

kill_port "$BACKEND_PORT"
kill_port "$FRONTEND_PORT"

echo -e "${BLUE}▶ Starting Backend (Express/Node.js)...${NC}"
cd "$ROOT_DIR/daily-report-backend" || exit
npm run dev &
BACKEND_PID=$!

echo -e "${GREEN}▶ Starting Frontend (React/Vite)...${NC}"
cd "$ROOT_DIR/daily-report-dashboard" || exit
npm run dev -- --host 127.0.0.1 &
FRONTEND_PID=$!

echo -e "${GREEN}✔ Backend restarting on http://localhost:${BACKEND_PORT}${NC}"
echo -e "${GREEN}✔ Frontend restarting on http://localhost:${FRONTEND_PORT}${NC}"

# Keep script running
wait $BACKEND_PID $FRONTEND_PID
