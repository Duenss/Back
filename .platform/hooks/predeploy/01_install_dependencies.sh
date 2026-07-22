#!/bin/bash

set -xe

# Install Node.js dependencies
npm ci --only=production

echo "Dependencies installed successfully"
