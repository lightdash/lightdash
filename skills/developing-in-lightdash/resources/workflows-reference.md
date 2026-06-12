# Workflows Reference

Detailed examples and CI/CD configurations for common Lightdash development patterns.

## Pattern 1: Direct Deployment (Non-Production or Exceptional)

Simple and direct - deploy changes straight to a non-production project.

Do not use this as the default production workflow. Production semantic-layer updates should almost always be deployed by CI/CD after review (for example GitHub Actions on merge) or refreshed from the Lightdash UI. Use direct production `lightdash deploy` only when the user explicitly confirms an exceptional reason, such as an approved emergency or a one-off setup task.

```bash
# Make dbt/YAML changes locally
lightdash deploy --target dev
lightdash upload
```

**When to use:**
- Solo developer or small team
- Non-production or scratch project
- No CI/CD pipeline for this project yet
- Rapid iteration needed
- User explicitly confirms a rare direct production deploy is appropriate

## Pattern 2: Preview-First Development

Test changes in isolation before applying to main project.

```bash
# Create preview
lightdash preview --name "feature-x"

# In preview: iterate on changes
lightdash upload --force

# When ready: stop preview, then ship through the normal production path
lightdash stop-preview --name "feature-x"
# Open a PR and let CI/CD deploy after merge, or ask the user to refresh dbt from the UI.
```

**When to use:**
- Multiple team members
- Want to test before pushing
- Complex changes spanning multiple models/charts
- Production should still be updated by CI/CD or UI refresh, not an ad hoc agent deploy

## Pattern 3: CI/CD Pipeline

Automated deployment on merge to main branch.

This is the preferred production path. If a user asks the agent to update production, remind them to use the existing CI/CD pipeline or refresh dbt from the Lightdash UI unless they explicitly confirm a rare reason to deploy directly.

### GitHub Actions

```yaml
# .github/workflows/lightdash-deploy.yml
name: Deploy to Lightdash
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      LIGHTDASH_API_KEY: ${{ secrets.LIGHTDASH_API_KEY }}
      LIGHTDASH_URL: https://app.lightdash.cloud
      LIGHTDASH_PROJECT: ${{ secrets.PROJECT_UUID }}
      CI: true
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Lightdash CLI
        run: npm install -g @lightdash/cli

      - name: Setup Python (for dbt)
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      - name: Install dbt
        run: pip install dbt-core dbt-postgres  # or your adapter

      - name: Deploy to Lightdash
        run: |
          lightdash deploy --target prod
          lightdash upload --force
```

### GitLab CI

```yaml
# .gitlab-ci.yml
stages:
  - deploy

deploy-lightdash:
  stage: deploy
  image: node:20
  only:
    - main
  variables:
    LIGHTDASH_API_KEY: $LIGHTDASH_API_KEY
    LIGHTDASH_URL: https://app.lightdash.cloud
    LIGHTDASH_PROJECT: $PROJECT_UUID
    CI: "true"
  before_script:
    - npm install -g @lightdash/cli
    - pip install dbt-core dbt-postgres
  script:
    - lightdash deploy --target prod
    - lightdash upload --force
```

### CircleCI

```yaml
# .circleci/config.yml
version: 2.1

jobs:
  deploy:
    docker:
      - image: cimg/node:20.0
    environment:
      CI: "true"
    steps:
      - checkout
      - run:
          name: Install Lightdash CLI
          command: npm install -g @lightdash/cli
      - run:
          name: Install dbt
          command: pip install dbt-core dbt-postgres
      - run:
          name: Deploy to Lightdash
          command: |
            lightdash deploy --target prod
            lightdash upload --force

workflows:
  deploy-on-main:
    jobs:
      - deploy:
          filters:
            branches:
              only: main
```

**When to use:**
- Team uses pull requests
- Want automated, reproducible deploys
- Need audit trail of deployments

## Pattern 4: PR Preview Environments

Create a preview for each pull request, with automatic cleanup.

### GitHub Actions - Create Preview

```yaml
# .github/workflows/lightdash-preview.yml
name: Lightdash Preview
on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  preview:
    runs-on: ubuntu-latest
    env:
      LIGHTDASH_API_KEY: ${{ secrets.LIGHTDASH_API_KEY }}
      LIGHTDASH_URL: https://app.lightdash.cloud
      CI: "true"
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Lightdash CLI
        run: npm install -g @lightdash/cli

      - name: Setup dbt
        run: pip install dbt-core dbt-postgres

      - name: Create Preview
        run: lightdash start-preview --name "pr-${{ github.event.number }}"

      - name: Comment on PR
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '🔍 Lightdash preview created: `pr-${{ github.event.number }}`'
            })
```

### GitHub Actions - Cleanup Preview

