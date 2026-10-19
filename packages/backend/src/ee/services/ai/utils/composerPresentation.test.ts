import {
    ChartKind,
    QuerySourceType,
    VizIndexType,
    type SourceQuery,
    type ToolComposerQueriesSuccessMetadata,
} from '@lightdash/common';
import {
    resolveComposerPresentations,
    type TurnToolResult,
} from './composerPresentation';

const node = (nodeId: string, references: string[] = []): SourceQuery => ({
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
    snapshot: [node('base'), node(terminalNodeId, ['base'])],
    vizConfig: null,
    title: `Title ${terminalNodeId}`,
    description: null,
    artifactVersionUuid: null,
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
        response,
        promptUuid: 'prompt-uuid',
        toolResults,
    });

const presentedNodes = (response: string, toolResults: TurnToolResult[]) =>
    resolve(response, toolResults).presentations.map(
        (presentation) => presentation.vizConfig.terminalNodeId,
    );

describe('resolveComposerPresentations', () => {
    it('presents nothing when the answer has no marker', () => {
        const response = 'Revenue grew 10%.';
        expect(resolve(response, [result(success('revenue'))])).toEqual({
            presentations: [],
            response,
        });
    });

    it('turns a marker on a terminal node into a composer artifact version', () => {
        const vizConfig: ToolComposerQueriesSuccessMetadata['vizConfig'] = {
            type: ChartKind.LINE,
            metadata: { version: 1 },
            fieldConfig: {
                x: { reference: 'month', type: VizIndexType.CATEGORY },
                y: [],
                groupBy: [],
            },
            display: undefined,
        };
        const metadata = success('revenue', {
            title: 'Revenue',
            description: 'Monthly revenue',
            vizConfig,
        });

        expect(
            resolve('Revenue grew.\n<show node="revenue"/>', [
                result(metadata),
            ]),
        ).toEqual({
            presentations: [
                {
                    artifactType: 'chart',
                    title: 'Revenue',
                    description: 'Monthly revenue',
                    vizConfig: {
                        source: 'composer',
                        schemaVersion: 1,
                        queries: metadata.snapshot,
                        terminalNodeId: 'revenue',
                        vizConfig,
                    },
                },
            ],
            response: 'Revenue grew.',
        });
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
            { presentations: [], response: 'Done.' },
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
            ]).presentations.map((presentation) => presentation.title),
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
