FROM python:3.12-slim

# Runtime for composer/merge DuckDB queries. The backend writes runner.py, the
# SQL and the inputs into /work per run; the image only carries the pinned
# duckdb wheel. Keep it on the same minor as @duckdb/node-api in
# packages/backend/package.json (a backend test checks this).
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt && rm /tmp/requirements.txt

# Runtime workdir the backend writes to: inputs, outputs, DuckDB spill.
RUN mkdir -p /work/in /work/out /work/tmp

# E2B supplies the `user` account; plain Docker builds add it in Dockerfile.local.
RUN chown -R user:user /work
USER user
WORKDIR /work
