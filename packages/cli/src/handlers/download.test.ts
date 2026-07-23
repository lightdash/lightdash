import {
    CartesianSeriesType,
    ChartType,
    ContentAsCodeType,
    DashboardAsCode,
    LightdashError,
    SpaceAsCodeAction,
    SpaceMemberRole,
    type CartesianChartConfig,
    type ChartAsCode,
    type Series,
    type SpaceAsCode,
} from '@lightdash/common';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { vi } from 'vitest';
import GlobalState from '../globalState';
import { lightdashApi } from './dbt/apiClient';
import { downloadContent, testHelpers } from './download';

vi.mock('./dbt/apiClient', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./dbt/apiClient')>()),
    lightdashApi: vi.fn(),
}));

const {
    assertUniqueSpacePaths,
    downloadSpaces,
    getDashboardChartSlugs,
    getFlatSpaceFileNames,
    readAiAgentFiles,
    readSpaceFiles,
    readSpaceNames,
    sanitizeChartForDownload,
    shouldFallBackToEmbeddedSpaces,
    shouldDownloadAiAgents,
    summarizeUploadChanges,
    upsertSpaces,
    upsertVirtualViews,
    validateSpaceIdentity,
    writeSpaceFiles,
} = testHelpers;

type LooseDashboard = DashboardAsCode & { needsUpdating: boolean };

const makeLooseDashboard = (
    slug: string,
    chartSlugs: (string | undefined)[],
): LooseDashboard =>
    ({
        slug,
        name: slug,
        spaceSlug: 'test-space',
        version: 1,
        tiles: chartSlugs.map((chartSlug) => ({
            properties: chartSlug ? { chartSlug } : {},
        })),
        needsUpdating: false,
    }) as unknown as LooseDashboard;

const writeFolderDashboard = async (
    baseDir: string,
    slug: string,
    chartSlugs: string[],
) => {
    const tilesYaml = chartSlugs
        .map(
            (s) =>
                `  - properties:\n      chartSlug: ${s}\n    type: saved_chart`,
        )
        .join('\n');
    const yaml = `contentType: dashboard\nname: ${slug}\nslug: ${slug}\nspaceSlug: test-space\ntiles:\n${tilesYaml}\nversion: 1\n`;
    await fs.writeFile(path.join(baseDir, 'dashboards', `${slug}.yml`), yaml);
};

describe('summarizeUploadChanges', () => {
    it('reports only phase deltas and warns when resources fail', () => {
        expect(
            summarizeUploadChanges(
                { 'charts created': 1, 'spaces skipped': 3 },
                {
                    'charts created': 3,
                    'spaces skipped': 3,
                    'charts skipped': 2,
                    'charts with errors': 1,
                },
            ),
        ).toEqual({
            detail: '2 created, 2 skipped, 1 with errors',
            variant: 'warning',
        });
    });

    it('reports an empty phase without inventing a resource count', () => {
        expect(summarizeUploadChanges({}, {})).toEqual({
            detail: 'no changes',
        });
    });
});

const pivotedSeries = (
    pivotValue: string,
    overrides: Partial<Series> = {},
): Series => ({
    type: CartesianSeriesType.BAR,
    encode: {
        xRef: { field: 'events_date_day' },
        yRef: {
            field: 'orders_count',
            pivotValues: [{ field: 'orders_status', value: pivotValue }],
        },
        x: 'events_date_day',
        y: `orders_count.orders_status.${pivotValue}`,
    },
    ...overrides,
});

const makeChart = (series: Series[]): ChartAsCode =>
    ({
        name: 'pivoted chart',
        slug: 'pivoted-chart',
        spaceSlug: 'test-space',
        tableName: 'orders',
        version: 1,
        metricQuery: {
            additionalMetrics: [],
            customDimensions: [],
            dimensionOverrides: {},
            dimensions: ['orders_status', 'events_date_day'],
            exploreName: 'orders',
            filters: {},
            limit: 500,
            metricOverrides: {},
            metrics: ['orders_count'],
            sorts: [],
            tableCalculations: [],
            timezone: 'project_timezone',
        },
        chartConfig: {
            type: ChartType.CARTESIAN,
            config: {
                layout: {
                    xField: 'events_date_day',
                    yField: ['orders_count'],
                },
                eChartsConfig: {
                    series,
                },
            },
        } satisfies CartesianChartConfig,
        pivotConfig: {
            columns: ['orders_status'],
        },
        dashboardSlug: undefined,
    }) as ChartAsCode;

