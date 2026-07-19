#!/usr/bin/env bash
set -e
npm install --omit=dev 2>&1 | tail -5 || true
