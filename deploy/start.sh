#!/bin/sh
# Hosted single container (docs/hosting.md): API and worker on loopback, the web app on the public port.
# Each loop restarts its process if it exits; the worker is durable, so a restart only re-claims leased jobs.
cd "$(dirname "$0")/.."
(while true; do python -m uvicorn services.api.main:app --host 127.0.0.1 --port 8000; sleep 3; done) &
(while true; do python -m services.worker; sleep 5; done) &
cd apps/web && exec node_modules/.bin/next start -H 0.0.0.0 -p "${PORT:-7860}"
