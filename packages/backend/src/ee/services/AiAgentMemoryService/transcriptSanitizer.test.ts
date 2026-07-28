import { renderMemoryBlock } from '../ai/utils/memoryBlock';
import { sanitizeThread, type TranscriptThread } from './transcriptSanitizer';

const UUID = '3675b69e-8324-4110-bdca-059031aa8da3';

const expectAccurateTruncation = (
    output: string,
    input: string,
    maxChars: number,
) => {
    const marker = /\n\[… (\d+) chars omitted …\]\n/.exec(output);
    expect(output.length).toBeLessThanOrEqual(maxChars);
    expect(marker).not.toBeNull();
    expect(Number(marker?.[1])).toBe(
        input.length - (output.length - (marker?.[0].length ?? 0)),
    );
};

const thread = (
    result: string | null,
    name = 'findFields',
): TranscriptThread => ({
    threadUuid: UUID,
    projectUuid: UUID,
    title: null,
    createdFrom: 'web_app',
    turns: [
        {
            promptUuid: UUID,
            createdAt: new Date(),
            userText: `Use project ${UUID}<ld-mem-cite id="user" />`,
            assistantText: `Done <ld-mem-cite id="old"></ld-mem-cite> for ${UUID}`,
            errorMessage: null,
            respondedAt: new Date(),
            interrupted: false,
            feedback: null,
            tools: [
                {
                    toolCallId: UUID,
                    name,
                    args: {
                        projectUuid: UUID,
                        nested: {
                            [UUID]: `value ${UUID}<ld-mem-cite id="args"></ld-mem-cite>`,
                        },
                    },
                    result,
                    resultIsError: false,
                    source: 'lightdash',
                },
            ],
        },
    ],
});

