#!/bin/bash

# AWS Pricing Assistant - Server Restart Script
# This script properly kills existing servers and starts fresh ones on correct ports

set -e  # Exit on any error

# Resolve project root from the script's location so this works wherever cloned.
PROJECT_ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "🔄 AWS Pricing Assistant - Restarting Servers"
echo "=============================================="

# Function to kill processes more aggressively
kill_processes() {
    echo "🔍 Killing all related processes..."
    
    # Kill by port
    pkill -f ":3001" 2>/dev/null || true
    pkill -f ":5173" 2>/dev/null || true
    
    # Kill by process pattern
    pkill -f "tsx.*src/index.ts" 2>/dev/null || true
    pkill -f "npm run dev" 2>/dev/null || true
    pkill -f "aws-pricing-assistant" 2>/dev/null || true
    
    # Kill by port using lsof
    lsof -ti:3001 2>/dev/null | xargs kill -9 2>/dev/null || true
    lsof -ti:5173 2>/dev/null | xargs kill -9 2>/dev/null || true
    
    # Wait for cleanup
    sleep 2
    echo "✅ Process cleanup completed"
}

# Step 1: Kill existing processes
echo ""
echo "📋 Step 1: Cleaning up existing processes"
echo "----------------------------------------"
kill_processes

# Step 2: Start Backend Server with cleaner logging
echo ""
echo "📋 Step 2: Starting Backend Server (Port 3001)"
echo "----------------------------------------------"

cd "$PROJECT_ROOT/backend"

# Clear old log
> ../backend.log

echo "🚀 Starting backend server..."
# Use nohup to avoid tsx restart messages
nohup npm run dev >> ../backend.log 2>&1 &
BACKEND_PID=$!

# Wait for backend to start
echo "⏳ Waiting for backend to initialize..."
sleep 5

# Check if backend started successfully
if kill -0 $BACKEND_PID 2>/dev/null && lsof -i:3001 >/dev/null 2>&1; then
    echo "✅ Backend server started successfully (PID: $BACKEND_PID)"
else
    echo "❌ Backend server failed to start"
    echo "Backend logs:"
    tail -20 ../backend.log
    exit 1
fi

# Step 3: Start Frontend Server
echo ""
echo "📋 Step 3: Starting Frontend Server (Port 5173)"
echo "-----------------------------------------------"

cd "$PROJECT_ROOT/frontend"

# Clear old log
> ../frontend.log

echo "🚀 Starting frontend server..."
# Use nohup to avoid restart messages
nohup npm run dev >> ../frontend.log 2>&1 &
FRONTEND_PID=$!

# Wait for frontend to start
echo "⏳ Waiting for frontend to initialize..."
sleep 5

# Check if frontend started successfully
if kill -0 $FRONTEND_PID 2>/dev/null; then
    echo "✅ Frontend server started successfully (PID: $FRONTEND_PID)"
else
    echo "❌ Frontend server failed to start"
    echo "Frontend logs:"
    tail -20 ../frontend.log
    exit 1
fi

# Step 4: Final Status Check
echo ""
echo "📋 Step 4: Final Status Check"
echo "-----------------------------"

cd "$PROJECT_ROOT"

echo "🔍 Port usage:"
echo "Port 3001 (Backend):"
lsof -i:3001 2>/dev/null || echo "  No process listening"
echo "Port 5173 (Frontend):"
lsof -i:5173 2>/dev/null || echo "  No process listening"

echo ""
echo "🎉 Server restart completed!"
echo "=========================="
echo "Backend:  http://localhost:3001"
echo "Frontend: http://localhost:5173"
echo ""
echo "💡 To monitor logs (clean):"
echo "   Backend:  tail -f backend.log | grep -v 'Process didn'"'"'t exit'"
echo "   Frontend: tail -f frontend.log | grep -v 'Process didn'"'"'t exit'"
echo ""
echo "💡 To stop servers:"
echo "   kill $BACKEND_PID $FRONTEND_PID"
