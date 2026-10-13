import { QuerySourceType, type SourceQuery } from '../../types/querySources';
import {
    buildComposerArtifactPipeline,
    type AiComposerChartArtifactConfig,
} from './composerArtifact';

const revenueUuid = '11111111-1111-4111-8111-111111111111';
const forecastUuid = '22222222-2222-4222-8222-222222222222';
const chartUuid = '33333333-3333-4333-8333-333333333333';

const earlierPipeline: AiComposerChartArtifactConfig = {
    source: 'composer',
    schemaVersion: 1,
    queries: [
        { sourceType: QuerySourceType.SQL, nodeId: 'revenue', sql: 'SELECT 1' },
        {
            sourceType: QuerySourceType.PYTHON,
            nodeId: 'forecast',
            code: 'def run(inputs, params):\n    return inputs["revenue"]',
            references: ['revenue'],
        },
    ],
    terminalNodeId: 'forecast',
    lastQueryUuid: forecastUuid,
    nodeResults: {
        revenue: { queryUuid: revenueUuid },
        forecast: { queryUuid: forecastUuid },
    },
};

describe('buildComposerArtifactPipeline', () => {
    it('copies a reused python node and its references by queryUuid', () => {
        const queries: SourceQuery[] = [
            {
                sourceType: QuerySourceType.DUCKDB,
                nodeId: 'chart',
                sql: 'SELECT * FROM f',
                references: { f: forecastUuid },
            },
        ];

        const pipeline = buildComposerArtifactPipeline({
            queries,
            submissions: [{ nodeId: 'chart', queryUuid: chartUuid }],
            earlierPipelines: [earlierPipeline],
        });

        expect(pipeline.queries).toEqual([
            expect.objectContaining({
                sourceType: QuerySourceType.SQL,
                nodeId: 'revenue_11111111',
            }),
            expect.objectContaining({
                sourceType: QuerySourceType.PYTHON,
                nodeId: 'forecast_22222222',
                references: { revenue: 'revenue_11111111' },
            }),
            expect.objectContaining({
                nodeId: 'chart',
                references: { f: 'forecast_22222222' },
            }),
        ]);
        expect(pipeline.nodeResults).toEqual({
            revenue_11111111: { queryUuid: revenueUuid },
            forecast_22222222: { queryUuid: forecastUuid },
            chart: { queryUuid: chartUuid },
        });
    });

    it('rewrites python map references to earlier results', () => {
        const pipeline = buildComposerArtifactPipeline({
            queries: [
                {
                    sourceType: QuerySourceType.PYTHON,
                    nodeId: 'again',
                    code: 'def run(inputs, params):\n    return inputs["f"]',
                    references: { f: forecastUuid },
                },
            ],
            submissions: [{ nodeId: 'again', queryUuid: chartUuid }],
            earlierPipelines: [earlierPipeline],
        });

        expect(pipeline.queries.at(-1)).toEqual(
            expect.objectContaining({
                nodeId: 'again',
                references: { f: 'forecast_22222222' },
            }),
        );
    });
});
