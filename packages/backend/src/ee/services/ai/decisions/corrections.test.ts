import { describe, expect, it, vi } from 'vitest';
import type { DecisionAnswers } from './AiDecisionClient';
import { decideTurn } from './chartIntent';
import { isLastingCorrection, pickCorrection } from './corrections';

const choice = (value: string, probability = 0.95) => ({
    type: 'choice' as const,
    choice: value,
    confidence: probability,
    probabilities: { [value]: probability, other: 1 - probability },
});
const noul = (value: number) => ({ type: 'noul' as const, noul: value });
const field = (id: string, label: string) => ({
    id,
    label,
    table: 'Accounts',
    description: null,
    isDate: false,
    verifiedUsage: 0,
    chartUsage: 0,
});

describe('correction detection', () => {
    it('only treats a confident yes as a lasting correction', () => {
        expect(
            isLastingCorrection({
                lastingCorrection: noul(0.9),
            } as DecisionAnswers),
        ).toBe(true);
        expect(
            isLastingCorrection({
                lastingCorrection: noul(0.6),
            } as DecisionAnswers),
        ).toBe(false);
    });

    it('picks the kind, the field and an instruction line that already covers it', async () => {
        const evaluate = vi.fn().mockResolvedValue({
            kind: choice('default_scope'),
            field: choice('accounts_type'),
            coveredBy: choice('line1'),
        });
        const { correction } = await pickCorrection({
            decisions: { evaluate },
            prompt: 'active means non-partner customers',
            instructions: 'Be concise.\nActive excludes partner accounts.',
            fields: [field('accounts_type', 'Account type')],
        });
        expect(correction).toEqual({
            kind: 'default_scope',
            fieldId: 'accounts_type',
            coveredBy: 'Active excludes partner accounts.',
        });
        expect(evaluate.mock.calls[0][0].operation).toBe('correction-pick');
    });

    it('drops an unsure kind and never invents a field', async () => {
        expect(
            (
                await pickCorrection({
                    decisions: {
                        evaluate: vi
                            .fn()
                            .mockResolvedValue({ kind: choice('alias', 0.4) }),
                    },
                    prompt: 'x',
                    instructions: null,
                    fields: [],
                })
            ).correction,
        ).toBeNull();
        expect(
            (
                await pickCorrection({
                    decisions: {
                        evaluate: vi.fn().mockResolvedValue({
                            kind: choice('alias'),
                            field: choice('none'),
                        }),
                    },
                    prompt: 'x',
                    instructions: null,
                    fields: [field('accounts_type', 'Account type')],
                })
            ).correction,
        ).toEqual({ kind: 'alias', fieldId: null, coveredBy: null });
    });

    it('asks the second question only when a correction is detected', async () => {
        const turn = (lasting: number) => {
            const evaluate = vi
                .fn()
                .mockResolvedValueOnce({
                    simple: noul(0.1),
                    instantReply: choice('other'),
                    englishPrompt: noul(0.95),
                    lastingCorrection: noul(lasting),
                })
                .mockResolvedValueOnce({ kind: choice('alias') });
            return decideTurn({
                decisions: { evaluate },
                prompt: 'territory means region from now on',
                instructions: null,
                conversation: [],
                context: null,
            }).then((result) => ({
                result,
                calls: evaluate.mock.calls.length,
            }));
        };
        const detected = await turn(0.9);
        expect(detected.calls).toBe(2);
        expect(detected.result.decision.correction).toEqual({
            kind: 'alias',
            fieldId: null,
            coveredBy: null,
        });
        expect(detected.result.answers).toHaveProperty('correction.kind');
        const ordinary = await turn(0.1);
        expect(ordinary.calls).toBe(1);
        expect(ordinary.result.decision.correction).toBeNull();
    });
});
