#!/bin/sh
# The worker restarts if it exits (jobs are durable; a restart only re-claims expired leases). The API serves Render's $PORT.
cd "$(dirname "$0")/../.."
(while true; do python -m services.worker; sleep 5; done) &
exec python -m uvicorn services.api.main:app --host 0.0.0.0 --port "${PORT:-10000}"
