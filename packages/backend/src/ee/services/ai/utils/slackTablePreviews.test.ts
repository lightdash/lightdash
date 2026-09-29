import { parseAiArtifactChartConfig, type AiArtifact } from '@lightdash/common';
import {
    getSlackTableBlocks,
    type SlackTableQueryResults,
} from './slackTableBlocks';
import { getSlackTablePreviews } from './slackTablePreviews';

const call = (id: string, defaultVizType: string | null = 'table') => ({
    tool_call_id: id,
    tool_name: 'generateVisualization',
    tool_args: {
        title: `Results ${id}`,
        queryConfig: { exploreName: 'orders' },
        chartConfig: defaultVizType === null ? null : { defaultVizType },
    },
});
const result = (
    id: string,
    status: 'success' | 'error' = 'success',
    artifactVersionUuid?: string,
): Parameters<typeof getSlackTablePreviews>[0]['toolResults'][number] => {
    const metadata = {
        status,
        queryUuid: `query-${id}`,
        ...(artifactVersionUuid ? { artifactVersionUuid } : {}),
    };
    return {
        toolCallId: id,
        toolType: 'built-in',
        toolName: 'generateVisualization',
        metadata,
    };
};
const setup = () => {
    const getResults = vi.fn().mockResolvedValue({
        rows: [{ month: 'September', customers: 100 }],
        fields: {},
        truncated: false,
    });
    const authorize = vi.fn().mockResolvedValue(undefined);
    const onLoadError = vi.fn();
    return {
        enableDataAccess: true,
        slackLinksOnly: false,
        toolCalls: [call('first'), call('chart', 'bar'), call('second')],
        toolResults: [result('first'), result('chart'), result('second')],
        artifacts: [],
        url: 'https://lightdash.test/threads/thread',
        getResults,
        authorize,
        onLoadError,
    };
};

const artifact = (
    versionUuid: string,
    defaultVizType: 'table' | 'bar',
): AiArtifact => {
    const chartConfig = parseAiArtifactChartConfig({
        source: 'semantic',
        config: {
            title: 'Saved presentation',
            description: 'Saved result',
            queryConfig: {
                exploreName: 'orders',
                limit: 10,
                metrics: ['orders_count'],
                dimensions: ['orders_month'],
                sorts: [],
                filters: null,
                parameters: null,
                customMetrics: null,
                tableCalculations: null,
            },
            chartConfig: {
                defaultVizType,
                xAxisDimension: 'orders_month',
                yAxisMetrics: ['orders_count'],
                groupBy: null,
                xAxisType: null,
                xAxisLabel: 'Month',
                yAxisLabel: 'Count',
                secondaryYAxisMetric: null,
                secondaryYAxisLabel: null,
                lineType: null,
                stackBars: null,
            },
        },
    });
    if (!chartConfig) throw new Error('Invalid fixture');
    return {
        artifactUuid: 'artifact',
        threadUuid: 'thread',
        artifactType: 'chart',
        savedQueryUuid: null,
        savedSqlUuid: null,
        savedDashboardUuid: null,
        createdAt: new Date(),
        versionNumber: 1,
        versionUuid,
        title: 'Saved presentation',
        description: null,
        chartConfig,
        dashboardConfig: null,
        promptUuid: 'prompt',
        versionCreatedAt: new Date(),
        verifiedByUserUuid: null,
        verifiedAt: null,
    };
};

