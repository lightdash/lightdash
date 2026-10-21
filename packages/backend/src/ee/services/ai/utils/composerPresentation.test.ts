import {
    QuerySourceType,
    type ThreadComposerQueryNode,
    type ToolComposerQueriesSuccessMetadata,
} from '@lightdash/common';
import {
    buildComposerPresentations,
    resolveComposerPresentations,
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

const resolve = (response: string) =>
    resolveComposerPresentations({ channel: 'web', response });

const resolveSlack = (response: string, toolResults: TurnToolResult[]) =>
    resolveComposerPresentations({
        channel: 'slack',
        response,
        promptUuid: 'prompt-uuid',
        toolResults,
    });

const markedNodes = (response: string) => {
    const { presented } = resolve(response);
    return presented.channel === 'web' ? presented.nodeIds : null;
};

const slackPresentedNodes = (
    response: string,
    toolResults: TurnToolResult[],
) => {
    const { presented } = resolveSlack(response, toolResults);
    return presented.channel === 'slack'
        ? presented.results.map((metadata) => metadata.terminalNodeId)
        : null;
};

describe('resolveComposerPresentations on web', () => {
    it('presents nothing when the answer has no marker', () => {
        const response = 'Revenue grew 10%.';
        expect(resolve(response)).toEqual({
            presented: { channel: 'web', nodeIds: [] },
            response,
        });
    });

    it('selects marked nodes in answer order and collapses duplicates', () => {
        expect(
            markedNodes(
                'Revenue grew.\n<show node="b" />\nThen <show node = "a">\n<show node="b"/>',
            ),
        ).toEqual(['b', 'a']);
    });

    it('ignores markers quoted in code fences', () => {
        expect(
            markedNodes(
                '```\n<show node="revenue"/>\n```\n~~~\n<show node="revenue"/>\n~~~',
            ),
        ).toEqual([]);
    });

    it('strips markers leaving clean prose', () => {
        expect(
            resolve(
                'Revenue grew <show node="revenue"/> as shown.\n\n<show node="a"/>\n\n\nNext steps.',
            ).response,
        ).toBe('Revenue grew as shown.\n\nNext steps.');
    });

    it('leaves prose intact around a malformed marker', () => {
        const response =
            'Revenue <show node="revenue"\ngrew 10%.\n\nSee > for details. <show node="x" and more';
        expect(resolve(response).response).toBe(response);
    });

    it('keeps markers quoted in code fences', () => {
        const response =
            'Write this:\n```\n<show node="revenue"/>\n\n\n\nend\n```\nDone <show node="revenue"/>';
        expect(resolve(response).response).toBe(
            'Write this:\n```\n<show node="revenue"/>\n\n\n\nend\n```\nDone',
        );
    });

    it('leaves Slack markers alone', () => {
        expect(
            resolve('Done <slack-table queryUuid="query-revenue"/>'),
        ).toEqual({
            presented: { channel: 'web', nodeIds: [] },
            response: 'Done <slack-table queryUuid="query-revenue"/>',
        });
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
        ).toEqual({
            presented: { channel: 'slack', results: [metadata] },
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
        const { presented } = resolveSlack(
            '<slack-table queryUuid="query-revenue"/>',
            [
                result(success('revenue', { title: 'Earlier' })),
                result(success('revenue', { title: 'Later' })),
            ],
        );
        expect(
            presented.channel === 'slack'
                ? presented.results.map((metadata) => metadata.title)
                : null,
        ).toEqual(['Later']);
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
        ).toEqual({
            presented: { channel: 'slack', results: [] },
            response: 'Done.',
        });
    });

    it('leaves web markers alone', () => {
        expect(
            resolveSlack('Done <show node="revenue"/>', [
                result(success('revenue')),
            ]),
        ).toEqual({
            presented: { channel: 'slack', results: [] },
            response: 'Done <show node="revenue"/>',
        });
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

    const buildWeb = (nodeIds: string[]) =>
        buildComposerPresentations({
            presented: { channel: 'web', nodeIds },
            threadNodes,
        });

    it('snapshots a marked node and everything it reads from the thread, as a table', () => {
        expect(buildWeb(['revenue'])).toEqual([
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

    it('presents any registered node, whichever message ran it', () => {
        expect(
            buildWeb(['enriched', 'orders']).map(
                (version) => version.vizConfig.terminalNodeId,
            ),
        ).toEqual(['enriched', 'orders']);
    });

    it('titles a web version from its node, falling back to the node id', () => {
        const untitled = node('untitled', [], {});
        expect(
            buildComposerPresentations({
                presented: { channel: 'web', nodeIds: ['untitled'] },
                threadNodes: [untitled],
            }).map(({ title, description }) => ({ title, description })),
        ).toEqual([{ title: 'untitled', description: undefined }]);
    });

    it('ignores an unknown node id', () => {
        expect(buildWeb(['missing', 'revenue']).map((v) => v.title)).toEqual([
            'Monthly revenue',
        ]);
    });

    it('titles a Slack version from its tool call', () => {
        expect(
            buildComposerPresentations({
                presented: {
                    channel: 'slack',
                    results: [
                        success('revenue', {
                            title: 'Revenue table',
                            description: 'From the call',
                        }),
                        success('missing'),
                    ],
                },
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
