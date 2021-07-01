FROM nikolaik/python-nodejs:python3.8-nodejs14 AS base

WORKDIR /usr/app


# -----------------------------
# Stage 1: install dependencies
# -----------------------------
FROM base AS dbt-builder

# dbt
RUN python -m venv /usr/local/venv
RUN /usr/local/venv/bin/pip install dbt

# Install gcloud sdk
RUN apt-get update && apt-get install -y --no-install-recommends curl
RUN curl https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-sdk-341.0.0-linux-x86_64.tar.gz > /tmp/gcloud-sdk.tar.gz
RUN mkdir /usr/local/gcloud && tar -C /usr/local/gcloud -xvf /tmp/gcloud-sdk.tar.gz


# -------------------------------
# Stage 2: base with dependencies
# -------------------------------
FROM base as base-dependencies

# Copy in dependencies
COPY --from=dbt-builder /usr/local/venv /usr/local/venv
ENV PATH $PATH:/usr/local/venv/bin
COPY --from=dbt-builder /usr/local/gcloud /usr/local/gcloud
ENV PATH $PATH:/usr/local/gcloud/google-cloud-sdk/bin

# Setup common config
COPY lightdash.yml /usr/app/lightdash.yml
ENV LIGHTDASH_CONFIG_FILE /usr/app/lightdash.yml


# -------------------------
# Stage 3a: dev environment
# -------------------------
FROM base-dependencies as dev

COPY . .
COPY ./docker/dev-entrypoint.sh /usr/bin/dev-entrypoint.sh
ENTRYPOINT ["/usr/bin/dev-entrypoint.sh"]
EXPOSE 3000
EXPOSE 8080


# ---------------------------------------------------------------
# Stage 3b: build the common, backend, and frontend distributions
# ---------------------------------------------------------------
FROM base AS prod-builder

# Install development dependencies for all
COPY package.json .
COPY yarn.lock .
COPY packages/common/package.json ./packages/common/
COPY packages/backend/package.json ./packages/backend/
COPY packages/frontend/package.json ./packages/frontend/
RUN yarn install --pure-lockfile --non-interactive

# Build common
COPY packages/common/tsconfig.json ./packages/common/
COPY packages/common/src/ ./packages/common/src/
RUN yarn --cwd ./packages/common/ build

# Build backend
COPY packages/backend/tsconfig.json ./packages/backend/
COPY packages/backend/src/ ./packages/backend/src
RUN yarn --cwd ./packages/backend/ build

# Build frontend
ARG REACT_APP_RUDDERSTACK_DATAPLANE_URL
ARG REACT_APP_RUDDERSTACK_WRITE_KEY
COPY packages/frontend ./packages/frontend
RUN yarn --cwd ./packages/frontend/ build


# ------------------------------------------
# Stage 4: execution environment for backend
# ------------------------------------------
FROM base-dependencies as prod

ENV NODE_ENV production

# Copy distributions into environment
COPY --from=prod-builder /usr/app/packages/common/package.json /usr/app/packages/common/package.json
COPY --from=prod-builder /usr/app/packages/common/dist /usr/app/packages/common/dist


COPY --from=prod-builder /usr/app/packages/backend/package.json /usr/app/packages/backend/package.json
COPY --from=prod-builder /usr/app/packages/backend/dist /usr/app/packages/backend/dist


COPY --from=prod-builder /usr/app/packages/frontend/package.json /usr/app/packages/frontend/package.json
COPY --from=prod-builder /usr/app/packages/frontend/build /usr/app/packages/frontend/build

# Install production dependencies
COPY package.json .
COPY yarn.lock .
RUN yarn install --pure-lockfile --non-interactive --production

# Run backend
WORKDIR /usr/app/packages/backend
EXPOSE 8080
CMD ["yarn", "start"]