describe('getSlackTablePreviews', () => {
    it('embeds a proposed chart that was corrected to a saved table', async () => {
        const input = setup();
        const previews = await getSlackTablePreviews({
            ...input,
            toolCalls: [call('chart', 'bar')],
            toolResults: [result('chart', 'success', 'saved-table')],
            artifacts: [artifact('saved-table', 'table')],
        });
        expect(previews).toMatchObject([
            {
                status: 'ready',
                title: 'Saved presentation',
                artifactVersionUuid: 'saved-table',
            },
        ]);
        expect(input.getResults).toHaveBeenCalledTimes(1);
    });

    it('keeps a proposed table corrected to a chart out of the inline tables', async () => {
        const input = setup();
        const previews = await getSlackTablePreviews({
            ...input,
            toolCalls: [call('first')],
            toolResults: [result('first', 'success', 'saved-chart')],
            artifacts: [artifact('saved-chart', 'bar')],
        });
        expect(previews).toEqual([]);
        expect(input.getResults).not.toHaveBeenCalled();
    });

    it('loads original successful table executions in call order without live structuredContent', async () => {
        const input = setup();
        const previews = await getSlackTablePreviews(input);
        expect(previews.map((preview) => preview.title)).toEqual([
            'Results first',
            'Results second',
        ]);
        expect(previews.map((preview) => preview.status)).toEqual([
            'ready',
            'ready',
        ]);
        expect(input.getResults.mock.calls).toEqual([
            [
                {
                    queryUuid: 'query-first',
                    exploreNames: ['orders'],
                    maxRows: 200,
                },
            ],
            [
                {
                    queryUuid: 'query-second',
                    exploreNames: ['orders'],
                    maxRows: 200,
                },
            ],
        ]);
        const blocks = getSlackTableBlocks(previews);
        expect(
            blocks.filter((block) => block.type === 'data_table'),
        ).toHaveLength(2);
        expect(blocks.some((block) => block.type === 'carousel')).toBe(false);
    });

    it.each([
        { enableDataAccess: false, slackLinksOnly: false },
        { enableDataAccess: true, slackLinksOnly: true },
    ])(
        'never fetches result rows when sharing is disabled: %j',
        async (flags) => {
            const input = { ...setup(), ...flags };
            expect(await getSlackTablePreviews(input)).toEqual([]);
            expect(input.getResults).not.toHaveBeenCalled();
            expect(input.authorize).not.toHaveBeenCalled();
        },
    );

    it('skips failed, missing and malformed executions', async () => {
        const input = setup();
        input.toolCalls = [call('failed'), call('missing'), call('malformed')];
        input.toolResults = [
            result('failed', 'error'),
            { ...result('malformed'), metadata: { status: 'success' } },
        ];
        expect(await getSlackTablePreviews(input)).toEqual([]);
        expect(input.getResults).not.toHaveBeenCalled();
    });

    it('skips external MCP metadata even if its call id matches', async () => {
        const input = setup();
        input.toolResults = [
            {
                ...result('first'),
                toolType: 'mcp',
                toolName: 'mcp_external_query',
                metadata: { status: 'success', queryUuid: 'external-query' },
            },
        ];
        expect(await getSlackTablePreviews(input)).toEqual([]);
        expect(input.getResults).not.toHaveBeenCalled();
    });

    it('treats a null chart config as a table', async () => {
        const input = setup();
        input.toolCalls = [call('first', null)];
        expect(await getSlackTablePreviews(input)).toMatchObject([
            { status: 'ready' },
        ]);
    });

    it('passes all merged source explores for authorization before reading rows', async () => {
        const input = setup();
        const primary = call('first');
        const mergedCall = {
            ...primary,
            tool_args: {
                ...primary.tool_args,
                mergeConfig: {
                    additionalSources: [
                        { queryConfig: { exploreName: 'payments' } },
                    ],
                },
            },
        };
        await getSlackTablePreviews({ ...input, toolCalls: [mergedCall] });
        expect(input.authorize).toHaveBeenCalledWith({
            queryUuid: 'query-first',
            exploreNames: ['orders', 'payments'],
        });
        expect(input.getResults).toHaveBeenCalledWith({
            queryUuid: 'query-first',
            exploreNames: ['orders', 'payments'],
            maxRows: 200,
        });
    });

    it('authorizes every merged source before using runtime rows', async () => {
        const input = setup();
        const primary = call('first');
        const runtimeResults = new Map<string, SlackTableQueryResults>([
            [
                'query-first',
                { rows: [{ customers: 42 }], fields: {}, truncated: false },
            ],
        ]);
        const getRuntimeResults = vi.spyOn(runtimeResults, 'get');
        await getSlackTablePreviews({
            ...input,
            toolCalls: [
                {
                    ...primary,
                    tool_args: {
                        ...primary.tool_args,
                        mergeConfig: {
                            additionalSources: [
                                { queryConfig: { exploreName: 'payments' } },
                            ],
                        },
                    },
                },
            ],
            runtimeResults,
        });
        expect(input.authorize).toHaveBeenCalledExactlyOnceWith({
            queryUuid: 'query-first',
            exploreNames: ['orders', 'payments'],
        });
        expect(input.authorize.mock.invocationCallOrder[0]).toBeLessThan(
            getRuntimeResults.mock.invocationCallOrder[0],
        );
        expect(input.getResults).not.toHaveBeenCalled();
    });

    it('keeps a Lightdash link when cached rows expire or access is revoked', async () => {
        const input = setup();
        input.toolCalls = [call('first')];
        input.getResults.mockRejectedValue(new Error('Unavailable'));
        const previews = await getSlackTablePreviews(input);
        const blocks = getSlackTableBlocks(previews);
        expect(input.onLoadError).toHaveBeenCalledWith('first');
        expect(previews).toEqual([
            {
                blockId: 'ai_agent_table_first',
                title: 'Results first',
                url: input.url,
                status: 'unavailable',
            },
        ]);
        expect(blocks).toMatchObject([
            {
                type: 'section',
                accessory: { url: input.url },
            },
        ]);
        expect(blocks.some((block) => block.type === 'data_table')).toBe(false);
    });

    it('uses runtime results after authorization without reading cached rows', async () => {
        const input = setup();
        const runtimeResults = new Map<string, SlackTableQueryResults>([
            [
                'query-first',
                { rows: [{ customers: 42 }], fields: {}, truncated: true },
            ],
        ]);
        const getRuntimeResults = vi.spyOn(runtimeResults, 'get');
        const previews = await getSlackTablePreviews({
            ...input,
            toolCalls: [call('first')],
            runtimeResults,
        });
        expect(previews).toMatchObject([
            {
                status: 'ready',
                queryResults: { rows: [{ customers: 42 }], fields: {} },
                truncated: true,
            },
        ]);
        expect(input.authorize).toHaveBeenCalledWith({
            queryUuid: 'query-first',
            exploreNames: ['orders'],
        });
        expect(input.authorize.mock.invocationCallOrder[0]).toBeLessThan(
            getRuntimeResults.mock.invocationCallOrder[0],
        );
        expect(input.getResults).not.toHaveBeenCalled();
    });

    it('reads cached rows only for queries absent from runtime results', async () => {
        const input = setup();
        const previews = await getSlackTablePreviews({
            ...input,
            runtimeResults: new Map<string, SlackTableQueryResults>([
                [
                    'query-first',
                    { rows: [{ customers: 42 }], fields: {}, truncated: false },
                ],
            ]),
        });
        expect(previews).toMatchObject([
            {
                status: 'ready',
                queryResults: { rows: [{ customers: 42 }] },
            },
            {
                status: 'ready',
                queryResults: {
                    rows: [{ month: 'September', customers: 100 }],
                },
            },
        ]);
        expect(input.getResults).toHaveBeenCalledExactlyOnceWith({
            queryUuid: 'query-second',
            exploreNames: ['orders'],
            maxRows: 200,
        });
        expect(input.authorize).toHaveBeenCalledTimes(2);
    });

    it('hides runtime rows when authorization has been revoked', async () => {
        const input = setup();
        input.authorize.mockRejectedValue(new Error('Access revoked'));
        const runtimeResults = new Map<string, SlackTableQueryResults>([
            [
                'query-first',
                { rows: [{ customers: 42 }], fields: {}, truncated: false },
            ],
        ]);
        const getRuntimeResults = vi.spyOn(runtimeResults, 'get');
        const previews = await getSlackTablePreviews({
            ...input,
            toolCalls: [call('first')],
            runtimeResults,
        });
        expect(previews).toEqual([
            {
                blockId: 'ai_agent_table_first',
                title: 'Results first',
                url: input.url,
                status: 'unavailable',
            },
        ]);
        expect(getRuntimeResults).not.toHaveBeenCalled();
        expect(input.getResults).not.toHaveBeenCalled();
        expect(input.onLoadError).toHaveBeenCalledWith('first');
    });

    it.each([
        { enableDataAccess: false, slackLinksOnly: false },
        { enableDataAccess: true, slackLinksOnly: true },
    ])(
        'does not access runtime rows when sharing is disabled: %j',
        async (flags) => {
            const input = setup();
            const runtimeResults = new Map<string, SlackTableQueryResults>([
                [
                    'query-first',
                    { rows: [{ customers: 42 }], fields: {}, truncated: false },
                ],
            ]);
            const getRuntimeResults = vi.spyOn(runtimeResults, 'get');
            expect(
                await getSlackTablePreviews({
                    ...input,
                    ...flags,
                    runtimeResults,
                }),
            ).toEqual([]);
            expect(getRuntimeResults).not.toHaveBeenCalled();
            expect(input.authorize).not.toHaveBeenCalled();
            expect(input.getResults).not.toHaveBeenCalled();
        },
    );

    it('does not reuse runtime rows for a failed tool execution', async () => {
        const input = setup();
        const runtimeResults = new Map<string, SlackTableQueryResults>([
            [
                'query-first',
                { rows: [{ customers: 42 }], fields: {}, truncated: false },
            ],
        ]);
        const getRuntimeResults = vi.spyOn(runtimeResults, 'get');
        expect(
            await getSlackTablePreviews({
                ...input,
                toolCalls: [call('first')],
                toolResults: [result('first', 'error')],
                runtimeResults,
            }),
        ).toEqual([]);
        expect(getRuntimeResults).not.toHaveBeenCalled();
        expect(input.authorize).not.toHaveBeenCalled();
        expect(input.getResults).not.toHaveBeenCalled();
    });

    it('retains cache truncation for the preview disclosure', async () => {
        const input = setup();
        input.getResults.mockResolvedValue({
            rows: [{ value: 1 }],
            fields: {},
            truncated: true,
        });
        const previews = await getSlackTablePreviews(input);
        expect(
            previews.every(
                (preview) => preview.status === 'ready' && preview.truncated,
            ),
        ).toBe(true);
        expect(JSON.stringify(getSlackTableBlocks(previews))).toContain(
            'Showing first 1 row; more rows omitted.',
        );
    });
});
