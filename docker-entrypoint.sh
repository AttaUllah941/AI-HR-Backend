#!/bin/sh
set -e
# Ensure writable dirs for bind/named volumes (often root-owned on first mount).
mkdir -p /app/uploads /app/logs
chown -R zenith:zenith /app/uploads /app/logs 2>/dev/null || true
exec su-exec zenith "$@"