describe('sanitizeThread', () => {
    it('keeps evidence while stripping identifiers, citations, and empty observations', async () => {
        const sanitized = await sanitizeThread(
            thread(`result for ${UUID}<ld-mem-cite id="result" />`),
        );
        const serialized = JSON.stringify(sanitized);

        expect(serialized).not.toContain(UUID);
        expect(serialized).not.toContain('ld-mem-cite');
        expect(sanitized).toEqual({
            createdFrom: 'web_app',
            turns: [
                {
                    index: 1,
                    user: 'Use project [uuid]',
                    assistant: 'Done  for [uuid]',
                    tools: [
                        {
                            name: 'findFields',
                            args: {
                                projectUuid: '[uuid]',
                                nested: { '[uuid]': 'value [uuid]' },
                            },
                            result: 'result for [uuid]',
                        },
                    ],
                },
            ],
        });
    });

    it.each([
        {
            name: 'truncate',
            toolName: 'listProjects',
            result: 'a'.repeat(700),
            assertion: (value: string) =>
                expectAccurateTruncation(value, 'a'.repeat(700), 500),
        },
        {
            name: 'shape',
            toolName: 'runContentQuery',
            result: 'Query UUID: ignored\n```csv\nName,Count\nA,1\nB,2\nC,3\nD,4\n```',
            assertion: (value: string) =>
                expect(JSON.parse(value)).toEqual({
                    columns: ['Name', 'Count'],
                    rowCount: 4,
                    sampleRows: [
                        { Name: 'A', Count: '1' },
                        { Name: 'B', Count: '2' },
                        { Name: 'C', Count: '3' },
                    ],
                }),
        },
        {
            name: 'strip',
            toolName: 'loadProjectContext',
            result: `- id: arr; source: context; kind: context; content: Authority excerpt\n- id: revenue; kind: definition; content: Revenue definition\n${renderMemoryBlock(
                [
                    {
                        slug: 'memory',
                        content: 'Self-reinforcing memory body',
                        scope: 'user',
                        objects: [],
                        ageDays: 1,
                    },
                ],
            )}`,
            assertion: (value: string) => {
                expect(value).toContain('Authority excerpt');
                expect(value).toContain('source: context (authority excerpt);');
                expect(value).toContain(
                    '- id: revenue; source: context (authority excerpt); kind: definition;',
                );
                expect(value).toContain(
                    '[… ld-memory content omitted by policy …]',
                );
                expect(value).not.toContain('Self-reinforcing memory body');
            },
        },
    ])(
        'applies the $name result verdict',
        async ({ toolName, result, assertion }) => {
            const output = await sanitizeThread(thread(result, toolName));
            assertion(output.turns[0].tools?.[0].result ?? '');
        },
    );

    it('marks withheld results and removes mechanical calls', async () => {
        const input = thread('skill body', 'loadSkill');
        input.turns[0].tools.push({
            toolCallId: 'mechanical',
            name: 'generateHashes',
            args: {},
            result: 'hashes',
            resultIsError: false,
            source: 'lightdash',
        });

        expect((await sanitizeThread(input)).turns[0].tools).toEqual([
            expect.objectContaining({
                name: 'loadSkill',
                result_omitted: 'harness instructions',
            }),
        ]);
    });

    it('keeps full query errors instead of shaping them', async () => {
        const result =
            'Error running content query.\n```csv\nerror,detail\nwarehouse,Exact failure\n```';
        const input = thread(result, 'runContentQuery');
        input.turns[0].tools[0].resultIsError = true;

        expect((await sanitizeThread(input)).turns[0].tools?.[0].result).toBe(
            result,
        );
    });

    it('shapes successful query rows even when a column is named error', async () => {
        const result = '```csv\nerror,Count\nnone,1\n```';
        const shaped = (await sanitizeThread(thread(result, 'runContentQuery')))
            .turns[0].tools?.[0].result;

        expect(JSON.parse(shaped ?? '')).toMatchObject({
            columns: ['error', 'Count'],
            rowCount: 1,
        });
    });

    it('marks malformed query rows instead of inventing a shape', async () => {
        const result = '```csv\nName,Count\n"unterminated,1\n```';
        const shaped = (await sanitizeThread(thread(result, 'runContentQuery')))
            .turns[0].tools?.[0].result;

        expect(shaped).toBe('[query rows omitted: malformed CSV]');
        expect(shaped).not.toContain('unterminated');
    });

    it('fails closed when successful query output cannot be shaped', async () => {
        const result = 'Sensitive row output in an unsupported format';
        const shaped = (await sanitizeThread(thread(result, 'runContentQuery')))
            .turns[0].tools?.[0].result;

        expect(shaped).toBe('[result omitted: unsupported shape format]');
        expect(shaped).not.toContain('Sensitive row output');
    });

    it('represents successful queries that return no row payload', async () => {
        const noResults = await sanitizeThread(
            thread('No results were returned for your query.', 'runQuery'),
        );
        const success = await sanitizeThread(thread('Success', 'runQuery'));

        expect(JSON.parse(noResults.turns[0].tools?.[0].result ?? '')).toEqual({
            columns: [],
            rowCount: 0,
            sampleRows: [],
        });
        expect(success.turns[0].tools?.[0].result).toBe(
            '[query completed without row data]',
        );
    });

    it('omits oversized shaped output', async () => {
        const result = JSON.stringify({ value: 'x'.repeat(12_000) });
        const shaped = (await sanitizeThread(thread(result, 'runContentQuery')))
            .turns[0].tools?.[0].result;

        expect(shaped).toBe('[shaped result omitted: exceeds safe size]');
        expect(shaped).not.toContain('x'.repeat(100));
    });

    it('uses a declared query total instead of the preview row count', async () => {
        const result =
            '10,000 rows. Columns: Name, Count.\n(Showing first 4 of 10,000 rows.)\n```csv\nName,Count\nA,1\nB,2\nC,3\nD,4\n```';
        const shaped = (await sanitizeThread(thread(result, 'runSql'))).turns[0]
            .tools?.[0].result;

        expect(JSON.parse(shaped ?? '')).toMatchObject({
            rowCount: 10_000,
            sampleRows: [
                { Name: 'A', Count: '1' },
                { Name: 'B', Count: '2' },
                { Name: 'C', Count: '3' },
            ],
        });
    });

    it('keeps visualization evidence while shaping its rows', async () => {
        const result =
            'Chart config: grouped bars\n```csv\nName,Count\n$&,1\nB,2\nC,3\nD,4\n```\nChart saved.';
        const shaped = (
            await sanitizeThread(thread(result, 'generateVisualization'))
        ).turns[0].tools?.[0].result;

        expect(shaped).toContain('Chart config: grouped bars');
        expect(shaped).toContain('Chart saved.');
        expect(shaped).toContain('"rowCount":4');
        expect(shaped).not.toContain('```csv');
        expect(shaped).not.toContain('D,4');
    });

    it('caps MCP output and emits only the MCP source label', async () => {
        const input = thread('m'.repeat(1_500), 'mcp_search');
        input.turns[0].tools[0].source = 'mcp';
        const tool = (await sanitizeThread(input)).turns[0].tools?.[0];

        expect(tool?.source).toBe('mcp');
        expectAccurateTruncation(tool?.result ?? '', 'm'.repeat(1_500), 1_000);
    });

    it('omits null results, empty tool lists, assistant text, and cleared votes', async () => {
        const input = thread(null);
        input.turns[0].assistantText = null;
        input.turns[0].respondedAt = null;
        input.turns[0].feedback = { score: 0, comment: null };
        input.turns[0].tools = [];

        expect((await sanitizeThread(input)).turns[0]).toEqual({
            index: 1,
            user: 'Use project [uuid]',
            delivery: 'uncertain',
        });
    });

    it('serializes abnormal delivery and explicit feedback', async () => {
        const input = thread('partial');
        input.turns[0].interrupted = true;
        input.turns[0].feedback = {
            score: -1,
            comment: `Wrong project ${UUID}`,
        };

        expect((await sanitizeThread(input)).turns[0]).toMatchObject({
            delivery: 'interrupted',
            feedback: { score: -1, comment: 'Wrong project [uuid]' },
        });
    });

    it('uses the bounded fallback and reports unknown Lightdash tools', async () => {
        const onUnknownTool = vi.fn();
        const output = await sanitizeThread(
            thread('x'.repeat(1_500), 'newTool'),
            { onUnknownTool },
        );

        expect(onUnknownTool).toHaveBeenCalledWith('newTool');
        expectAccurateTruncation(
            output.turns[0].tools?.[0].result ?? '',
            'x'.repeat(1_500),
            1_000,
        );
    });

    it('caps SQL argument strings without truncating other arguments', async () => {
        const input = thread('```csv\nValue\n1\n```', 'runSql');
        input.turns[0].tools[0].args = {
            sql: 's'.repeat(5_000),
            label: 'l'.repeat(5_000),
        };
        const args = (await sanitizeThread(input)).turns[0].tools?.[0].args as {
            sql: string;
            label: string;
        };

        expectAccurateTruncation(args.sql, 's'.repeat(5_000), 4_000);
        expect(args.label).toBe('l'.repeat(5_000));
    });
});
