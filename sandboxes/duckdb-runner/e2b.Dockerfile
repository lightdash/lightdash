FROM node:24-slim

# Runtime for composer/merge DuckDB queries. The backend writes runner.mjs and
# the inputs into /work per run; the image only carries the DuckDB warehouse
# client from the workspace's common + warehouses packages (pack-packages.sh).
RUN npm install -g sfw@2.0.6

# Both tarballs are installed together and @lightdash/common is overridden to
# the local tarball, so warehouses never resolves common from the registry.
# --ignore-scripts: no dependency lifecycle scripts; DuckDB ships its native
# binding as a prebuilt platform package.
WORKDIR /opt/lightdash
COPY image-package.json ./package.json
COPY lightdash-common.tgz lightdash-warehouses.tgz ./
RUN sfw npm install --omit=dev --ignore-scripts --no-audit --no-fund \
    && rm lightdash-common.tgz lightdash-warehouses.tgz \
    && npm cache clean --force
ENV NODE_PATH=/opt/lightdash/node_modules

# Runtime workdir the backend writes to: inputs, outputs, DuckDB spill.
RUN mkdir -p /work/in /work/out /work/tmp

# E2B supplies the `user` account; plain Docker builds add it in Dockerfile.local.
RUN chown -R user:user /work
USER user
WORKDIR /work
