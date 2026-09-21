import { describe, expect, it, vi } from 'vitest';
import type { AiDecisionClient } from './AiDecisionClient';
import { resolveFieldValue } from './fieldValues';

const answer = (choice: string) => ({
    value: {
        type: 'choice' as const,
        choice,
        confidence: 0.99,
        probabilities: { [choice]: 0.99, none: 0.01 },
    },
});

const makeDecisions = () => ({
    evaluate: vi.fn<AiDecisionClient['evaluate']>(),
});

describe('resolveFieldValue', () => {
    it('returns an exact value without contacting the provider', async () => {
        const decisions = makeDecisions();
        await expect(
            resolveFieldValue({
                decisions,
                fieldId: 'orders.status',
                requested: 'shipped',
                values: ['pending', 'shipped'],
            }),
        ).resolves.toBe('shipped');
        expect(decisions.evaluate).not.toHaveBeenCalled();
    });

    it.each([
        ['CA', 'ＣＡ'],
        ['New York', 'New\tYork'],
        [1, '1'],
    ])(
        'abstains when distinct values normalize identically: %s, %s',
        async (first, second) => {
            const decisions = makeDecisions();
            decisions.evaluate.mockResolvedValue(answer('0'));
            await expect(
                resolveFieldValue({
                    decisions,
                    fieldId: 'orders.region',
                    requested: 'an equivalent name',
                    values: [first, second],
                }),
            ).resolves.toBeNull();
            expect(decisions.evaluate).not.toHaveBeenCalled();
        },
    );

    it('bounds each untrusted value before contacting the provider', async () => {
        const decisions = makeDecisions();
        await expect(
            resolveFieldValue({
                decisions,
                fieldId: 'orders.status',
                requested: 'x'.repeat(1_025),
                values: ['pending'],
            }),
        ).resolves.toBeNull();
        expect(decisions.evaluate).not.toHaveBeenCalled();
    });

    it('canonicalizes provider input and maps an allowlisted choice to the original value', async () => {
        const decisions = makeDecisions();
        decisions.evaluate.mockResolvedValue(answer('1'));

        await expect(
            resolveFieldValue({
                decisions,
                fieldId: 'orders.\u0000status',
                requested: 'New\nYork',
                values: ['Boston', 'New\tYork City'],
            }),
        ).resolves.toBe('New\tYork City');

        expect(decisions.evaluate).toHaveBeenCalledWith(
            expect.objectContaining({
                state: {
                    fieldId: 'orders. status',
                    requested: 'New York',
                    values: ['Boston', 'New York City'],
                },
                questions: {
                    value: expect.objectContaining({
                        criteria: {
                            '0': 'Boston',
                            '1': 'New York City',
                            none: 'No unambiguous equivalent',
                        },
                    }),
                },
            }),
        );
    });

    it('rejects provider choices outside the candidate allowlist', async () => {
        const decisions = makeDecisions();
        decisions.evaluate.mockResolvedValue(answer('999'));

        await expect(
            resolveFieldValue({
                decisions,
                fieldId: 'orders.status',
                requested: 'complete',
                values: ['completed'],
            }),
        ).resolves.toBeNull();
    });
});
