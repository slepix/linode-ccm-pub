#!/bin/bash
cd "$(dirname "$0")"
python -m app.migrations.run_migrations
uvicorn main:app --host 0.0.0.0 --port 8000
