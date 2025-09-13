#!/bin/bash

# Movie Tracker Deployment Script
# Usage: ./deploy.sh <branch-name>

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="movietracker"
DEPLOY_DIR="/var/www/movietracker"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if branch name provided
if [ $# -eq 0 ]; then
    print_error "Usage: ./deploy.sh <branch-name>"
    echo "Available branches:"
    git branch -a | grep -E "(main|api-optimizations)" | sed 's/^[ *]*/  /'
    exit 1
fi

BRANCH_NAME="$1"

print_status "Starting deployment of branch: $BRANCH_NAME"
print_status "App: $APP_NAME"
print_status "Directory: $DEPLOY_DIR"

# Navigate to app directory
if [ ! -d "$DEPLOY_DIR" ]; then
    print_error "Directory $DEPLOY_DIR does not exist!"
    exit 1
fi

cd "$DEPLOY_DIR"

# Backup current branch info
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
print_status "Current branch: $CURRENT_BRANCH"

# Fetch latest changes
print_status "Fetching latest changes from repository..."
git fetch origin

# Check if branch exists
if ! git show-ref --verify --quiet refs/remotes/origin/$BRANCH_NAME; then
    print_error "Branch '$BRANCH_NAME' does not exist on remote!"
    print_status "Available remote branches:"
    git branch -r | grep -v HEAD | sed 's/origin\///' | sed 's/^[ *]*/  /'
    exit 1
fi

# Switch to target branch
print_status "Switching to branch: $BRANCH_NAME"
git checkout $BRANCH_NAME

# Pull latest changes
print_status "Pulling latest changes..."
git pull origin $BRANCH_NAME

# Show recent commits
print_status "Recent commits on this branch:"
git log --oneline -n 3

# Restart PM2 application
print_status "Restarting PM2 application: $APP_NAME"
if pm2 list | grep -q "$APP_NAME"; then
    pm2 restart $APP_NAME
else
    print_warning "PM2 app '$APP_NAME' not found. Attempting to start..."
    pm2 start app.js --name $APP_NAME
fi

# Wait a moment for startup
sleep 2

# Check PM2 status
print_status "Checking PM2 application status..."
pm2 status $APP_NAME

# Test if application is responding
print_status "Testing application health..."
if curl -s -f http://localhost:3000/upcoming > /dev/null; then
    print_success "✅ Application is responding correctly!"
else
    print_error "❌ Application health check failed!"
    print_warning "Check logs with: pm2 logs $APP_NAME"
    print_warning "Or rollback with: ./deploy.sh $CURRENT_BRANCH"
    exit 1
fi

# Show recent logs
print_status "Recent application logs:"
pm2 logs $APP_NAME --lines 10 --nostream

print_success "🚀 Deployment completed successfully!"
print_success "Branch: $BRANCH_NAME"
print_success "Status: Application is running and healthy"
print_status "Monitor logs: pm2 logs $APP_NAME --follow"
print_status "Check status: pm2 status $APP_NAME"

# Performance test for optimizations
if [ "$BRANCH_NAME" = "api-optimizations" ]; then
    print_status "Running performance test for optimizations..."
    echo "Testing upcoming route performance..."
    RESPONSE_TIME=$(curl -o /dev/null -s -w "%{time_total}" http://localhost:3000/upcoming?sort=popularity)
    echo "Response time: ${RESPONSE_TIME}s"

    if (( $(echo "$RESPONSE_TIME < 1.0" | bc -l) )); then
        print_success "🚀 Performance optimization working! (${RESPONSE_TIME}s)"
    else
        print_warning "⚠️  First request may be slower (building cache). Try again in 30 seconds."
    fi
fi

print_status "Deployment complete! 🎉"