# Helm overlay for the AWS EKS testbed. Rendered by up.sh via envsubst (${...} filled from
# terraform outputs + config), then passed to `helm upgrade --install`.
#
# Secrets are NOT in this file. up.sh creates two k8s Secrets idempotently:
#   - lightdash-pg   (keys: password, postgres-password)   -> bundled postgres + PGPASSWORD
#   - lightdash-app  (keys: LIGHTDASH_SECRET, LIGHTDASH_LICENSE_KEY, ANTHROPIC_API_KEY,
#                     E2B_API_KEY, GITHUB_*) -> backend + migration job
# We deliberately leave the chart-managed `secrets:` map empty so nothing sensitive is
# templated from values; everything sensitive comes from those Secrets via valueFrom.

image:
  repository: ${IMAGE_REPO}
  tag: "${IMAGE_TAG}"
  pullPolicy: IfNotPresent

replicaCount: 1

# Single-replica testbed: a PDB with minAvailable:1 means 0 allowed disruptions, which DEADLOCKS
# node drains / managed-node-group rolling updates (the backend pod can't be evicted). Disable it.
podDisruptionBudget:
  enabled: false

# Disable the chart-managed Secret; we inject sensitive env via extraEnv/valueFrom below.
secrets: {}

configMap:
  SITE_URL: "https://${SITE_HOST}"
  SECURE_COOKIES: "true"
  TRUST_PROXY: "true"   # behind ingress-nginx TLS termination
  # Feature gates: enable-data-apps (AppGenerateService) + ai-writeback (AiWritebackService —
  # throws ForbiddenError without it). Both resolved from this env via FeatureFlagModel.
  LIGHTDASH_ENABLE_FEATURE_FLAGS: "enable-data-apps,ai-writeback"
  # GitHub integration (dbt-over-GitHub + AI writeback). The redirect domain must be the FULL
  # host — Lightdash's auto-derivation (siteUrl.split('.')[0]) breaks on a multi-label sslip.io
  # name. GITHUB_OAUTH_REDIRECT_URI is the single shared install+user-auth callback; it MUST be
  # registered as a Callback URL on the GitHub App (see the skill doc — manual one-time step).
  GITHUB_REDIRECT_DOMAIN: "${SITE_HOST}"
  GITHUB_OAUTH_REDIRECT_URI: "https://${SITE_HOST}/api/v1/github/oauth/callback"

# --- Bundled, ephemeral postgres (our "temporary" DB) ---
postgresql:
  enabled: true
  image:
    registry: docker.io
    repository: pgvector/pgvector
    tag: pg16
  auth:
    username: lightdash
    database: lightdash
    existingSecret: lightdash-pg
    secretKeys:
      userPasswordKey: password
  primary:
    persistence:
      enabled: true
      storageClass: gp3
      size: 8Gi

# Inline scheduler: scheduler.enabled=false makes the BACKEND run the graphile scheduler
# inline (the chart inverts SCHEDULER_ENABLED). One fewer deployment; jobs still process.
# Flip to true + give it resources when the testbed needs a dedicated worker.
scheduler:
  enabled: false

# Bundled headless browser stays on (default) for exports/screenshots.
browserless-chrome:
  enabled: true

# NATS not needed for the testbed.
nats:
  enabled: false

# Run migrations (core + EE) as a pre-install/upgrade hook. EE migration dirs are included
# automatically because LIGHTDASH_LICENSE_KEY is in scope via migrationJob.extraEnv.
migrationJob:
  enabled: true
  extraEnv:
    - name: LIGHTDASH_SECRET
      valueFrom:
        secretKeyRef:
          name: lightdash-app
          key: LIGHTDASH_SECRET
    - name: LIGHTDASH_LICENSE_KEY
      valueFrom:
        secretKeyRef:
          name: lightdash-app
          key: LIGHTDASH_LICENSE_KEY
    # The migration job loads the FULL config at startup (lightdashConfig), and recent versions
    # ENFORCE S3 (parseBaseS3Config requires S3_ENDPOINT+BUCKET+REGION). The job doesn't inherit
    # the main extraEnv/configMap, so set S3 here too or `knex migrate` dies on a ParseError.
    - { name: S3_ENDPOINT, value: "https://s3.${S3_REGION}.amazonaws.com" }
    - { name: S3_BUCKET, value: "${S3_BUCKET}" }
    - { name: S3_REGION, value: "${S3_REGION}" }

