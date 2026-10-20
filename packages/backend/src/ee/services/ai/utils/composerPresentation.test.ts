import {
    ChartKind,
    DimensionType,
    QuerySourceType,
    VizIndexType,
    type AllVizChartConfig,
    type ThreadComposerQueryNode,
    type ToolComposerQueriesSuccessMetadata,
} from '@lightdash/common';
import type { PlanComposerViz } from '../decisions/vizPlanner';
import {
    buildComposerPresentations,
    resolveComposerPresentations,
    type ComposerExecutionResult,
    type TurnToolResult,
} from './composerPresentation';

const node = (
    nodeId: string,
    references: string[] = [],
): ThreadComposerQueryNode => ({
    sourceType: QuerySourceType.DUCKDB,
    nodeId,
    title: nodeId,
    sql: 'SELECT 1',
    references,
    limit: 500,
});

const success = (
    terminalNodeId: string,
    overrides: Partial<ToolComposerQueriesSuccessMetadata> = {},
): ToolComposerQueriesSuccessMetadata => ({
    status: 'success',
    queryUuid: `query-${terminalNodeId}`,
    terminalNodeId,
    title: `Title ${terminalNodeId}`,
    description: null,
    ...overrides,
});

const result = (
    metadata: unknown,
    overrides: Partial<TurnToolResult> = {},
): TurnToolResult => ({
    promptUuid: 'prompt-uuid',
    toolName: 'runComposerQueries',
    metadata,
    ...overrides,
});

const resolve = (response: string, toolResults: TurnToolResult[]) =>
    resolveComposerPresentations({
        channel: 'web',
        response,
        promptUuid: 'prompt-uuid',
        toolResults,
    });

const resolveSlack = (response: string, toolResults: TurnToolResult[]) =>
    resolveComposerPresentations({
        channel: 'slack',
        response,
        promptUuid: 'prompt-uuid',
        toolResults,
    });

const slackPresentedNodes = (response: string, toolResults: TurnToolResult[]) =>
    resolveSlack(response, toolResults).presented.map(
        (metadata) => metadata.terminalNodeId,
    );

const presentedNodes = (response: string, toolResults: TurnToolResult[]) =>
    resolve(response, toolResults).presented.map(
        (metadata) => metadata.terminalNodeId,
    );

describe('resolveComposerPresentations', () => {
    it('presents nothing when the answer has no marker', () => {
        const response = 'Revenue grew 10%.';
        expect(resolve(response, [result(success('revenue'))])).toEqual({
            presented: [],
            response,
        });
    });

    it('resolves a marker on a terminal node to its tool result', () => {
        const metadata = success('revenue', { title: 'Revenue' });

        expect(
            resolve('Revenue grew.\n<show node="revenue"/>', [
                result(metadata),
            ]),
        ).toEqual({ presented: [metadata], response: 'Revenue grew.' });
    });

    it('presents several nodes in answer order and collapses duplicates', () => {
        const toolResults = [result(success('a')), result(success('b'))];
        expect(
            presentedNodes(
                '<show node="b" />\nThen <show node = "a">\n<show node="b"/>',
                toolResults,
            ),
        ).toEqual(['b', 'a']);
    });

    it.each([
        ['a non-terminal node', 'base', [result(success('revenue'))]],
        [
            'a failed call',
            'revenue',
            [result({ status: 'error' }), result({ status: 'rejected' })],
        ],
        ['an unknown node', 'missing', [result(success('revenue'))]],
        [
            "an earlier turn's node",
            'revenue',
            [result(success('revenue'), { promptUuid: 'earlier-prompt' })],
        ],
        [
            'another tool',
            'revenue',
            [result(success('revenue'), { toolName: 'runQuery' })],
        ],
    ])('ignores a marker naming %s', (_, nodeId, toolResults) => {
        expect(resolve(`Done.\n<show node="${nodeId}"/>`, toolResults)).toEqual(
            { presented: [], response: 'Done.' },
        );
    });

    it('ignores markers quoted in code fences', () => {
        expect(
            presentedNodes(
                '```\n<show node="revenue"/>\n```\n~~~\n<show node="revenue"/>\n~~~',
                [result(success('revenue'))],
            ),
        ).toEqual([]);
    });

    it('presents the latest call when two calls end at the same node', () => {
        const earlier = success('revenue', { title: 'Earlier' });
        const later = success('revenue', { title: 'Later' });
        expect(
            resolve('<show node="revenue"/>', [
                result(earlier),
                result(later),
            ]).presented.map((metadata) => metadata.title),
        ).toEqual(['Later']);
    });

    it('strips markers leaving clean prose', () => {
        expect(
            resolve(
                'Revenue grew <show node="revenue"/> as shown.\n\n<show node="a"/>\n\n\nNext steps.',
                [],
            ).response,
        ).toBe('Revenue grew as shown.\n\nNext steps.');
    });

    it('leaves prose intact around a malformed marker', () => {
        const response =
            'Revenue <show node="revenue"\ngrew 10%.\n\nSee > for details. <show node="x" and more';
        expect(resolve(response, []).response).toBe(response);
    });

    it('keeps markers quoted in code fences', () => {
        const response =
            'Write this:\n```\n<show node="revenue"/>\n\n\n\nend\n```\nDone <show node="revenue"/>';
        expect(resolve(response, []).response).toBe(
            'Write this:\n```\n<show node="revenue"/>\n\n\n\nend\n```\nDone',
        );
    });
});

const lineViz: AllVizChartConfig = {
    type: ChartKind.LINE,
    metadata: { version: 1 },
    fieldConfig: {
        x: { reference: 'month', type: VizIndexType.CATEGORY },
        y: [],
        groupBy: [],
    },
    display: undefined,
};

