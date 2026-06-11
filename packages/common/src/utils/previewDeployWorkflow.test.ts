import {
    detectPreviewDeployWorkflow,
    generatePreviewDeployWorkflowFiles,
    getPreviewDeploySecrets,
    isWorkflowFile,
    type WorkflowFile,
} from './previewDeployWorkflow';

describe('isWorkflowFile', () => {
    it('matches yml/yaml under .github/workflows', () => {
        expect(isWorkflowFile('.github/workflows/start-preview.yml')).toBe(
            true,
        );
        expect(isWorkflowFile('.github/workflows/ci.yaml')).toBe(true);
        expect(isWorkflowFile('./.github/workflows/ci.yml')).toBe(true);
    });

    it('rejects non-workflow paths', () => {
        expect(isWorkflowFile('.github/dependabot.yml')).toBe(false);
        expect(isWorkflowFile('models/orders.sql')).toBe(false);
        expect(isWorkflowFile('.github/workflows/README.md')).toBe(false);
    });
});

describe('detectPreviewDeployWorkflow', () => {
    it('detects a start-preview workflow', () => {
        const files: WorkflowFile[] = [
            {
                path: '.github/workflows/start-preview.yml',
                content: 'run: lightdash start-preview --name "$BRANCH"',
            },
        ];
        expect(detectPreviewDeployWorkflow(files)).toEqual({
            hasPreviewDeployWorkflow: true,
            workflowPath: '.github/workflows/start-preview.yml',
        });
    });

    it('does not treat a production deploy workflow as a preview deploy', () => {
        const files: WorkflowFile[] = [
            {
                path: '.github/workflows/deploy.yml',
                content: 'run: lightdash deploy --project-dir .',
            },
        ];
        expect(detectPreviewDeployWorkflow(files)).toEqual({
            hasPreviewDeployWorkflow: false,
            workflowPath: null,
        });
    });

    it('ignores matching markers outside the workflows dir', () => {
        const files: WorkflowFile[] = [
            {
                path: 'docs/lightdash start-preview.md',
                content: 'lightdash start-preview',
            },
        ];
        expect(
            detectPreviewDeployWorkflow(files).hasPreviewDeployWorkflow,
        ).toBe(false);
    });

    it('returns false for an empty repo', () => {
        expect(detectPreviewDeployWorkflow([])).toEqual({
            hasPreviewDeployWorkflow: false,
            workflowPath: null,
        });
    });
});

describe('getPreviewDeploySecrets', () => {
    const secrets = getPreviewDeploySecrets({
        projectUuid: 'proj-123',
        siteUrl: 'https://app.lightdash.cloud',
    });

    it('pre-fills the project UUID and instance URL', () => {
        const byName = Object.fromEntries(
            secrets.map((s) => [s.name, s.value]),
        );
        expect(byName.LIGHTDASH_PROJECT).toBe('proj-123');
        expect(byName.LIGHTDASH_URL).toBe('https://app.lightdash.cloud');
    });

    it('leaves user-supplied secrets null', () => {
        const byName = Object.fromEntries(
            secrets.map((s) => [s.name, s.value]),
        );
        expect(byName.LIGHTDASH_API_KEY).toBeNull();
        expect(byName.DBT_PROFILES).toBeNull();
    });

    it('links to the personal access tokens page (no double slash)', () => {
        const apiKey = secrets.find((s) => s.name === 'LIGHTDASH_API_KEY');
        expect(apiKey?.description).toContain(
            'https://app.lightdash.cloud/generalSettings/personalAccessTokens',
        );
        const trailing = getPreviewDeploySecrets({
            projectUuid: 'p',
            siteUrl: 'https://app.lightdash.cloud/',
        }).find((s) => s.name === 'LIGHTDASH_API_KEY');
        expect(trailing?.description).toContain(
            'https://app.lightdash.cloud/generalSettings/personalAccessTokens',
        );
        expect(trailing?.description).not.toContain('cloud//general');
    });
});