```yaml
# .github/workflows/lightdash-preview-cleanup.yml
name: Cleanup Lightdash Preview
on:
  pull_request:
    types: [closed]

jobs:
  cleanup:
    runs-on: ubuntu-latest
    env:
      LIGHTDASH_API_KEY: ${{ secrets.LIGHTDASH_API_KEY }}
      LIGHTDASH_URL: https://app.lightdash.cloud
      CI: "true"
    steps:
      - name: Install Lightdash CLI
        run: npm install -g @lightdash/cli

      - name: Stop Preview
        run: lightdash stop-preview --name "pr-${{ github.event.number }}"
```

**When to use:**
- Want preview links in PRs
- Multiple reviewers need to see changes
- Complex approval workflows

## Pattern 5: Download-Edit-Upload

Bring existing UI-created content into version control.

```bash
# 1. List available projects and set project to download from
lightdash config list-projects
lightdash config set-project --name "Production"

# 2. Download content
lightdash download --nested

# 3. Review what was downloaded
ls -la lightdash/

# 4. Edit YAML files as needed
# ... make changes ...

# 5. Validate changes
lightdash lint --path ./lightdash

# 6. Upload changes
lightdash upload --force

# 7. Commit to git
git add lightdash/
git commit -m "Add charts and dashboards as code"
```

**Directory structure after download:**
```
lightdash/
├── charts/
│   ├── sales/
│   │   ├── monthly-revenue.yml
│   │   └── top-customers.yml
│   └── marketing/
│       └── campaign-performance.yml
└── dashboards/
    ├── sales/
    │   └── executive-summary.yml
    └── marketing/
        └── campaign-overview.yml
```

**When to use:**
- Existing charts/dashboards built in UI
- Want to start managing as code
- Need to make bulk edits
- Migrating to GitOps workflow

## Pattern 6: Multi-Environment Promotion

Separate dev, staging, and production projects with promotion workflow.

### Manual Promotion (Non-Production Only)

Use manual promotion for dev and staging projects. For production, prefer CI/CD or the Lightdash UI refresh workflow unless the user explicitly confirms a rare direct deploy is required.

```bash
# List available projects (excludes preview projects)
lightdash config list-projects

# Development
lightdash config set-project --name "Dev"
lightdash deploy --target dev
lightdash upload

# Test in dev...

# Promote to Staging
lightdash config set-project --name "Staging"
lightdash deploy --target staging
lightdash upload

# Test in staging...

# Promote to Production through CI/CD after merge, or refresh dbt from the UI.
```

### CI/CD Multi-Environment

```yaml
# .github/workflows/lightdash-multi-env.yml
name: Deploy to Lightdash

on:
  push:
    branches:
      - develop
      - staging
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      LIGHTDASH_API_KEY: ${{ secrets.LIGHTDASH_API_KEY }}
      LIGHTDASH_URL: https://app.lightdash.cloud
      CI: "true"
    steps:
      - uses: actions/checkout@v4

      - name: Install tools
        run: |
          npm install -g @lightdash/cli
          pip install dbt-core dbt-postgres

      - name: Deploy to Dev
        if: github.ref == 'refs/heads/develop'
        env:
          LIGHTDASH_PROJECT: ${{ secrets.DEV_PROJECT_UUID }}
        run: |
          lightdash deploy --target dev
          lightdash upload --force

      - name: Deploy to Staging
        if: github.ref == 'refs/heads/staging'
        env:
          LIGHTDASH_PROJECT: ${{ secrets.STAGING_PROJECT_UUID }}
        run: |
          lightdash deploy --target staging
          lightdash upload --force

      - name: Deploy to Production
        if: github.ref == 'refs/heads/main'
        env:
          LIGHTDASH_PROJECT: ${{ secrets.PROD_PROJECT_UUID }}
        run: |
          lightdash deploy --target prod
          lightdash upload --force
```

**When to use:**
- Multiple Lightdash projects exist
- Different dbt targets for each environment
- Formal promotion process
- Need to test changes before production
- Production promotion is handled by CI/CD or UI refresh

## Environment Variables Reference

| Variable | Description |
|----------|-------------|
| `LIGHTDASH_API_KEY` | API key for authentication |
| `LIGHTDASH_URL` | Lightdash instance URL |
| `LIGHTDASH_PROJECT` | Project UUID to deploy to |
| `CI` | Set to `true` to auto-approve prompts |
| `DBT_PROJECT_DIR` | Path to dbt project |
| `DBT_PROFILES_DIR` | Path to dbt profiles |

## Secrets Setup

### GitHub Actions

1. Go to repository Settings > Secrets and variables > Actions
2. Add secrets:
   - `LIGHTDASH_API_KEY` - Your API key from Lightdash settings
   - `PROJECT_UUID` - Project UUID from Lightdash URL

### GitLab CI

1. Go to Settings > CI/CD > Variables
2. Add variables (masked):
   - `LIGHTDASH_API_KEY`
   - `PROJECT_UUID`

## Validation in CI

Add validation before deployment:

```yaml
- name: Lint Lightdash content
  run: lightdash lint --path ./lightdash --format json

- name: Validate against server
  run: lightdash validate --project ${{ secrets.PROJECT_UUID }}
```