describe('getDashboardChartSlugs', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'download-test-'));
        await fs.mkdir(path.join(tmpDir, 'dashboards'));
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('extracts chart slugs from folder dashboards', async () => {
        await writeFolderDashboard(tmpDir, 'folder-dash', [
            'chart-a',
            'chart-b',
        ]);
        const slugs = await getDashboardChartSlugs([], tmpDir);
        expect(slugs.sort()).toEqual(['chart-a', 'chart-b']);
    });

    it('extracts chart slugs from loose dashboards (PROD-7869 regression)', async () => {
        const loose = makeLooseDashboard('loose-dash', [
            'loose-chart-1',
            'loose-chart-2',
        ]);
        const slugs = await getDashboardChartSlugs([], tmpDir, [loose]);
        expect(slugs.sort()).toEqual(['loose-chart-1', 'loose-chart-2']);
    });

    it('extracts chart slugs from both folder and loose dashboards when unioned', async () => {
        await writeFolderDashboard(tmpDir, 'folder-dash', ['folder-chart']);
        const loose = makeLooseDashboard('loose-dash', ['loose-chart']);
        const slugs = await getDashboardChartSlugs([], tmpDir, [loose]);
        expect(slugs.sort()).toEqual(['folder-chart', 'loose-chart']);
    });

    it('filters by slug across both folder and loose sources', async () => {
        await writeFolderDashboard(tmpDir, 'folder-dash', ['folder-chart']);
        const loose = makeLooseDashboard('loose-dash', ['loose-chart']);

        const onlyFolder = await getDashboardChartSlugs(
            ['folder-dash'],
            tmpDir,
            [loose],
        );
        expect(onlyFolder).toEqual(['folder-chart']);

        const onlyLoose = await getDashboardChartSlugs(['loose-dash'], tmpDir, [
            loose,
        ]);
        expect(onlyLoose).toEqual(['loose-chart']);
    });

    it('returns empty array when slug filter matches no dashboards', async () => {
        await writeFolderDashboard(tmpDir, 'folder-dash', ['folder-chart']);
        const loose = makeLooseDashboard('loose-dash', ['loose-chart']);
        const slugs = await getDashboardChartSlugs(['nonexistent'], tmpDir, [
            loose,
        ]);
        expect(slugs).toEqual([]);
    });

    it('skips tiles without a chartSlug (e.g. markdown, loom)', async () => {
        const loose = makeLooseDashboard('loose-dash', [
            'real-chart',
            undefined,
            undefined,
        ]);
        const slugs = await getDashboardChartSlugs([], tmpDir, [loose]);
        expect(slugs).toEqual(['real-chart']);
    });
});

describe('sanitizeChartForDownload', () => {
    it('preserves per-value pivot series customizations by default', () => {
        const chart = makeChart([
            pivotedSeries('completed', {
                name: 'Completed orders',
                color: '#1f77b4',
                isFilteredOut: false,
            }),
            pivotedSeries('returned', {
                name: 'Returned orders',
                color: '#d62728',
                isFilteredOut: true,
            }),
        ]);

        const result = sanitizeChartForDownload(chart, false);

        expect(result).toBe(chart);
        const series = (result.chartConfig as CartesianChartConfig).config
            ?.eChartsConfig.series;
        expect(series).toHaveLength(2);
        expect(series?.[1]).toEqual(
            expect.objectContaining({
                name: 'Returned orders',
                color: '#d62728',
                isFilteredOut: true,
            }),
        );
        expect(series?.[1].encode.yRef.pivotValues).toEqual([
            { field: 'orders_status', value: 'returned' },
        ]);
    });

    it('strips and dedupes per-value pivot series when requested', () => {
        const chart = makeChart([
            pivotedSeries('completed', {
                name: 'Completed orders',
                color: '#1f77b4',
            }),
            pivotedSeries('returned', {
                name: 'Returned orders',
                color: '#d62728',
            }),
        ]);

        const result = sanitizeChartForDownload(chart, true);

        expect(result).not.toBe(chart);
        const series = (result.chartConfig as CartesianChartConfig).config
            ?.eChartsConfig.series;
        expect(series).toHaveLength(1);
        expect(series?.[0].name).toBeUndefined();
        expect(series?.[0].color).toBeUndefined();
        expect(series?.[0].encode).toEqual({
            xRef: { field: 'events_date_day' },
            yRef: { field: 'orders_count' },
        });
    });
});

