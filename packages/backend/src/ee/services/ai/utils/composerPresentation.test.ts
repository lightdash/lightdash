import {
    QuerySourceType,
    type ThreadComposerQueryNode,
    type ToolComposerQueriesSuccessMetadata,
} from '@lightdash/common';
import {
    buildComposerPresentations,
    resolveSlackComposerPresentations,
    type TurnToolResult,
} from './composerPresentation';

const node = (
    nodeId: string,
    references: string[] = [],
    label: { title?: string; description?: string } = { title: nodeId },
): ThreadComposerQueryNode => ({
    sourceType: QuerySourceType.DUCKDB,
    nodeId,
    ...label,
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

const resolveSlack = (response: string, toolResults: TurnToolResult[]) =>
    resolveSlackComposerPresentations({
        response,
        promptUuid: 'prompt-uuid',
        toolResults,
    });

const slackPresentedNodes = (response: string, toolResults: TurnToolResult[]) =>
    resolveSlack(response, toolResults).results.map(
        (metadata) => metadata.terminalNodeId,
    );

describe('resolveComposerPresentations in Slack', () => {
    it('resolves a table marker to the composer result of this turn', () => {
        const metadata = success('revenue', { title: 'Revenue' });
        expect(
            resolveSlack(
                'Revenue grew.\n<slack-table queryUuid="query-revenue"/>',
                [result(metadata)],
            ),
        ).toEqual({
            results: [metadata],
            response: 'Revenue grew.',
        });
    });

    it('presents several results in answer order and collapses duplicates', () => {
        expect(
            slackPresentedNodes(
                '<slack-table queryUuid="query-b"/>\n<slack-table queryUuid="query-a"/>\n<slack-table queryUuid="query-b"/>',
                [result(success('a')), result(success('b'))],
            ),
        ).toEqual(['b', 'a']);
    });

    it('presents the latest call when two calls share an execution', () => {
        const { results } = resolveSlack(
            '<slack-table queryUuid="query-revenue"/>',
            [
                result(success('revenue', { title: 'Earlier' })),
                result(success('revenue', { title: 'Later' })),
            ],
        );
        expect(results.map((metadata) => metadata.title)).toEqual(['Later']);
    });

    it.each([
        [
            'a runQuery execution',
            [result(success('revenue'), { toolName: 'runQuery' })],
        ],
        ['an unknown execution', [result(success('other'))]],
        [
            'a failed call',
            [result({ status: 'error' }), result({ status: 'rejected' })],
        ],
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
        ).toEqual({ results: [], response: 'Done.' });
    });
});

describe('buildComposerPresentations', () => {
    // Thread: orders <- enriched <- revenue; unrelated is never read.
    const threadNodes = [
        node('orders'),
        node('unrelated'),
        node('enriched', ['orders']),
        node('revenue', ['enriched'], {
            title: 'Monthly revenue',
            description: 'Revenue by month',
        }),
    ];

    const build = (terminalNodeIds: string[]) =>
        buildComposerPresentations({
            results: terminalNodeIds.map((id) =>
                success(id, {
                    title: 'Monthly revenue',
                    description: 'Revenue by month',
                }),
            ),
            threadNodes,
        });

    it('snapshots a presented node and everything it reads from the thread, as a table', () => {
        expect(build(['revenue'])).toEqual([
            {
                artifactType: 'chart',
                title: 'Monthly revenue',
                description: 'Revenue by month',
                vizConfig: {
                    source: 'composer',
                    schemaVersion: 1,
                    queries: [
                        node('orders'),
                        node('enriched', ['orders']),
                        threadNodes[3],
                    ],
                    terminalNodeId: 'revenue',
                    vizConfig: null,
                },
            },
        ]);
    });

    it('titles a Slack version from its tool call', () => {
        expect(
            buildComposerPresentations({
                results: [
                    success('revenue', {
                        title: 'Revenue table',
                        description: 'From the call',
                    }),
                    success('missing'),
                ],
                threadNodes,
            }).map(({ title, description, vizConfig }) => ({
                title,
                description,
                terminalNodeId: vizConfig.terminalNodeId,
            })),
        ).toEqual([
            {
                title: 'Revenue table',
                description: 'From the call',
                terminalNodeId: 'revenue',
            },
        ]);
    });
});
