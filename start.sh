#!/bin/bash

# Define colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}▶ Starting Backend (Express/Node.js)...${NC}"
cd "daily-report-backend" || exit
npm run dev &
BACKEND_PID=$!
cd ..

echo -e "${GREEN}▶ Starting Frontend (React/Vite)...${NC}"
cd "daily-report-dashboard" || exit
npm run dev &
FRONTEND_PID=$!
cd ..

# Handle Exit (Ctrl+C)
cleanup() {
  echo ""
  echo "Stopping all processes..."
  kill $BACKEND_PID 2>/dev/null
  kill $FRONTEND_PID 2>/dev/null
  echo "✔ Successfully shutdown!"
  exit
}

trap cleanup SIGINT SIGTERM EXIT

# Keep script running
wait $BACKEND_PID $FRONTEND_PID
