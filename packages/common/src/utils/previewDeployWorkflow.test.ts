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
});

describe('generatePreviewDeployWorkflowFiles', () => {
    it('generates a start- and close-preview pair under .github/workflows', () => {
        const files = generatePreviewDeployWorkflowFiles({
            projectSubPath: 'dbt',
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
        });
        const start = files.find((f) => f.path.endsWith('start-preview.yml'));
        expect(start?.content).toContain('PROJECT_DIR: .');
    });
});
