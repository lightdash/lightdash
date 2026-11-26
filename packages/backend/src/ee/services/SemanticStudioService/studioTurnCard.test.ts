import { getTurnFastResponse } from '../ai/agents/agentV2';
import {
    getStudioCardResponse,
    studioTurnCard,
    withStudioCardReply,
} from './studioTurnCard';

describe('a Studio turn ending on its card', () => {
    const proposed = (draftChangeUuid: string | null) => [
        {
            toolCalls: [],
            toolResults: [
                {
                    toolCallId: 'call-1',
                    toolName: 'proposeSemanticLayerChange',
                    output: {
                        result: 'orders: ready',
                        metadata: {
                            status: 'success',
                            models: [
                                {
                                    model: 'orders',
                                    status: draftChangeUuid
                                        ? 'ready'
                                        : 'failed',
                                    changes: [],
                                    refusals: [],
                                    error: null,
                                },
                            ],
                            diffs: [],
                            draftChangeUuid,
                        },
                        structuredContent: { models: [] },
                    },
                },
            ],
        },
    ];

    it('keeps what the agent wrote', () => {
        expect(withStudioCardReply('Done.', proposed('draft-1'))).toBe('Done.');
    });

    it('ends the turn on the card once a change joined the draft cleanly, and not while a model failed', () => {
        expect(getStudioCardResponse(proposed('draft-1'))).toBe(
            'Changed orders in the draft.',
        );
        expect(getStudioCardResponse(proposed(null))).toBeNull();
        expect(getStudioCardResponse([])).toBeNull();
    });

    it("ends the turn on a Studio save, and leaves the main chat's save alone", () => {
        const saved = (input: object) => [
            {
                toolCalls: [
                    { toolCallId: 'call-1', toolName: 'editDbtProject', input },
                ],
                toolResults: [
                    {
                        toolCallId: 'call-1',
                        toolName: 'editDbtProject',
                        output: {
                            result: 'Started',
                            metadata: { status: 'pending' },
                        },
                    },
                ],
            },
        ];
        const steps = saved({ prompt: 'x', script: null });
        expect(
            getTurnFastResponse(false, null, steps, '', studioTurnCard),
        ).toBe('Saved the change to the draft.');
        expect(getTurnFastResponse(false, null, steps, '', null)).toBeNull();
    });

    it('keeps the turn going after a change while the request has steps left', () => {
        const [step] = proposed('draft-1');
        const [result] = step.toolResults;
        const thenQuery = [
            {
                ...step,
                toolResults: [
                    {
                        ...result,
                        output: {
                            ...result.output,
                            metadata: {
                                ...result.output.metadata,
                                needsFollowUp: true,
                            },
                        },
                    },
                ],
            },
        ];
        expect(getStudioCardResponse(thenQuery)).toBeNull();
        const saveThenQuery = [
            {
                toolCalls: [
                    {
                        toolCallId: 'call-1',
                        toolName: 'write',
                        input: { prompt: 'x', script: 'x', moreToDo: true },
                    },
                ],
                toolResults: [
                    {
                        toolCallId: 'call-1',
                        toolName: 'write',
                        output: {
                            result: 'Started',
                            metadata: { status: 'pending' },
                        },
                    },
                ],
            },
        ];
        expect(getStudioCardResponse(saveThenQuery)).toBeNull();
    });

    it('names the changed models when a change ends the turn with nothing written', () => {
        expect(withStudioCardReply(' \n', proposed('draft-1'))).toBe(
            'Changed orders in the draft.',
        );
    });

    it('stays empty when nothing joined the draft, so the turn still reads as a failure', () => {
        expect(withStudioCardReply('', proposed(null))).toBe('');
        expect(withStudioCardReply('', [])).toBe('');
    });
});
