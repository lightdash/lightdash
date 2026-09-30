import { type AiCreditRateCardRow } from '@lightdash/common';
import {
    accumulateUsage,
    emptyAccumulator,
    isAiUsageBillable,
    type LedgerUsageGroup,
} from './AiCreditUsageModel';

describe('isAiUsageBillable', () => {
    test('charges only completed calls on a Lightdash-managed key for billable features', () => {
        expect(
            isAiUsageBillable({
                feature: 'agent',
                keyManagement: 'lightdash-managed',
                outcome: 'complete',
            }),
        ).toBe(true);
        expect(
            isAiUsageBillable({
                feature: 'agent',
                keyManagement: 'self-managed',
                outcome: 'complete',
            }),
        ).toBe(false);
        expect(
            isAiUsageBillable({
                feature: 'data-app',
                keyManagement: 'lightdash-managed',
                outcome: 'failed',
            }),
        ).toBe(false);
        expect(
            isAiUsageBillable({
                feature: 'review-classifier',
                keyManagement: 'lightdash-managed',
                outcome: 'complete',
            }),
        ).toBe(false);
        expect(
            isAiUsageBillable({
                feature: 'agent',
                keyManagement: null,
                outcome: 'complete',
            }),
        ).toBe(false);
    });
});

describe('accumulateUsage', () => {
    const rateCard: AiCreditRateCardRow[] = [
        {
            provider: 'anthropic',
            pricingScope: '__default__',
            modelKey: 'claude-sonnet-5',
            tier: 'standard',
            inputCreditsPerMtok: 40,
            outputCreditsPerMtok: 200,
            cacheReadCreditsPerMtok: 4,
            cacheWriteCreditsPerMtok: 50,
            effectiveFrom: new Date('2026-09-01T00:00:00Z'),
        },
    ];
    const row = (
        overrides: Partial<LedgerUsageGroup> = {},
    ): LedgerUsageGroup => ({
        priced_at: new Date('2026-09-15T00:00:00Z'),
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        calls: '1',
        uncached_input_tokens: '1000000',
        output_tokens: '0',
        cache_read_tokens: '0',
        cache_write_tokens: '0',
        total_tokens: '1000000',
        feature: 'agent',
        key_management: 'lightdash-managed',
        outcome: 'complete',
        usage_channel: 'slack',
        ...overrides,
    });

    test('a billable call lands in the billable totals and every breakdown', () => {
        const acc = accumulateUsage(rateCard, emptyAccumulator(), row());
        expect(acc.billable).toEqual({
            credits: 40,
            tokens: 1_000_000,
            calls: 1,
        });
        expect(acc.byFeature.agent?.credits).toBe(40);
        expect(acc.byTier.standard?.credits).toBe(40);
        expect(acc.byChannel.slack?.credits).toBe(40);
        expect(acc.byKeyOrigin['lightdash-managed']?.credits).toBe(40);
        expect(acc.selfManaged.calls).toBe(0);
    });

    test('a call on the customer key is priced for comparison but not charged', () => {
        const acc = accumulateUsage(
            rateCard,
            emptyAccumulator(),
            row({ key_management: 'self-managed' }),
        );
        expect(acc.selfManaged.credits).toBe(40);
        expect(acc.billable.calls).toBe(0);
        expect(acc.byFeature).toEqual({});
    });

    test('background and failed calls are excluded from both totals', () => {
        const background = accumulateUsage(
            rateCard,
            emptyAccumulator(),
            row({ feature: 'thread-title' }),
        );
        const failed = accumulateUsage(
            rateCard,
            emptyAccumulator(),
            row({ outcome: 'failed' }),
        );
        expect(background.excluded.calls).toBe(1);
        expect(failed.excluded.calls).toBe(1);
        expect(background.billable.calls + failed.billable.calls).toBe(0);
    });

    test('background and failed calls on the customer key are excluded, not counted as own-key usage', () => {
        const acc = [
            row({ key_management: 'self-managed', feature: 'thread-title' }),
            row({ key_management: 'self-managed', outcome: 'failed' }),
        ].reduce(
            (current, next) => accumulateUsage(rateCard, current, next),
            emptyAccumulator(),
        );
        expect(acc.excluded.calls).toBe(2);
        expect(acc.selfManaged.calls).toBe(0);
    });

    test('a later rate card row reprices only the calls made after it takes effect', () => {
        const repriced: AiCreditRateCardRow[] = [
            ...rateCard,
            {
                ...rateCard[0],
                inputCreditsPerMtok: 80,
                effectiveFrom: new Date('2026-09-20T00:00:00Z'),
            },
        ];
        const acc = [
            row({ priced_at: new Date('2026-09-15T00:00:00Z') }),
            row({ priced_at: new Date('2026-09-25T00:00:00Z') }),
        ].reduce(
            (current, next) => accumulateUsage(repriced, current, next),
            emptyAccumulator(),
        );
        expect(acc.billable.credits).toBe(40 + 80);
    });

    test('a group of calls is priced on its summed tokens and counted as its calls', () => {
        const acc = accumulateUsage(
            rateCard,
            emptyAccumulator(),
            row({
                calls: '3',
                uncached_input_tokens: '500000',
                cache_read_tokens: '1000000',
                output_tokens: '100000',
                total_tokens: '1600000',
            }),
        );
        expect(acc.billable).toEqual({
            credits: 0.5 * 40 + 1 * 4 + 0.1 * 200,
            tokens: 1_600_000,
            calls: 3,
        });
    });

    test('a model with no rate card row is reported as unpriced tokens, never as free credits', () => {
        const acc = accumulateUsage(
            rateCard,
            emptyAccumulator(),
            row({ provider: 'google', model: 'gemini-3.8-flash' }),
        );
        expect(acc.unpricedTokens).toBe(1_000_000);
        expect(acc.billable.calls).toBe(0);
        expect(acc.byKeyOrigin).toEqual({});
    });
});
