import { sanitizeThread, type TranscriptThread } from './transcriptSanitizer';

const UUID = '3675b69e-8324-4110-bdca-059031aa8da3';

const thread = (result: string): TranscriptThread => ({
    threadUuid: UUID,
    projectUuid: UUID,
    title: null,
    createdFrom: 'web_app',
    turns: [
        {
            promptUuid: UUID,
            createdAt: new Date(),
            userText: `Use project ${UUID}<ld-mem-cite id="user" />`,
            assistantText: `Done <ld-mem-cite id="old"></ld-mem-cite> and <ld-mem-cite id="self" /> for ${UUID}`,
            errorMessage: null,
            respondedAt: new Date(),
            interrupted: false,
            tools: [
                {
                    toolCallId: UUID,
                    name: 'findFields',
                    args: {
                        projectUuid: UUID,
                        nested: {
                            [UUID]: `value ${UUID}<ld-mem-cite id="args"></ld-mem-cite>`,
                        },
                    },
                    result,
                    source: 'lightdash',
                },
            ],
        },
    ],
});

describe('sanitizeThread', () => {
    it('keeps semantic content and source labels while stripping identifiers and citations', () => {
        const sanitized = sanitizeThread(
            thread(`result for ${UUID}<ld-mem-cite id="result" />`),
        );
        const serialized = JSON.stringify(sanitized);

        expect(serialized).not.toContain(UUID);
        expect(serialized).not.toContain(
            '00000000-0000-0000-0000-000000000000',
        );
        expect(serialized).not.toContain('ld-mem-cite');
        expect(sanitized).toMatchObject({
            createdFrom: 'web_app',
            turns: [
                {
                    status: 'success',
                    user: 'Use project [uuid]',
                    assistant: 'Done  and  for [uuid]',
                    tools: [
                        {
                            source: 'lightdash',
                            name: 'findFields',
                            args: {
                                projectUuid: '[uuid]',
                                nested: { '[uuid]': 'value [uuid]' },
                            },
                            result: {
                                content: 'result for [uuid]',
                                truncated: false,
                                omittedChars: 0,
                            },
                        },
                    ],
                },
            ],
        });
    });

    it('bounds long tool results with measurable omission', () => {
        const sanitized = sanitizeThread(thread('a'.repeat(7_000)));
        const { result } = sanitized.turns[0].tools[0];

        expect(result).toMatchObject({ truncated: true, omittedChars: 1_000 });
        expect(result?.content).toHaveLength(6_001);
    });

    it('marks failed and incomplete turns without inventing assistant text', () => {
        const failed = thread('error');
        failed.turns[0] = {
            ...failed.turns[0],
            assistantText: null,
            errorMessage: `warehouse ${UUID}<ld-mem-cite id="error" /> failed`,
            respondedAt: null,
        };

        expect(sanitizeThread(failed).turns[0]).toMatchObject({
            status: 'error',
            assistant: '',
            error: 'warehouse [uuid] failed',
        });
    });

    it('marks interrupted responses as interrupted', () => {
        const interrupted = thread('partial');
        interrupted.turns[0].interrupted = true;

        expect(sanitizeThread(interrupted).turns[0]).toMatchObject({
            status: 'interrupted',
            assistant: 'Done  and  for [uuid]',
        });
    });

    it('strips UUIDs regardless of UUID version', () => {
        const input = thread('00000000-0000-0000-0000-000000000000');
        expect(input.turns[0].tools[0].result).toContain('00000000');
        expect(JSON.stringify(sanitizeThread(input))).not.toContain(
            '00000000-0000-0000-0000-000000000000',
        );
    });
});
