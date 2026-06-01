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

export const getPreviewDeploySecrets = ({
    projectUuid,
    siteUrl,
}: {
    projectUuid: string;
    siteUrl: string;
}): PreviewDeploySecret[] => [
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
        description:
            'A Lightdash personal access token (Settings → Personal access tokens). Lightdash cannot create this for you.',
    },
    {
        name: 'DBT_PROFILES',
        value: null,
        description:
            'A dbt profiles.yml with your warehouse connection. Lightdash never stores your warehouse password, so you must add this yourself.',
    },
];

const PREVIEW_WORKFLOW_PATH = `${WORKFLOWS_DIR}start-preview.yml`;
const CLOSE_WORKFLOW_PATH = `${WORKFLOWS_DIR}close-preview.yml`;

/**
 * Generate the canonical Lightdash preview-on-PR workflow pair.
 *
 * @param projectSubPath dbt project directory within the repo (repo root when
 * null) — passed to the CLI as `--project-dir`.
 */
export const generatePreviewDeployWorkflowFiles = ({
    projectSubPath,
}: {
    projectSubPath: string | null;
}): WorkflowFile[] => {
    const projectDir =
        projectSubPath && projectSubPath !== '' ? projectSubPath : '.';

    const startPreview = `name: lightdash-start-preview
on:
  pull_request:
    types: [opened, synchronize, reopened]
concurrency:
  group: lightdash-preview-\${{ github.ref }}
  cancel-in-progress: true
jobs:
  start-preview:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
    env:
      PROJECT_DIR: ${projectDir}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20.x'
      - name: Install Lightdash CLI
        run: npm install -g @lightdash/cli
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
jobs:
  close-preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20.x'
      - name: Install Lightdash CLI
        run: npm install -g @lightdash/cli
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