# Service account annotated for IRSA -> S3 access with no static keys.
serviceAccount:
  create: true
  name: lightdash
  annotations:
    eks.amazonaws.com/role-arn: "${APP_ROLE_ARN}"

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt
    # Lightdash sends a large Content-Security-Policy header; the default 4k nginx proxy
    # buffer overflows → 502 on asset routes ("upstream sent too big header"). Bump it.
    nginx.ingress.kubernetes.io/proxy-buffer-size: "16k"
    nginx.ingress.kubernetes.io/proxy-buffers-number: "4"
  hosts:
    - host: "${SITE_HOST}"
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: lightdash-tls
      hosts:
        - "${SITE_HOST}"

# Backend env: secret + S3. IRSA supplies AWS credentials, so no keys here — just bucket+region.
extraEnv:
  - name: LIGHTDASH_SECRET
    valueFrom:
      secretKeyRef:
        name: lightdash-app
        key: LIGHTDASH_SECRET
  - name: LIGHTDASH_LICENSE_KEY
    valueFrom:
      secretKeyRef:
        name: lightdash-app
        key: LIGHTDASH_LICENSE_KEY
  # Recent versions enforce S3_ENDPOINT (parseBaseS3Config). Real AWS S3 regional endpoint;
  # IRSA still supplies the credentials. Virtual-hosted-style works with this endpoint.
  - name: S3_ENDPOINT
    value: "https://s3.${S3_REGION}.amazonaws.com"
  - name: S3_REGION
    value: "${S3_REGION}"
  - name: S3_BUCKET
    value: "${S3_BUCKET}"
  - name: S3_EXPIRATION_TIME
    value: "259200"
  # --- Data-app generation via E2B (the baseline before swapping in a k8s SandboxProvider) ---
  - name: AI_COPILOT_ENABLED
    value: "true"
  - name: AI_DEFAULT_PROVIDER
    value: "anthropic"
  - name: ANTHROPIC_API_KEY
    valueFrom:
      secretKeyRef:
        name: lightdash-app
        key: ANTHROPIC_API_KEY
  # --- Sandbox backend: AWS Lambda MicroVMs (native suspend/resume) ---
  # The backend drives the MicroVMs control plane cross-region: this cluster is
  # in eu-west-2, MicroVMs in eu-west-1 (the EU launch region). The control plane
  # is a normal API and the data plane is public HTTPS, so cross-region is fine;
  # IAM (app role + execution role) is global. Image ARNs come from the
  # sandboxes/microvm-agent/build-microvm-image.sh pipeline.
  - name: SANDBOX_PROVIDER
    value: "lambda-microvm"
  - name: LAMBDA_MICROVM_REGION
    value: "${LAMBDA_MICROVM_REGION}"
  - name: LAMBDA_MICROVM_AI_WRITEBACK_IMAGE_ARN
    value: "${LAMBDA_MICROVM_AI_WRITEBACK_IMAGE_ARN}"
  - name: LAMBDA_MICROVM_DATA_APP_IMAGE_ARN
    value: "${LAMBDA_MICROVM_DATA_APP_IMAGE_ARN}"
  - name: LAMBDA_MICROVM_EXECUTION_ROLE_ARN
    value: "${LAMBDA_MICROVM_EXECUTION_ROLE_ARN}"
  # E2B fallback (set SANDBOX_PROVIDER=e2b to switch back). Key kept in the secret.
  - name: E2B_API_KEY
    valueFrom:
      secretKeyRef:
        name: lightdash-app
        key: E2B_API_KEY
  - name: E2B_TEMPLATE_TAG
    value: "latest"
  # --- GitHub App (dbt-over-GitHub + AI writeback). Creds from the lightdash-app secret. ---
  - name: GITHUB_APP_ID
    valueFrom: { secretKeyRef: { name: lightdash-app, key: GITHUB_APP_ID } }
  - name: GITHUB_APP_NAME
    valueFrom: { secretKeyRef: { name: lightdash-app, key: GITHUB_APP_NAME } }
  - name: GITHUB_CLIENT_ID
    valueFrom: { secretKeyRef: { name: lightdash-app, key: GITHUB_CLIENT_ID } }
  - name: GITHUB_CLIENT_SECRET
    valueFrom: { secretKeyRef: { name: lightdash-app, key: GITHUB_CLIENT_SECRET } }
  - name: GITHUB_PRIVATE_KEY
    valueFrom: { secretKeyRef: { name: lightdash-app, key: GITHUB_PRIVATE_KEY } }

resources:
  requests:
    cpu: 250m
    memory: 1Gi
