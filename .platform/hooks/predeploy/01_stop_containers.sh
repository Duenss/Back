#!/bin/bash

set -xe

if command -v docker >/dev/null 2>&1; then
  containers=$(docker ps -q -f status=running || true)
  if [ -n "$containers" ]; then
    docker stop $containers || true
  fi
fi
