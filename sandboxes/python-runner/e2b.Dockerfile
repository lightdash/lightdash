FROM python:3.12-slim

# Data-science runtime for python query nodes. The harness (runner.py) is
# written into the sandbox per run by the backend, so this image only needs
# the libraries user code may import. Keep the list deliberately small and
# pinned; users cannot pip install at runtime (no egress).
RUN pip install --no-cache-dir \
    "pandas==2.2.3" \
    "numpy==2.2.4" \
    "scipy==1.15.2" \
    "pyarrow==19.0.1"

# Runtime workdir the backend writes to (see pythonQueryHarness.ts).
RUN mkdir -p /work/in /work/out

# E2B supplies the `user` account; plain Docker builds add it in Dockerfile.local.
RUN chown -R user:user /work
USER user
WORKDIR /work
