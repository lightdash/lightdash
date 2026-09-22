import { canUseFastModel } from './modelRouting';

describe('canUseFastModel', () => {
    it.each([
        [0.9, true],
        [0.89, false],
    ])(
        'accepts bounded structural confidence %s: %s',
        async (noul, expected) => {
            const evaluate = vi.fn().mockResolvedValue({
                simple: { type: 'noul', noul },
            });

            await expect(
                canUseFastModel({
                    decisions: { evaluate } as never,
                    prompt: 'how many orders in the last 2 years',
                    instructions: null,
                }),
            ).resolves.toBe(expected);
            expect(evaluate).toHaveBeenCalledWith(
                expect.objectContaining({
                    questions: {
                        simple: expect.objectContaining({
                            instructions: expect.stringContaining(
                                'one explicit time range',
                            ),
                        }),
                    },
                }),
            );
        },
    );
});
