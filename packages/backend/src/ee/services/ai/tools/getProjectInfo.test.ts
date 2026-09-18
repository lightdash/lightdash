import {
    DbtProjectType,
    ProjectType,
    toolGetProjectInfoOutputSchema,
    WarehouseTypes,
} from '@lightdash/common';
import type { GetProjectInfoFn } from '../types/aiAgentDependencies';
import { getGetProjectInfo } from './getProjectInfo';

vi.mock('@sentry/node', () => ({
    captureException: vi.fn(),
    addBreadcrumb: vi.fn(),
    getActiveSpan: vi.fn(),
}));

vi.mock('../../../../logging/logger', () => ({
    __esModule: true,
    default: { error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

type ProjectInfo = Awaited<ReturnType<GetProjectInfoFn>>;

const gitProjectInfo: ProjectInfo = {
    projectName: 'Jaffle Shop',
    projectType: ProjectType.DEFAULT,
    dbtConnectionType: DbtProjectType.GITHUB,
    dbtVersion: 'v1.8',
    warehouseType: WarehouseTypes.POSTGRES,
    git: {
        repository: 'lightdash/jaffle-shop',
        branch: 'main',
        projectSubPath: '/dbt',
        hostDomain: 'github.example.com',
    },
    previewDeployCi: {
        hasPreviewDeployWorkflow: true,
        workflowPath: '.github/workflows/lightdash-preview.yml',
    },
};

const execute = async (getProjectInfo: GetProjectInfoFn) => {
    const { execute: run } = getGetProjectInfo({ getProjectInfo });
    if (!run) throw new Error('getProjectInfo tool has no execute');
    return run({}, { messages: [], toolCallId: 'tool-call-1', context: {} });
};

describe('getGetProjectInfo', () => {
    it('renders every project fact and mirrors it in structuredContent', async () => {
        const raw = await execute(vi.fn().mockResolvedValue(gitProjectInfo));

        expect(toolGetProjectInfoOutputSchema.safeParse(raw).success).toBe(
            true,
        );
        const output = toolGetProjectInfoOutputSchema.parse(raw);

        expect(output.metadata).toEqual({ status: 'success' });
        expect(output.result).toBe(
            [
                'Lightdash project: *Jaffle Shop* (DEFAULT)',
                'dbt connection: Github',
                'dbt version: v1.8',
                'Warehouse: postgres',
                'Git repository: lightdash/jaffle-shop (branch `main`)',
                'dbt project sub-path: /dbt',
                'Git host: github.example.com',
                'Preview-deploy GitHub Actions: configured (.github/workflows/lightdash-preview.yml)',
            ].join('\n'),
        );
        expect(output.structuredContent).toEqual({
            projectName: 'Jaffle Shop',
            projectType: ProjectType.DEFAULT,
            dbtConnectionType: DbtProjectType.GITHUB,
            dbtConnectionLabel: 'Github',
            dbtVersion: 'v1.8',
            warehouseType: WarehouseTypes.POSTGRES,
            git: {
                repository: 'lightdash/jaffle-shop',
                branch: 'main',
                projectSubPath: '/dbt',
                hostDomain: 'github.example.com',
            },
            previewDeployCi: {
                hasPreviewDeployWorkflow: true,
                workflowPath: '.github/workflows/lightdash-preview.yml',
            },
        });
    });

    it('omits the sub-path line and nulls it when the dbt project is at the repo root', async () => {
        const raw = await execute(
            vi.fn().mockResolvedValue({
                ...gitProjectInfo,
                git: { ...gitProjectInfo.git, projectSubPath: '/' },
                previewDeployCi: {
                    hasPreviewDeployWorkflow: false,
                    workflowPath: null,
                },
            }),
        );
        const output = toolGetProjectInfoOutputSchema.parse(raw);

        expect(output.result).not.toContain('dbt project sub-path');
        expect(output.result).toContain(
            'Preview-deploy GitHub Actions: not found',
        );
        expect(output.structuredContent).toMatchObject({
            git: { projectSubPath: null },
            previewDeployCi: {
                hasPreviewDeployWorkflow: false,
                workflowPath: null,
            },
        });
    });

    it('keeps warehouse, git and preview CI null when the project has none', async () => {
        const raw = await execute(
            vi.fn().mockResolvedValue({
                projectName: 'Cloud project',
                projectType: ProjectType.PREVIEW,
                dbtConnectionType: DbtProjectType.DBT_CLOUD_IDE,
                dbtVersion: 'latest',
                warehouseType: null,
                git: null,
                previewDeployCi: null,
            }),
        );

        expect(toolGetProjectInfoOutputSchema.safeParse(raw).success).toBe(
            true,
        );
        const output = toolGetProjectInfoOutputSchema.parse(raw);

        expect(output.result).toBe(
            [
                'Lightdash project: *Cloud project* (PREVIEW)',
                'dbt connection: dbt cloud',
                'dbt version: latest',
            ].join('\n'),
        );
        expect(output.structuredContent).toMatchObject({
            warehouseType: null,
            git: null,
            previewDeployCi: null,
        });
    });

    it('returns an error envelope whose structuredContent mirrors the text', async () => {
        const raw = await execute(
            vi.fn().mockRejectedValue(new Error('connection refused')),
        );

        expect(toolGetProjectInfoOutputSchema.safeParse(raw).success).toBe(
            true,
        );
        const output = toolGetProjectInfoOutputSchema.parse(raw);

        expect(output.metadata).toEqual({ status: 'error' });
        expect(output.result).toContain('Error getting project details.');
        expect(output.result).toContain('connection refused');
        expect(output.structuredContent).toEqual({ error: output.result });
    });
});