describe('generatePreviewDeployWorkflowFiles', () => {
    it('generates a start- and close-preview pair under .github/workflows', () => {
        const files = generatePreviewDeployWorkflowFiles({
            projectSubPath: 'dbt',
            cliVersion: '0.3075.2',
        });
        const paths = files.map((f) => f.path).sort();
        expect(paths).toEqual([
            '.github/workflows/close-preview.yml',
            '.github/workflows/start-preview.yml',
        ]);
    });

    it('wires the project subpath into --project-dir and is detectable by its own detector', () => {
        const files = generatePreviewDeployWorkflowFiles({
            projectSubPath: 'analytics/dbt',
            cliVersion: '0.3075.2',
        });
        const start = files.find((f) => f.path.endsWith('start-preview.yml'));
        expect(start?.content).toContain('PROJECT_DIR: analytics/dbt');
        expect(start?.content).toContain('lightdash start-preview');
        // The thing we generate must be recognised as "set up" on the next scan.
        expect(
            detectPreviewDeployWorkflow(files).hasPreviewDeployWorkflow,
        ).toBe(true);
    });

    it('defaults the project dir to the repo root when subpath is null', () => {
        const files = generatePreviewDeployWorkflowFiles({
            projectSubPath: null,
            cliVersion: '0.3075.2',
        });
        const start = files.find((f) => f.path.endsWith('start-preview.yml'));
        expect(start?.content).toContain('PROJECT_DIR: .');
    });

    it('pins @lightdash/cli to the supplied (instance) version in both files', () => {
        const files = generatePreviewDeployWorkflowFiles({
            projectSubPath: 'dbt',
            cliVersion: '1.2.3',
        });
        files.forEach(({ content }) => {
            expect(content).toContain('npm install -g @lightdash/cli@1.2.3');
        });
    });

    it('hardens both workflows: SHA-pinned actions, least-privilege permissions, pinned CLI, timeout', () => {
        const files = generatePreviewDeployWorkflowFiles({
            projectSubPath: 'dbt',
            cliVersion: '0.3075.2',
        });
        files.forEach(({ content }) => {
            // Actions pinned to a 40-char commit SHA, never a floating tag.
            expect(content).toMatch(/actions\/checkout@[0-9a-f]{40}/);
            expect(content).toMatch(/actions\/setup-node@[0-9a-f]{40}/);
            expect(content).not.toMatch(/uses: actions\/\S+@v\d/);
            // Token always grants contents:read so checkout works on private repos.
            expect(content).toContain('contents: read');
            // CLI pinned for reproducibility; job bounded by a timeout.
            expect(content).toMatch(/@lightdash\/cli@\d+\.\d+\.\d+/);
            expect(content).toContain('timeout-minutes:');
        });
    });

    it('grants pull-requests:write only to start-preview (the one that comments)', () => {
        const files = generatePreviewDeployWorkflowFiles({
            projectSubPath: 'dbt',
            cliVersion: '0.3075.2',
        });
        const start = files.find((f) => f.path.endsWith('start-preview.yml'));
        const close = files.find((f) => f.path.endsWith('close-preview.yml'));
        // start-preview needs contents:read (checkout) AND pull-requests:write
        // (comment) — an omitted scope defaults to none, so both are explicit.
        expect(start?.content).toContain('contents: read');
        expect(start?.content).toContain('pull-requests: write');
        // close-preview never comments, so it stays least-privilege read-only.
        expect(close?.content).toContain('permissions:\n  contents: read');
        expect(close?.content).not.toContain('pull-requests: write');
    });

    it('comments the preview URL on the PR with a SHA-pinned first-party action', () => {
        const files = generatePreviewDeployWorkflowFiles({
            projectSubPath: 'dbt',
            cliVersion: '0.3075.2',
        });
        const start = files.find((f) => f.path.endsWith('start-preview.yml'));
        // Captures the CLI's url output and posts it back to the PR.
        expect(start?.content).toContain('id: preview');
        expect(start?.content).toContain(
            'PREVIEW_URL: ${{ steps.preview.outputs.url }}',
        );
        expect(start?.content).toContain('Comment preview link on PR');
        // Reuses a first-party action pinned to a commit SHA, never a third
        // party on a floating tag (the workflow runs with secrets in scope).
        expect(start?.content).toMatch(/actions\/github-script@[0-9a-f]{40}/);
        // Sticky comment: an HTML marker lets reruns update one comment.
        expect(start?.content).toContain('<!-- lightdash-preview -->');
        expect(start?.content).toContain('updateComment');
        expect(start?.content).toContain('createComment');
    });
});
