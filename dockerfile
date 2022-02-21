FROM nikolaik/python-nodejs:python3.8-nodejs14@sha256:f7d84950cac6a56e99e99747aad93ad77f949475ac1a5e9782669b8f5bedd2b6 AS base

WORKDIR /usr/app


# -----------------------------
# Stage 1: install dependencies
# -----------------------------
FROM base AS dependencies-builder

# odbc - databricks
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    libsasl2-modules-gssapi-mit
RUN wget \
    --quiet \
    https://databricks-bi-artifacts.s3.us-east-2.amazonaws.com/simbaspark-drivers/odbc/2.6.18/SimbaSparkODBC-2.6.18.1030-Debian-64bit.zip \
    -O /tmp/databricks_odbc.zip \
    && unzip /tmp/databricks_odbc.zip -d /tmp \
    && dpkg -i /tmp/simbaspark_*.deb


# -------------------------------
# Stage 2: base with dependencies
# -------------------------------
FROM base as base-dependencies

# odbc
COPY --from=dependencies-builder /opt/simba /opt/simba
# TODO: prefer in stage 1 - needed for yarn install and pip install
RUN apt-get update && apt-get install -y --no-install-recommends \
    g++ \
    unixodbc-dev \
    software-properties-common

# Install latest git
RUN add-apt-repository "deb http://deb.debian.org/debian buster-backports main"
RUN apt-get update && apt-get -y -t buster-backports install git

# dbt
# TODO: prefer in stage 1
RUN python -m venv /usr/local/venv
RUN /usr/local/venv/bin/pip install \
    "dbt-core==1.0.2" \
    "dbt-postgres==1.0.2" \
    "dbt-redshift==1.0.0" \
    "dbt-snowflake==1.0.0" \
    "dbt-bigquery==1.0.0" \
    "dbt-databricks==1.0.1"
ENV PATH $PATH:/usr/local/venv/bin


# -------------------------
# Stage 3a: dev environment
# -------------------------
FROM base-dependencies as dev

EXPOSE 3000
EXPOSE 8080


# ---------------------------------------------------------------
# Stage 3b: build the common, backend, and frontend distributions
# ---------------------------------------------------------------
FROM base-dependencies AS prod-builder

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

# Production config
COPY lightdash.yml /usr/app/lightdash.yml
ENV LIGHTDASH_CONFIG_FILE /usr/app/lightdash.yml

# Run backend
COPY ./docker/prod-entrypoint.sh /usr/bin/prod-entrypoint.sh
EXPOSE 8080
ENTRYPOINT ["/usr/bin/prod-entrypoint.sh"]
CMD ["yarn", "workspace", "backend", "start"]
