# Helm overlay for the Azure AKS testbed. Rendered by up.sh via envsubst (${...} from
# az outputs + config), then passed to `helm upgrade --install`.
#
# Secrets are NOT in this file. up.sh creates k8s Secrets idempotently:
#   - lightdash-pg   (password, postgres-password)            -> bundled postgres
#   - lightdash-app  (LIGHTDASH_SECRET, LIGHTDASH_LICENSE_KEY, ANTHROPIC_API_KEY) -> backend + migration
#   - minio-creds    (accesskey, secretkey)                   -> S3 client (app + snapshot store)
# The chart-managed `secrets:` map is left empty; everything sensitive comes via valueFrom.

image:
  repository: ${IMAGE_REF}
  tag: "${IMAGE_TAG}"
  pullPolicy: IfNotPresent

replicaCount: 1

# Single-replica testbed: a PDB with minAvailable:1 = 0 allowed disruptions, which
# deadlocks node drains. Disable it.
podDisruptionBudget:
  enabled: false

secrets: {}

# Workload Identity: the AKS mutating webhook injects a federated token + AZURE_* env
# when the pod carries this label and the SA is annotated with the UAMI client id.
# DefaultAzureCredential (azure-sandboxes provider) then mints ADC data-plane
# bearers for the sandbox groups — no client secret in config.
podLabels:
  azure.workload.identity/use: "true"

serviceAccount:
  create: true
  name: lightdash
  annotations:
    azure.workload.identity/client-id: "${UAMI_CLIENT_ID}"

configMap:
  SITE_URL: "https://${SITE_HOST}"
  SECURE_COOKIES: "true"
  TRUST_PROXY: "true"
  # enable-data-apps (AppGenerateService) + ai-writeback (AiWritebackService).
  LIGHTDASH_ENABLE_FEATURE_FLAGS: "enable-data-apps,ai-writeback"

# Bundled, ephemeral postgres (pgvector).
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
      storageClass: managed-csi
      size: 8Gi

# Inline scheduler (backend runs the graphile worker inline).
scheduler:
  enabled: false

browserless-chrome:
  enabled: true

nats:
  enabled: false

# Migrations (core + EE) as a pre-install/upgrade hook. EE dirs included because the
# license is in scope. The job loads the full config, which enforces S3 -> point it at MinIO.
migrationJob:
  enabled: true
  extraEnv:
    - name: LIGHTDASH_SECRET
      valueFrom: { secretKeyRef: { name: lightdash-app, key: LIGHTDASH_SECRET } }
    - name: LIGHTDASH_LICENSE_KEY
      valueFrom: { secretKeyRef: { name: lightdash-app, key: LIGHTDASH_LICENSE_KEY } }
    - { name: S3_ENDPOINT, value: "http://minio.minio.svc.cluster.local:9000" }
    - { name: S3_BUCKET, value: "lightdash" }
    - { name: S3_REGION, value: "us-east-1" }
    - { name: S3_FORCE_PATH_STYLE, value: "true" }
    - name: S3_ACCESS_KEY
      valueFrom: { secretKeyRef: { name: minio-creds, key: accesskey } }
    - name: S3_SECRET_KEY
      valueFrom: { secretKeyRef: { name: minio-creds, key: secretkey } }

ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt
    # Lightdash's large CSP header overflows the default 4k nginx proxy buffer -> 502 on assets.
    nginx.ingress.kubernetes.io/proxy-buffer-size: "16k"
    nginx.ingress.kubernetes.io/proxy-buffers-number: "4"
    # Data-app / writeback runs are synchronous and can take minutes; bump the 60s default.
    nginx.ingress.kubernetes.io/proxy-read-timeout: "600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "600"
  hosts:
    - host: "${SITE_HOST}"
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: lightdash-tls
      hosts:
        - "${SITE_HOST}"

# Backend env: S3 -> in-cluster MinIO; sandbox -> Azure Container Apps Sandboxes.
extraEnv:
  - name: LIGHTDASH_SECRET
    valueFrom: { secretKeyRef: { name: lightdash-app, key: LIGHTDASH_SECRET } }
  - name: LIGHTDASH_LICENSE_KEY
    valueFrom: { secretKeyRef: { name: lightdash-app, key: LIGHTDASH_LICENSE_KEY } }
  # --- S3 via in-cluster MinIO (app file storage; NOT sandbox snapshots — Azure
  #     Sandboxes pause natively) ---
  - { name: S3_ENDPOINT, value: "http://minio.minio.svc.cluster.local:9000" }
  - { name: S3_BUCKET, value: "lightdash" }
  - { name: S3_REGION, value: "us-east-1" }
  - { name: S3_FORCE_PATH_STYLE, value: "true" }
  - name: S3_ACCESS_KEY
    valueFrom: { secretKeyRef: { name: minio-creds, key: accesskey } }
  - name: S3_SECRET_KEY
    valueFrom: { secretKeyRef: { name: minio-creds, key: secretkey } }
  - { name: S3_EXPIRATION_TIME, value: "259200" }
  # --- AI ---
  - { name: AI_COPILOT_ENABLED, value: "true" }
  - { name: AI_DEFAULT_PROVIDER, value: "anthropic" }
  - name: ANTHROPIC_API_KEY
    valueFrom: { secretKeyRef: { name: lightdash-app, key: ANTHROPIC_API_KEY } }
  - name: AI_WRITEBACK_ANTHROPIC_API_KEY
    valueFrom: { secretKeyRef: { name: lightdash-app, key: ANTHROPIC_API_KEY } }
  # --- Sandbox backend: Azure Container Apps Sandboxes (native suspend/resume) ---
  # DefaultAzureCredential uses the injected Workload Identity token to drive the
  # ADC data plane (SandboxGroup Data Owner role). One group + disk image per feature.
  - { name: SANDBOX_PROVIDER, value: "azure-sandboxes" }
  - { name: AZURE_SANDBOXES_SUBSCRIPTION_ID, value: "${SUBSCRIPTION_ID}" }
  - { name: AZURE_SANDBOXES_RESOURCE_GROUP, value: "${RESOURCE_GROUP}" }
  - { name: AZURE_SANDBOXES_REGION, value: "${ACA_LOCATION}" }
  - { name: AZURE_SANDBOXES_RESOURCE_TIER, value: "${SANDBOX_RESOURCE_TIER}" }
  - { name: AZURE_SANDBOXES_API_VERSION, value: "${SANDBOX_API_VERSION}" }
  - { name: AZURE_SANDBOXES_DATA_APP_GROUP, value: "${DATA_APP_SANDBOX_GROUP}" }
  # Disk image is referenced by its UUID id (assigned at registration), not name.
  - { name: AZURE_SANDBOXES_DATA_APP_DISK_IMAGE, value: "${DATA_APP_DISK_IMAGE_ID}" }
  - { name: AZURE_SANDBOXES_AI_WRITEBACK_GROUP, value: "${WRITEBACK_SANDBOX_GROUP}" }
  - { name: AZURE_SANDBOXES_AI_WRITEBACK_DISK_IMAGE, value: "${WRITEBACK_DISK_IMAGE_ID}" }

resources:
  requests:
    cpu: 250m
    memory: 1Gi