describe('upsertVirtualViews', () => {
    let tmpDir: string;
    const virtualView = (slug: string) => `columns:
  - name: order_id
contentType: virtual_view
name: ${slug}
parameters: null
slug: ${slug}
sql: SELECT 1 AS order_id
version: 1
`;

    beforeEach(async () => {
        vi.mocked(lightdashApi).mockReset();
        tmpDir = await fs.mkdtemp(
            path.join(os.tmpdir(), 'virtual-views-test-'),
        );
        await fs.mkdir(path.join(tmpDir, 'virtual-views'));
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('continues uploading after one virtual view is denied', async () => {
        await fs.writeFile(
            path.join(tmpDir, 'virtual-views', 'a-denied.yml'),
            virtualView('a-denied'),
        );
        await fs.writeFile(
            path.join(tmpDir, 'virtual-views', 'b-allowed.yml'),
            virtualView('b-allowed'),
        );
        vi.mocked(lightdashApi)
            .mockRejectedValueOnce(new Error('Forbidden'))
            .mockResolvedValueOnce({ action: 'create' } as never);

        const changes = await upsertVirtualViews(
            'project-uuid',
            [],
            {},
            false,
            true,
            tmpDir,
        );

        expect(lightdashApi).toHaveBeenCalledTimes(2);
        expect(changes).toEqual({
            'virtual views with errors': 1,
            'virtual views created': 1,
        });
    });

    it('does not report missing permissions when there are no local virtual views', async () => {
        const logSpy = vi
            .spyOn(GlobalState, 'log')
            .mockImplementation(() => undefined);

        const changes = await upsertVirtualViews(
            'project-uuid',
            [],
            {},
            false,
            false,
            tmpDir,
        );

        expect(changes).toEqual({});
        expect(lightdashApi).not.toHaveBeenCalled();
        expect(logSpy).not.toHaveBeenCalled();
    });

    it('reports one category error without uploading when local virtual views are forbidden', async () => {
        const logSpy = vi
            .spyOn(GlobalState, 'log')
            .mockImplementation(() => undefined);
        await fs.writeFile(
            path.join(tmpDir, 'virtual-views', 'a-denied.yml'),
            virtualView('a-denied'),
        );
        await fs.writeFile(
            path.join(tmpDir, 'virtual-views', 'b-denied.yml'),
            virtualView('b-denied'),
        );

        const changes = await upsertVirtualViews(
            'project-uuid',
            [],
            {},
            false,
            false,
            tmpDir,
        );

        expect(changes).toEqual({});
        expect(lightdashApi).not.toHaveBeenCalled();
        expect(logSpy).toHaveBeenCalledExactlyOnceWith(
            expect.stringContaining('Error uploading virtual views'),
        );
    });
});

describe('readAiAgentFiles', () => {
    let tmpDir: string;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-code-test-'));
        await fs.mkdir(path.join(tmpDir, 'ai-agents'));
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('rejects YAML files with an invalid AI agent content type', async () => {
        await fs.writeFile(
            path.join(tmpDir, 'ai-agents', 'invalid.yml'),
            'contentType: ai_agnet\nslug: invalid-agent\n',
        );

        await expect(readAiAgentFiles(tmpDir)).rejects.toThrow(
            'Invalid contentType in AI agent file',
        );
    });

    it('reads evaluation suites nested in an AI agent file', async () => {
        await fs.writeFile(
            path.join(tmpDir, 'ai-agents', 'revenue-agent.yml'),
            [
                'contentType: ai_agent',
                'version: 1',
                'slug: revenue-agent',
                'evaluations:',
                '  - title: Core regression suite',
                '    prompts:',
                '      - prompt: What was revenue last month?',
                '        expectedResponse: Uses the certified revenue metric.',
                '',
            ].join('\n'),
        );

        const agents = await readAiAgentFiles(tmpDir);

        expect(agents[0].evaluations).toEqual([
            {
                title: 'Core regression suite',
                prompts: [
                    {
                        prompt: 'What was revenue last month?',
                        expectedResponse: 'Uses the certified revenue metric.',
                    },
                ],
            },
        ]);
    });
});

describe('shouldDownloadAiAgents', () => {
    it('does not download AI agents by default', () => {
        expect(
            shouldDownloadAiAgents({
                agents: [],
                includeAgents: false,
                includeAll: false,
            }),
        ).toBe(false);
    });

    it.each([
        { agents: [], includeAgents: true, includeAll: false },
        { agents: ['sales-agent'], includeAgents: false, includeAll: false },
        { agents: [], includeAgents: false, includeAll: true },
    ])('downloads AI agents when explicitly selected', (options) => {
        expect(shouldDownloadAiAgents(options)).toBe(true);
    });

    it('does not download AI agents in apps-only mode', () => {
        expect(
            shouldDownloadAiAgents({
                agents: ['sales-agent'],
                includeAgents: true,
                includeAll: true,
                appsOnly: true,
            }),
        ).toBe(false);
    });
});

describe('space files', () => {
    const accessSpace = (slug: string): SpaceAsCode =>
        ({
            contentType: 'space',
            version: 1,
            spaceName: slug,
            slug,
            access: {
                inheritParentPermissions: false,
                projectMemberAccessRole: null,
                users: [],
                groups: [],
            },
        }) as SpaceAsCode;

    beforeEach(() => {
        vi.mocked(lightdashApi).mockReset();
    });

    const embeddedSpaceResponse = (spaceName: string) => ({
        charts: [makeChart([])],
        languageMap: undefined,
        missingIds: [],
        offset: 1,
        spaces: [
            {
                contentType: ContentAsCodeType.SPACE,
                spaceName,
                slug: 'test-space',
            },
        ],
        total: 1,
    });

    it('writes new flat space files under spaces by default', async () => {
        const tmpDir = await fs.mkdtemp(
            path.join(os.tmpdir(), 'space-code-flat-folder-'),
        );
        try {
            await writeSpaceFiles(
                [accessSpace('finance')],
                'project',
                tmpDir,
                'flat',
            );

            await expect(
                fs.readFile(
                    path.join(tmpDir, 'spaces', 'finance.space.yml'),
                    'utf-8',
                ),
            ).resolves.toContain('slug: finance');
            await expect(
                fs.access(path.join(tmpDir, 'finance.space.yml')),
            ).rejects.toMatchObject({ code: 'ENOENT' });
        } finally {
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
    });

    it('supports the legacy root-spaces flat layout', async () => {
        const tmpDir = await fs.mkdtemp(
            path.join(os.tmpdir(), 'space-code-root-layout-'),
        );
        try {
            await writeSpaceFiles(
                [accessSpace('finance')],
                'project',
                tmpDir,
                'flat',
                'root',
            );

            await expect(
                fs.readFile(path.join(tmpDir, 'finance.space.yml'), 'utf-8'),
            ).resolves.toContain('slug: finance');
            await expect(
                fs.access(path.join(tmpDir, 'spaces')),
            ).rejects.toMatchObject({ code: 'ENOENT' });
        } finally {
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
    });

    it('preserves existing access when filtered metadata updates a space file', async () => {
        const tmpDir = await fs.mkdtemp(
            path.join(os.tmpdir(), 'space-code-filtered-policy-'),
        );
        vi.mocked(lightdashApi).mockResolvedValue(
            embeddedSpaceResponse('Updated finance') as never,
        );
        const existingFile = path.join(tmpDir, 'finance.space.yml');
        await fs.writeFile(
            existingFile,
            `access:
  groups: []
  inheritParentPermissions: false
  projectMemberAccessRole: null
  users:
    - email: owner@example.com
      role: admin
contentType: space
slug: test-space
spaceName: Finance
version: 1
`,
        );

        try {
            const onProgress = vi.fn();
            await downloadContent(
                ['pivoted-chart'],
                'charts',
                'project-uuid',
                'project',
                tmpDir,
                false,
                false,
                false,
                false,
                false,
                onProgress,
            );

            expect(onProgress).toHaveBeenCalledWith('1 of 1 charts downloaded');

            await expect(readSpaceFiles(tmpDir)).resolves.toEqual([
                expect.objectContaining({
                    filePath: existingFile,
                    space: {
                        contentType: 'space',
                        version: 1,
                        spaceName: 'Updated finance',
                        slug: 'test-space',
                        access: {
                            inheritParentPermissions: false,
                            projectMemberAccessRole: null,
                            users: [
                                {
                                    email: 'owner@example.com',
                                    role: SpaceMemberRole.ADMIN,
                                },
                            ],
                            groups: [],
                        },
                    },
                }),
            ]);
            await expect(
                fs.access(
                    path.join(tmpDir, 'spaces', 'updated-finance.space.yml'),
                ),
            ).rejects.toMatchObject({ code: 'ENOENT' });
        } finally {
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
    });

    it('writes nested definitions inside each full space path', async () => {
        const tmpDir = await fs.mkdtemp(
            path.join(os.tmpdir(), 'space-code-nested-layout-'),
        );
        try {
            await writeSpaceFiles(
                [
                    { ...accessSpace('parent'), spaceName: 'Parent' },
                    {
                        ...accessSpace('parent/child'),
                        spaceName: 'Child',
                    },
                ],
                'project',
                tmpDir,
                'nested',
            );

            await expect(
                fs.readFile(
                    path.join(tmpDir, 'project', 'parent', 'parent.space.yml'),
                    'utf-8',
                ),
            ).resolves.toContain('slug: parent');
            await expect(
                fs.readFile(
                    path.join(
                        tmpDir,
                        'project',
                        'parent',
                        'child',
                        'child.space.yml',
                    ),
                    'utf-8',
                ),
            ).resolves.toContain('slug: parent/child');
            await expect(
                fs.access(path.join(tmpDir, 'spaces')),
            ).rejects.toMatchObject({ code: 'ENOENT' });
        } finally {
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
    });

    it('downloads metadata-only spaces when access cannot be exported', async () => {
        const tmpDir = await fs.mkdtemp(
            path.join(os.tmpdir(), 'space-code-metadata-fallback-'),
        );
        const logSpy = vi
            .spyOn(GlobalState, 'log')
            .mockImplementation(() => undefined);
        await fs.writeFile(
            path.join(tmpDir, 'finance.space.yml'),
            `access:
  groups: []
  inheritParentPermissions: false
  projectMemberAccessRole: null
  users: []
contentType: space
slug: finance
spaceName: Finance
version: 1
`,
        );
        vi.mocked(lightdashApi).mockResolvedValue({
            spaces: [
                {
                    contentType: ContentAsCodeType.SPACE,
                    spaceName: 'Finance',
                    slug: 'finance',
                },
            ],
            skipped: [
                {
                    slug: 'finance',
                    reason: 'Direct access contains a user without a portable organization identity',
                },
            ],
        });

        try {
            await expect(
                downloadSpaces('project-uuid', 'Project', tmpDir),
            ).resolves.toBe(1);
            await expect(readSpaceFiles(tmpDir)).resolves.toEqual([
                expect.objectContaining({
                    space: {
                        contentType: 'space',
                        spaceName: 'Finance',
                        slug: 'finance',
                    },
                }),
            ]);
            const downloadedFile = await fs.readFile(
                path.join(tmpDir, 'finance.space.yml'),
                'utf-8',
            );
            expect(downloadedFile).not.toContain('access:');
            expect(downloadedFile).not.toContain('version:');
            await expect(
                fs.access(path.join(tmpDir, 'spaces', 'finance.space.yml')),
            ).rejects.toMatchObject({ code: 'ENOENT' });
            expect(logSpy).toHaveBeenCalledWith(
                expect.stringContaining(
                    'Downloaded space "finance" without access',
                ),
            );
            expect(logSpy).not.toHaveBeenCalledWith(
                expect.stringContaining('Skipped space "finance"'),
            );
        } finally {
            logSpy.mockRestore();
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
    });

    it('accepts legacy metadata-only files without a version', () => {
        expect(
            validateSpaceIdentity(
                {
                    contentType: 'space',
                    spaceName: 'Finance',
                    slug: 'company/finance',
                },
                'finance.space.yml',
            ),
        ).toEqual({
            contentType: 'space',
            spaceName: 'Finance',
            slug: 'company/finance',
        });
    });

    it('reads legacy space names without validating access policy', async () => {
        const tmpDir = await fs.mkdtemp(
            path.join(os.tmpdir(), 'space-name-test-'),
        );
        try {
            await fs.writeFile(
                path.join(tmpDir, 'finance.space.yml'),
                `access:
  unsupported: true
contentType: space
spaceName: Finance operations
slug: finance
version: 99
`,
            );
            await fs.writeFile(
                path.join(tmpDir, 'invalid.space.yml'),
                'contentType: [invalid\n',
            );

            await expect(readSpaceFiles(tmpDir)).rejects.toThrow(
                'Invalid version',
            );
            await expect(readSpaceNames(tmpDir)).resolves.toEqual({
                finance: 'Finance operations',
            });
        } finally {
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
    });

    it('requires version 1 when access is present', () => {
        expect(() =>
            validateSpaceIdentity(
                {
                    contentType: 'space',
                    spaceName: 'Finance',
                    slug: 'finance',
                    access: {
                        inheritParentPermissions: false,
                        projectMemberAccessRole: null,
                        users: [],
                        groups: [],
                    },
                },
                'finance.space.yml',
            ),
        ).toThrow('version 1 is required when access is present');
    });

    it('normalizes emails and rejects duplicate principals', () => {
        const parsed = validateSpaceIdentity(
            {
                contentType: 'space',
                version: 1,
                spaceName: 'Finance',
                slug: 'finance',
                access: {
                    inheritParentPermissions: false,
                    projectMemberAccessRole: SpaceMemberRole.VIEWER,
                    users: [
                        {
                            email: ' Alice@Example.com ',
                            role: SpaceMemberRole.ADMIN,
                        },
                    ],
                    groups: [
                        {
                            name: 'Finance team',
                            role: SpaceMemberRole.EDITOR,
                        },
                    ],
                },
            },
            'finance.space.yml',
        );

        expect(parsed.access?.users).toEqual([
            { email: 'alice@example.com', role: SpaceMemberRole.ADMIN },
        ]);

        expect(() =>
            validateSpaceIdentity(
                {
                    ...parsed,
                    access: {
                        ...parsed.access,
                        users: [
                            {
                                email: 'alice@example.com',
                                role: SpaceMemberRole.ADMIN,
                            },
                            {
                                email: 'ALICE@example.com',
                                role: SpaceMemberRole.VIEWER,
                            },
                        ],
                    },
                },
                'finance.space.yml',
            ),
        ).toThrow('Duplicate user email "alice@example.com"');

        expect(() =>
            validateSpaceIdentity(
                {
                    ...parsed,
                    access: {
                        ...parsed.access,
                        groups: [
                            {
                                name: 'Finance team',
                                role: SpaceMemberRole.EDITOR,
                            },
                            {
                                name: 'Finance team',
                                role: SpaceMemberRole.VIEWER,
                            },
                        ],
                    },
                },
                'finance.space.yml',
            ),
        ).toThrow('Duplicate group name "Finance team"');
    });

    it('reads nested definitions parent-first', async () => {
        const tmpDir = await fs.mkdtemp(
            path.join(os.tmpdir(), 'space-code-test-'),
        );
        try {
            await fs.mkdir(path.join(tmpDir, 'nested'));
            await fs.writeFile(
                path.join(tmpDir, 'nested', 'child.space.yml'),
                `contentType: space\nspaceName: Child\nslug: parent/child\n`,
            );
            await fs.writeFile(
                path.join(tmpDir, 'parent.space.yml'),
                `contentType: space\nspaceName: Parent\nslug: parent\n`,
            );

            await expect(readSpaceFiles(tmpDir)).resolves.toEqual([
                expect.objectContaining({
                    space: expect.objectContaining({ slug: 'parent' }),
                }),
                expect.objectContaining({
                    space: expect.objectContaining({ slug: 'parent/child' }),
                }),
            ]);
        } finally {
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
    });

    it('rejects non-canonical and colliding normalized paths', () => {
        expect(() =>
            validateSpaceIdentity(
                {
                    contentType: 'space',
                    spaceName: 'Finance',
                    slug: 'Parent_With.Space',
                },
                'finance.space.yml',
            ),
        ).toThrow('canonical lowercase slash-separated path');

        expect(() =>
            assertUniqueSpacePaths([
                {
                    filePath: 'one.space.yml',
                    space: accessSpace('parent-child'),
                },
                {
                    filePath: 'two.space.yml',
                    space: {
                        ...accessSpace('parent-child'),
                        slug: 'parent_child',
                    },
                },
            ]),
        ).toThrow('resolve to the same normalized path');
    });

    it('uses deterministic collision-safe flat filenames', () => {
        const spaces = [
            { ...accessSpace('finance-a'), spaceName: 'Finance!' },
            { ...accessSpace('finance-b'), spaceName: 'Finance?' },
        ];

        const first = getFlatSpaceFileNames(spaces);
        expect(first).toEqual(
            getFlatSpaceFileNames([...spaces].reverse()).reverse(),
        );
        expect(new Set(first).size).toBe(2);
        expect(
            first.every((fileName) =>
                /^finance-[a-f0-9]{8}\.space\.yml$/.test(fileName),
            ),
        ).toBe(true);
    });

    it('never overwrites an existing filename owned by another slug', async () => {
        const tmpDir = await fs.mkdtemp(
            path.join(os.tmpdir(), 'space-code-protected-file-'),
        );
        const protectedContent =
            'contentType: space\nspaceName: Existing\nslug: existing\n';
        try {
            await fs.writeFile(
                path.join(tmpDir, 'finance.space.yml'),
                protectedContent,
            );
            await writeSpaceFiles(
                [
                    {
                        ...accessSpace('new-finance'),
                        spaceName: 'Finance',
                    },
                ],
                'project',
                tmpDir,
                'flat',
            );

            await expect(
                fs.readFile(path.join(tmpDir, 'finance.space.yml'), 'utf-8'),
            ).resolves.toBe(protectedContent);
            const newSpaceFile = (await fs.readdir(tmpDir)).find(
                (fileName) =>
                    fileName !== 'finance.space.yml' &&
                    fileName.endsWith('.space.yml'),
            );
            expect(newSpaceFile).toBeDefined();
            expect(
                await fs.readFile(path.join(tmpDir, newSpaceFile!), 'utf-8'),
            ).toContain('slug: new-finance');
            await expect(
                fs.access(path.join(tmpDir, 'spaces')),
            ).rejects.toMatchObject({ code: 'ENOENT' });
        } finally {
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
    });

    it('uses the legacy root layout for new slugs when a root space file exists', async () => {
        const tmpDir = await fs.mkdtemp(
            path.join(os.tmpdir(), 'space-code-mixed-layout-'),
        );
        try {
            await fs.writeFile(
                path.join(tmpDir, 'finance.space.yml'),
                'contentType: space\nspaceName: Old finance\nslug: finance\n',
            );
            await writeSpaceFiles(
                [
                    { ...accessSpace('finance'), spaceName: 'New finance' },
                    { ...accessSpace('operations'), spaceName: 'Operations' },
                ],
                'project',
                tmpDir,
                'flat',
            );

            await expect(
                fs.readFile(path.join(tmpDir, 'finance.space.yml'), 'utf-8'),
            ).resolves.toContain('spaceName: New finance');
            await expect(
                fs.readFile(path.join(tmpDir, 'operations.space.yml'), 'utf-8'),
            ).resolves.toContain('slug: operations');
            await expect(
                fs.access(path.join(tmpDir, 'spaces')),
            ).rejects.toMatchObject({ code: 'ENOENT' });
            expect(
                (await readSpaceFiles(tmpDir)).map(({ space }) => space.slug),
            ).toEqual(['finance', 'operations']);
        } finally {
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
    });

    it('rejects duplicate existing slugs across layouts before writing', async () => {
        const tmpDir = await fs.mkdtemp(
            path.join(os.tmpdir(), 'space-code-duplicate-layout-'),
        );
        try {
            await fs.mkdir(path.join(tmpDir, 'spaces'));
            const duplicate =
                'contentType: space\nspaceName: Finance\nslug: finance\n';
            await fs.writeFile(
                path.join(tmpDir, 'finance.space.yml'),
                duplicate,
            );
            await fs.writeFile(
                path.join(tmpDir, 'spaces', 'finance.space.yml'),
                duplicate,
            );

            await expect(
                writeSpaceFiles(
                    [accessSpace('operations')],
                    'project',
                    tmpDir,
                    'flat',
                ),
            ).rejects.toThrow(
                'Multiple existing space files use slug "finance"',
            );
            await expect(
                fs.access(path.join(tmpDir, 'spaces', 'operations.space.yml')),
            ).rejects.toMatchObject({ code: 'ENOENT' });
        } finally {
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
    });

    it('fails a space download when the space endpoint is unavailable', async () => {
        const tmpDir = await fs.mkdtemp(
            path.join(os.tmpdir(), 'space-code-api-failure-'),
        );
        vi.mocked(lightdashApi).mockRejectedValue(
            new Error('space endpoint unavailable'),
        );

        try {
            const error = await downloadSpaces(
                'project-uuid',
                'Project',
                tmpDir,
            ).catch((caughtError: unknown) => caughtError);

            expect(error).toMatchObject({
                name: 'SpaceAsCodeFetchError',
                message: 'space endpoint unavailable',
            });
            expect(shouldFallBackToEmbeddedSpaces(error, false)).toBe(true);
            expect(shouldFallBackToEmbeddedSpaces(error, true)).toBe(false);
        } finally {
            await fs.rm(tmpDir, { recursive: true, force: true });
        }
    });

    it('uploads parent-first and aggregates API actions', async () => {
        const logSpy = vi
            .spyOn(GlobalState, 'log')
            .mockImplementation(() => undefined);
        vi.mocked(lightdashApi)
            .mockResolvedValueOnce({
                action: SpaceAsCodeAction.CREATE,
                warnings: ['A direct service-account grant will be removed'],
            } as never)
            .mockResolvedValueOnce({
                action: SpaceAsCodeAction.UPDATE,
            } as never);
        const changes = await upsertSpaces(
            'project-uuid',
            [
                { filePath: 'child.space.yml', space: accessSpace('a/b') },
                { filePath: 'parent.space.yml', space: accessSpace('a') },
            ],
            {},
            false,
            false,
        );

        expect(changes).toEqual({
            'spaces created': 1,
            'spaces updated': 1,
        });
        expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining(
                'A direct service-account grant will be removed',
            ),
        );
        expect(
            vi
                .mocked(lightdashApi)
                .mock.calls.map(
                    ([request]) =>
                        JSON.parse(
                            typeof request.body === 'string'
                                ? request.body
                                : '{}',
                        ).slug,
                ),
        ).toEqual(['a', 'a/b']);
        logSpy.mockRestore();
    });

    it('omits access and warns when skip-space-access is enabled', async () => {
        const logSpy = vi
            .spyOn(GlobalState, 'log')
            .mockImplementation(() => undefined);
        vi.mocked(lightdashApi).mockResolvedValueOnce({
            action: SpaceAsCodeAction.CREATE,
        } as never);

        await upsertSpaces(
            'project-uuid',
            [{ filePath: 'space.space.yml', space: accessSpace('finance') }],
            {},
            false,
            true,
            true,
        );

        const [request] = vi.mocked(lightdashApi).mock.calls[0];
        expect(JSON.parse(String(request.body))).toEqual({
            contentType: 'space',
            version: 1,
            spaceName: 'finance',
            slug: 'finance',
        });
        expect(request.url).toContain('publicSpaceCreate=true');
        expect(logSpy).toHaveBeenCalledWith(
            expect.stringContaining(
                'Existing destination access will be preserved',
            ),
        );
        logSpy.mockRestore();
    });

    it.each([
        'User example@lightdash.com is not a member of this organization',
        'Group finance does not exist in this organization',
    ])(
        'suggests skip-space-access when a destination identity is missing: %s',
        async (errorMessage) => {
            const logSpy = vi
                .spyOn(GlobalState, 'log')
                .mockImplementation(() => undefined);
            vi.mocked(lightdashApi).mockRejectedValueOnce(
                new Error(errorMessage),
            );

            await expect(
                upsertSpaces(
                    'project-uuid',
                    [
                        {
                            filePath: 'space.space.yml',
                            space: accessSpace('finance'),
                        },
                    ],
                    {},
                    false,
                    false,
                ),
            ).rejects.toThrow('content upload was not started');
            expect(logSpy).toHaveBeenCalledWith(
                expect.stringContaining(
                    'Hint: use --skip-space-access to upload the space without applying its access policy.',
                ),
            );
            logSpy.mockRestore();
        },
    );

    it('treats missing spaces and descendants as nonfatal with skip-space-create', async () => {
        vi.mocked(lightdashApi)
            .mockRejectedValueOnce(
                new LightdashError({
                    message: 'Space a does not exist, skipping creation',
                    name: 'NotFoundError',
                    statusCode: 404,
                    data: {},
                }),
            )
            .mockResolvedValueOnce({
                action: SpaceAsCodeAction.NO_CHANGES,
            } as never);

        await expect(
            upsertSpaces(
                'project-uuid',
                [
                    { filePath: 'child.space.yml', space: accessSpace('a/b') },
                    { filePath: 'other.space.yml', space: accessSpace('z') },
                    { filePath: 'parent.space.yml', space: accessSpace('a') },
                ],
                {},
                true,
                false,
            ),
        ).resolves.toEqual({
            'spaces skipped': 2,
            'spaces unchanged': 1,
        });
        expect(lightdashApi).toHaveBeenCalledTimes(2);
        expect(
            vi
                .mocked(lightdashApi)
                .mock.calls.map(
                    ([request]) =>
                        JSON.parse(
                            typeof request.body === 'string'
                                ? request.body
                                : '{}',
                        ).slug,
                ),
        ).toEqual(['a', 'z']);
    });

    it('skips descendants after a parent failure and blocks content', async () => {
        const summarySpy = vi
            .spyOn(console, 'info')
            .mockImplementation(() => undefined);
        vi.mocked(lightdashApi)
            .mockRejectedValueOnce(new Error('parent rejected'))
            .mockResolvedValueOnce({
                action: SpaceAsCodeAction.CREATE,
            } as never);
        const changes: Record<string, number> = {};

        await expect(
            upsertSpaces(
                'project-uuid',
                [
                    { filePath: 'child.space.yml', space: accessSpace('a/b') },
                    { filePath: 'other.space.yml', space: accessSpace('z') },
                    { filePath: 'parent.space.yml', space: accessSpace('a') },
                ],
                changes,
                false,
                false,
            ),
        ).rejects.toThrow('content upload was not started');
        expect(lightdashApi).toHaveBeenCalledTimes(2);
        expect(changes).toEqual({
            'spaces with errors': 1,
            'spaces created': 1,
            'spaces dependency skipped': 1,
        });
        expect(summarySpy.mock.calls.map(([message]) => message)).toEqual([
            'Total spaces with errors: 1 ',
            'Total spaces created: 1 ',
            'Total spaces dependency skipped: 1 ',
        ]);
        summarySpy.mockRestore();
    });
});