const executionResult = (queryUuid: string): ComposerExecutionResult => ({
    columns: {
        month: { reference: 'month', type: DimensionType.STRING },
    },
    rows: [{ month: queryUuid }],
    rowCount: 1,
});

describe('buildComposerPresentations', () => {
    // Thread: orders <- enriched <- revenue; unrelated is never read.
    const threadNodes = [
        node('orders'),
        node('unrelated'),
        node('enriched', ['orders']),
        node('revenue', ['enriched']),
    ];

    const build = (
        presented: ToolComposerQueriesSuccessMetadata[],
        planViz: PlanComposerViz | null,
        previousVizConfig: AllVizChartConfig | null = null,
    ) =>
        buildComposerPresentations({
            presented,
            threadNodes,
            planViz,
            getExecutionResult: async (queryUuid) => executionResult(queryUuid),
            previousVizConfig,
            enableDataAccess: true,
        });

    it('snapshots the presented node and everything it reads from the thread', async () => {
        const [presentation] = await build(
            [success('revenue', { description: 'Monthly revenue' })],
            null,
        );
        expect(presentation).toEqual({
            artifactType: 'chart',
            title: 'Title revenue',
            description: 'Monthly revenue',
            vizConfig: {
                source: 'composer',
                schemaVersion: 1,
                queries: [
                    node('orders'),
                    node('enriched', ['orders']),
                    node('revenue', ['enriched']),
                ],
                terminalNodeId: 'revenue',
                vizConfig: null,
            },
        });
    });

    it('plans the viz from the presented execution result', async () => {
        const planned: Parameters<PlanComposerViz>[0][] = [];
        const planViz: PlanComposerViz = async (args) => {
            planned.push(args);
            return lineViz;
        };

        const [presentation] = await build([success('revenue')], planViz);

        expect(planned).toEqual([
            expect.objectContaining({
                ...executionResult('query-revenue'),
                terminalNode: { title: 'revenue', description: null },
                previousVizConfig: null,
            }),
        ]);
        expect(presentation.vizConfig.vizConfig).toEqual(lineViz);
    });

    it('plans each presentation from the one before it', async () => {
        const previousVizConfigs: (AllVizChartConfig | null)[] = [];
        const planViz: PlanComposerViz = async (args) => {
            previousVizConfigs.push(args.previousVizConfig);
            return args.previousVizConfig ? null : lineViz;
        };

        const presentations = await build(
            [success('enriched'), success('revenue')],
            planViz,
        );

        expect(previousVizConfigs).toEqual([null, lineViz]);
        expect(
            presentations.map(
                (presentation) => presentation.vizConfig.vizConfig,
            ),
        ).toEqual([lineViz, null]);
    });

    it('starts from the thread viz config', async () => {
        const previousVizConfigs: (AllVizChartConfig | null)[] = [];
        await build(
            [success('revenue')],
            async (args) => {
                previousVizConfigs.push(args.previousVizConfig);
                return null;
            },
            lineViz,
        );
        expect(previousVizConfigs).toEqual([lineViz]);
    });

    it('saves without a viz when there is no planner (Slack)', async () => {
        const [presentation] = await build([success('revenue')], null);
        expect(presentation.vizConfig.vizConfig).toBeNull();
    });

    it('still presents when the execution result is unavailable', async () => {
        const presentations = await buildComposerPresentations({
            presented: [success('revenue')],
            threadNodes,
            planViz: async () => lineViz,
            getExecutionResult: async () => {
                throw new Error('Results expired');
            },
            previousVizConfig: null,
            enableDataAccess: true,
        });
        expect(
            presentations.map(
                (presentation) => presentation.vizConfig.vizConfig,
            ),
        ).toEqual([null]);
    });

    it('skips a node missing from the thread', async () => {
        expect(await build([success('missing')], null)).toEqual([]);
    });
});

describe('resolveComposerPresentations in Slack', () => {
    it('resolves a table marker to the composer result of this turn', () => {
        const metadata = success('revenue', { title: 'Revenue' });
        expect(
            resolveSlack(
                'Revenue grew.\n<slack-table queryUuid="query-revenue"/>',
                [result(metadata)],
            ),
        ).toEqual({ presented: [metadata], response: 'Revenue grew.' });
    });

    it('presents several results in answer order and collapses duplicates', () => {
        expect(
            slackPresentedNodes(
                '<slack-table queryUuid="query-b"/>\n<slack-table queryUuid="query-a"/>\n<slack-table queryUuid="query-b"/>',
                [result(success('a')), result(success('b'))],
            ),
        ).toEqual(['b', 'a']);
    });

    it.each([
        [
            'a runQuery execution',
            [result(success('revenue'), { toolName: 'runQuery' })],
        ],
        ['an unknown execution', [result(success('other'))]],
        [
            "an earlier turn's execution",
            [result(success('revenue'), { promptUuid: 'earlier-prompt' })],
        ],
    ])('ignores a table marker naming %s', (_, toolResults) => {
        expect(
            resolveSlack(
                'Done.\n<slack-table queryUuid="query-revenue"/>',
                toolResults,
            ),
        ).toEqual({ presented: [], response: 'Done.' });
    });

    it('leaves web markers alone', () => {
        expect(
            resolveSlack('Done <show node="revenue"/>', [
                result(success('revenue')),
            ]),
        ).toEqual({
            presented: [],
            response: 'Done <show node="revenue"/>',
        });
    });
});

describe('resolveComposerPresentations on web', () => {
    it('leaves Slack markers alone', () => {
        expect(
            resolve('Done <slack-table queryUuid="query-revenue"/>', [
                result(success('revenue')),
            ]),
        ).toEqual({
            presented: [],
            response: 'Done <slack-table queryUuid="query-revenue"/>',
        });
    });
});
