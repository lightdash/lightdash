import {
    DimensionType,
    QuerySourceType,
    type AiArtifact,
    type ComposerStoredChartVizConfig,
} from '@lightdash/common';
import { getSlackBigNumbers } from './slackBigNumbers';

const bigNumberViz: ComposerStoredChartVizConfig = {
    type: 'big_number',
    x: null,
    y: ['revenue'],
    groupBy: null,
    stack: null,
    horizontal: null,
    y2: null,
    labels: null,
};

const composerArtifact = (
    versionUuid: string,
    vizConfig: ComposerStoredChartVizConfig,
): AiArtifact => ({
    artifactUuid: 'artifact',
    threadUuid: 'thread',
    artifactType: 'chart',
    savedQueryUuid: null,
    savedSqlUuid: null,
    savedDashboardUuid: null,
    createdAt: new Date(),
    versionNumber: 1,
    versionUuid,
    title: 'Total revenue',
    description: null,
    chartConfig: {
        source: 'composer',
        schemaVersion: 2,
        queries: [
            {
                sourceType: QuerySourceType.SEMANTIC_LAYER,
                nodeId: 'revenue',
                exploreName: 'payments',
                dimensions: [],
                metrics: ['payments_total_revenue'],
            },
            {
                sourceType: QuerySourceType.DUCKDB,
                nodeId: 'total',
                sql: 'SELECT SUM(payments_total_revenue) AS revenue FROM revenue',
                references: ['revenue'],
            },
        ],
        terminalNodeId: 'total',
        vizConfig,
    },
    dashboardConfig: null,
    promptUuid: 'prompt',
    versionCreatedAt: new Date(),
    verifiedByUserUuid: null,
    verifiedAt: null,
});

const visualizeResult = (versionUuid: string, queryUuid: string | null) => ({
    toolCallId: `call-${versionUuid}`,
    toolType: 'built-in' as const,
    toolName: 'visualize',
    metadata: {
        status: 'success',
        nodeId: 'total',
        artifactUuid: 'artifact',
        versionUuid,
        queryUuid,
    },
});

const setup = () => ({
    enableDataAccess: true,
    slackLinksOnly: false,
    toolResults: [visualizeResult('kpi', 'query-kpi')],
    artifacts: [composerArtifact('kpi', bigNumberViz)],
    authorize: vi.fn().mockResolvedValue(undefined),
    getResult: vi.fn().mockResolvedValue({
        columns: [
            {
                reference: 'revenue',
                type: DimensionType.NUMBER,
                label: 'Revenue',
                format: '"$"#,##0',
            },
        ],
        rows: [{ revenue: 48210 }],
    }),
    onLoadError: vi.fn(),
});

describe('getSlackBigNumbers', () => {
    it('formats a visualized big number, authorized against the explores it reads', async () => {
        const input = setup();

        const bigNumbers = await getSlackBigNumbers(input);

        expect(input.authorize).toHaveBeenCalledWith({
            queryUuid: 'query-kpi',
            exploreNames: ['payments'],
        });
        expect([...bigNumbers]).toEqual([
            ['kpi', { value: '$48,210', label: 'Revenue' }],
        ]);
    });

    it.each([
        ['data access is off', { enableDataAccess: false }],
        ['the organization is links-only', { slackLinksOnly: true }],
    ])('reads nothing when %s', async (_, override) => {
        const input = { ...setup(), ...override };

        expect((await getSlackBigNumbers(input)).size).toBe(0);
        expect(input.authorize).not.toHaveBeenCalled();
        expect(input.getResult).not.toHaveBeenCalled();
    });

    it('leaves link cards for other charts, unrun nodes and unreadable results', async () => {
        const input = {
            ...setup(),
            toolResults: [
                visualizeResult('bar', 'query-bar'),
                visualizeResult('unrun', null),
                visualizeResult('expired', 'query-expired'),
            ],
            artifacts: [
                composerArtifact('bar', {
                    ...bigNumberViz,
                    type: 'bar',
                    x: 'month',
                }),
                composerArtifact('unrun', bigNumberViz),
                composerArtifact('expired', bigNumberViz),
            ],
            authorize: vi
                .fn()
                .mockRejectedValue(new Error('Query results expired')),
        };

        expect((await getSlackBigNumbers(input)).size).toBe(0);
        expect(input.authorize).toHaveBeenCalledTimes(1);
        expect(input.onLoadError).toHaveBeenCalledWith('expired');
    });
});
