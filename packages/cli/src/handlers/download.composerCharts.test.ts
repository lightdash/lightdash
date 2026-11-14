import {
    ContentAsCodeType,
    LightdashError,
    PromotionAction,
    type ComposerChartAsCode,
} from '@lightdash/common';
import { promises as fs } from 'fs';
import * as yaml from 'js-yaml';
import * as os from 'os';
import * as path from 'path';
import { vi } from 'vitest';
import GlobalState from '../globalState';
import { lightdashApi } from './dbt/apiClient';
import { downloadContent, testHelpers } from './download';

vi.mock('../analytics/analytics', () => ({
    LightdashAnalytics: { track: vi.fn() },
}));

vi.mock('../config', () => ({
    getConfig: vi.fn().mockResolvedValue({
        user: { userUuid: 'user-uuid', organizationUuid: 'org-uuid' },
        context: { project: 'project-uuid' },
        answers: { metadataFileGitignoreNoticeShown: true },
    }),
    setAnswer: vi.fn(),
}));

vi.mock('./dbt/apiClient', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./dbt/apiClient')>()),
    lightdashApi: vi.fn(),
}));

const { downloadComposerCharts, readLooseCodeFiles, upsertResources } =
    testHelpers;

const composerChart: ComposerChartAsCode = {
    contentType: ContentAsCodeType.COMPOSER_CHART,
    version: 1,
    slug: 'orders-by-status',
    name: 'Orders by status',
    description: null,
    dashboardSlug: 'ops',
    spaceSlug: 'jaffle',
    pipeline: {
        schemaVersion: 1,
        terminalNodeId: 'orders',
        nodes: [
            {
                sourceType: 'sql',
                nodeId: 'orders',
                title: 'Orders',
                sql: 'select status, count(*) as n from orders group by 1',
            },
        ],
    } as unknown as ComposerChartAsCode['pipeline'],
    chart: {
        schemaVersion: 1,
        columns: [
            { reference: 'status', fieldType: 'dimension' },
            { reference: 'n', fieldType: 'metric' },
        ],
        chartConfig: {
            type: 'data_app_viz',
            config: {
                dataAppVizSlug: 'status-donut',
                fieldMapping: { status: 'status' },
            },
        },
        pivotConfig: { columns: ['status'] },
        tableConfig: { columnOrder: ['status', 'n'] },
    } as unknown as ComposerChartAsCode['chart'],
};

describe('composer charts as code in the CLI', () => {
    let tmpDir: string;

    beforeEach(async () => {
        vi.mocked(lightdashApi).mockReset();
        vi.spyOn(GlobalState, 'log').mockImplementation(() => undefined);
        vi.spyOn(GlobalState, 'debug').mockImplementation(() => undefined);
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'composer-cac-'));
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    const downloadComposerChartFiles = (ids: string[]) =>
        downloadContent(
            ids,
            'composerCharts',
            'project-uuid',
            'project',
            tmpDir,
        );

    it('downloads a composer chart to charts/<slug>.composer.yml, verbatim', async () => {
        vi.mocked(lightdashApi).mockResolvedValueOnce({
            composerCharts: [
                { ...composerChart, downloadedAt: new Date('2026-11-14') },
            ],
            missingIds: [],
            total: 1,
            offset: 1,
        } as never);

        const result = await downloadComposerChartFiles(['orders-by-status']);

        expect(lightdashApi).toHaveBeenCalledWith({
            method: 'GET',
            url: '/api/v1/projects/project-uuid/code/composerCharts?ids=orders-by-status&offset=0',
            body: undefined,
        });
        const written = yaml.load(
            await fs.readFile(
                path.join(tmpDir, 'charts', 'orders-by-status.composer.yml'),
                'utf-8',
            ),
        );
        expect(written).toEqual(composerChart);
        expect(result.chartTypeRefs).toEqual(['status-donut']);
        expect(result.metadataEntries).toEqual([
            expect.objectContaining({
                slug: 'orders-by-status',
                type: 'charts',
            }),
        ]);
    });

    const writeComposerChartFile = async () => {
        await fs.mkdir(path.join(tmpDir, 'charts'), { recursive: true });
        await fs.writeFile(
            path.join(tmpDir, 'charts', 'orders-by-status.composer.yml'),
            yaml.dump(composerChart),
        );
    };

    const uploadCharts = () =>
        upsertResources('charts', 'project-uuid', {}, false, [], true, tmpDir);

    it('uploads a composer chart file through the composer chart route', async () => {
        await writeComposerChartFile();
        vi.mocked(lightdashApi).mockResolvedValueOnce({
            action: PromotionAction.CREATE,
            composerChartUuid: 'composer-uuid',
        } as never);

        const result = await uploadCharts();

        expect(lightdashApi).toHaveBeenCalledTimes(1);
        const [{ method, url, body }] = vi.mocked(lightdashApi).mock.calls[0];
        expect(method).toBe('POST');
        expect(url).toBe(
            '/api/v1/projects/project-uuid/code/composerCharts/orders-by-status',
        );
        expect(JSON.parse(body as string)).toEqual(
            expect.objectContaining({
                pipeline: composerChart.pipeline,
                chart: composerChart.chart,
                dashboardSlug: 'ops',
            }),
        );
        expect(result.changes).toEqual({ 'charts created': 1 });
        expect(result.failedSlugs).toEqual([]);
    });

    it('counts an unchanged composer chart as skipped', async () => {
        await writeComposerChartFile();
        vi.mocked(lightdashApi).mockResolvedValueOnce({
            action: PromotionAction.NO_CHANGES,
            composerChartUuid: 'composer-uuid',
        } as never);

        const result = await uploadCharts();

        expect(result.changes).toEqual({ 'charts skipped': 1 });
    });

    it('shows the server refusal for a composer chart and holds its slug back', async () => {
        await writeComposerChartFile();
        vi.mocked(lightdashApi).mockRejectedValueOnce(
            new LightdashError({
                name: 'ForbiddenError',
                statusCode: 403,
                message:
                    'Composer charts are not enabled for this organization, so composer chart "orders-by-status" cannot be created or changed',
                data: {},
            }),
        );

        const result = await uploadCharts();

        expect(result.changes).toEqual({ 'charts with errors': 1 });
        expect(result.failedSlugs).toEqual(['orders-by-status']);
        expect(GlobalState.log).toHaveBeenCalledWith(
            expect.stringContaining(
                'composer chart "orders-by-status" cannot be created or changed',
            ),
        );
    });

    it('reads a composer chart file outside charts/ by its contentType', async () => {
        await fs.writeFile(
            path.join(tmpDir, 'orders-by-status.yml'),
            yaml.dump(composerChart),
        );

        const { charts } = await readLooseCodeFiles(tmpDir);

        expect(charts).toEqual([expect.objectContaining(composerChart)]);
    });

    it('skips composer charts on a server without their route', async () => {
        vi.mocked(lightdashApi).mockRejectedValueOnce(
            new LightdashError({
                name: 'NotFoundError',
                statusCode: 404,
                message: 'API endpoint not found',
                data: {},
            }),
        );

        await expect(
            downloadComposerCharts(
                [],
                'project-uuid',
                'project',
                tmpDir,
                false,
                vi.fn(),
            ),
        ).resolves.toBeNull();
    });
});
