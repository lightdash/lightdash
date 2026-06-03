/**
 * Detection and generation of Lightdash "preview project" GitHub Actions.
 *
 * Lightdash ships a canonical CI workflow (the `lightdash/cli-actions`
 * `start-preview.yml` / `close-preview.yml` pair) that spins up a temporary
 * preview project for every pull request and tears it down on close. The AI
 * writeback sandbox agent detects whether a repo already has this set up and,
 * if not, offers to open a PR adding it.
 *
 * Everything here is pure so it can be unit-tested without a sandbox or
 * database: detection takes the workflow files as `{ path, content }` and the
 * generators take only the project identity.
 */

/** A single file read out of a repo, used for detection. */
export type WorkflowFile = {
    path: string;
    content: string;
};

export type PreviewDeployDetection = {
    hasPreviewDeployWorkflow: boolean;
    /** Path of the first matching workflow file, or null when none matched. */
    workflowPath: string | null;
};

/**
 * Substrings that, when found in a `.github/workflows` file, indicate the repo
 * already deploys Lightdash preview projects. `lightdash deploy` is
 * deliberately excluded — that is a production deploy, not a preview.
 */
export const PREVIEW_DEPLOY_WORKFLOW_MARKERS = [
    'lightdash start-preview',
    'start-preview',
    'lightdash stop-preview',
    'stop-preview',
    'lightdash preview',
    'lightdash-deploy-action',
] as const;

const WORKFLOWS_DIR = '.github/workflows/';

