FROM node:14 AS base

WORKDIR /usr/app

# Stage 1: build the common, backend, and frontend distributions
FROM base AS builder

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

# Stage 2: execution environment for backend
FROM base as executor

# Copy distributions into environment
COPY --from=builder /usr/app/packages/common/package.json /usr/app/packages/common/package.json
COPY --from=builder /usr/app/packages/common/dist /usr/app/packages/common/dist


COPY --from=builder /usr/app/packages/backend/package.json /usr/app/packages/backend/package.json
COPY --from=builder /usr/app/packages/backend/dist /usr/app/packages/backend/dist


COPY --from=builder /usr/app/packages/frontend/package.json /usr/app/packages/frontend/package.json
COPY --from=builder /usr/app/packages/frontend/build /usr/app/packages/frontend/build

# Install production dependencies
COPY package.json .
COPY yarn.lock .

ENV NODE_ENV production

RUN yarn install --pure-lockfile --non-interactive --production

# Run the backend
WORKDIR /usr/app/packages/backend

USER node
CMD ["yarn", "start"]