/** True for `.github/workflows/*.yml|*.yaml` paths (tolerates a `./` prefix). */
export const isWorkflowFile = (path: string): boolean => {
    const normalized = path.replace(/^\.\//, '');
    return (
        normalized.startsWith(WORKFLOWS_DIR) &&
        (normalized.endsWith('.yml') || normalized.endsWith('.yaml'))
    );
};

export const detectPreviewDeployWorkflow = (
    files: WorkflowFile[],
): PreviewDeployDetection => {
    const match = files.find(
        (file) =>
            isWorkflowFile(file.path) &&
            PREVIEW_DEPLOY_WORKFLOW_MARKERS.some((marker) =>
                file.content.includes(marker),
            ),
    );
    return {
        hasPreviewDeployWorkflow: match !== undefined,
        workflowPath: match?.path ?? null,
    };
};

/**
 * A GitHub Actions secret the preview workflow needs. `value` is non-null when
 * Lightdash can pre-fill it (project UUID, instance URL); null means the user
 * must supply it themselves — the sandbox never holds real warehouse secrets.
 */
export type PreviewDeploySecret = {
    name: string;
    value: string | null;
    description: string;
};

/**
 * Result of opening the preview-deploy setup pull request. `secrets` are the
 * GitHub Actions secrets the user must add for the workflow to run, with the
 * values Lightdash can pre-fill already populated.
 */
export type PreviewDeploySetupResult = {
    prUrl: string;
    projectName: string;
    repository: string;
    secrets: PreviewDeploySecret[];
};

export const getPreviewDeploySecrets = ({
    projectUuid,
    siteUrl,
}: {
    projectUuid: string;
    siteUrl: string;
}): PreviewDeploySecret[] => {
    const baseUrl = siteUrl.replace(/\/+$/, '');
    return [
        {
            name: 'LIGHTDASH_URL',
            value: siteUrl,
            description: 'The base URL of your Lightdash instance.',
        },
        {
            name: 'LIGHTDASH_PROJECT',
            value: projectUuid,
            description:
                'The UUID of the Lightdash project to base preview projects on.',
        },
        {
            name: 'LIGHTDASH_API_KEY',
            value: null,
            description: `A Lightdash personal access token — create one at ${baseUrl}/generalSettings/personalAccessTokens. Lightdash cannot create this for you.`,
        },
        {
            name: 'DBT_PROFILES',
            value: null,
            description:
                'A dbt profiles.yml with your warehouse connection. Lightdash never stores your warehouse password, so you must add this yourself.',
        },
    ];
};

const PREVIEW_WORKFLOW_PATH = `${WORKFLOWS_DIR}start-preview.yml`;
const CLOSE_WORKFLOW_PATH = `${WORKFLOWS_DIR}close-preview.yml`;

// Third-party actions are pinned to a full commit SHA (with a version comment)
// rather than a floating tag — these workflows run with the repo's warehouse +
// Lightdash secrets in scope, so a retagged/compromised action is a real
// supply-chain risk. SHAs match the pins Lightdash uses in its own CI.
const CHECKOUT_ACTION =
    'actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2';
const SETUP_NODE_ACTION =
    'actions/setup-node@53b83947a5a98c8d113130e565377fae1a50d02f # v6';

/**
 * Generate the canonical Lightdash preview-on-PR workflow pair.
 *
 * @param projectSubPath dbt project directory within the repo (repo root when
 * null) — passed to the CLI as `--project-dir`.
 * @param cliVersion the `@lightdash/cli` version to pin. Pass the Lightdash
 * instance's own version (`VERSION`): every Lightdash package releases in
 * lockstep, so the instance version is the CLI version that matches it — this
 * keeps the pin reproducible, compatible, and self-updating with the instance
 * instead of frozen at a literal that rots.
 */
export const generatePreviewDeployWorkflowFiles = ({
    projectSubPath,
    cliVersion,
}: {
    projectSubPath: string | null;
    cliVersion: string;
}): WorkflowFile[] => {
    const projectDir =
        projectSubPath && projectSubPath !== '' ? projectSubPath : '.';

    const startPreview = `name: lightdash-start-preview
on:
  pull_request:
    types: [opened, synchronize, reopened]
permissions:
  contents: read
concurrency:
  group: lightdash-preview-\${{ github.ref }}
  cancel-in-progress: true
jobs:
  start-preview:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      PROJECT_DIR: ${projectDir}
    steps:
      - uses: ${CHECKOUT_ACTION}
      - uses: ${SETUP_NODE_ACTION}
        with:
          node-version: '20.x'
      - name: Install Lightdash CLI
        run: npm install -g @lightdash/cli@${cliVersion}
      - name: Write dbt profiles
        run: echo "$DBT_PROFILES" > profiles.yml
        env:
          DBT_PROFILES: \${{ secrets.DBT_PROFILES }}
      - name: Create preview project
        run: lightdash start-preview --project-dir "$PROJECT_DIR" --profiles-dir . --name "\${GITHUB_HEAD_REF}"
        env:
          LIGHTDASH_URL: \${{ secrets.LIGHTDASH_URL }}
          LIGHTDASH_PROJECT: \${{ secrets.LIGHTDASH_PROJECT }}
          LIGHTDASH_API_KEY: \${{ secrets.LIGHTDASH_API_KEY }}
`;

    const closePreview = `name: lightdash-close-preview
on:
  pull_request:
    types: [closed]
permissions:
  contents: read
jobs:
  close-preview:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: ${CHECKOUT_ACTION}
      - uses: ${SETUP_NODE_ACTION}
        with:
          node-version: '20.x'
      - name: Install Lightdash CLI
        run: npm install -g @lightdash/cli@${cliVersion}
      - name: Delete preview project
        run: lightdash stop-preview --name "\${GITHUB_HEAD_REF}"
        env:
          LIGHTDASH_URL: \${{ secrets.LIGHTDASH_URL }}
          LIGHTDASH_PROJECT: \${{ secrets.LIGHTDASH_PROJECT }}
          LIGHTDASH_API_KEY: \${{ secrets.LIGHTDASH_API_KEY }}
`;

    return [
        { path: PREVIEW_WORKFLOW_PATH, content: startPreview },
        { path: CLOSE_WORKFLOW_PATH, content: closePreview },
    ];
};
