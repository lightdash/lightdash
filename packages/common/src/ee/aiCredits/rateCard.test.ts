import {
    calculateAiCredits,
    findAiCreditRate,
    normalizeAiCreditPricingKey,
    priceAiUsageInCredits,
    type AiCreditRateCardRow,
} from './rateCard';

const row = (
    overrides: Partial<AiCreditRateCardRow> &
        Pick<AiCreditRateCardRow, 'modelKey'>,
): AiCreditRateCardRow => ({
    provider: 'anthropic',
    pricingScope: '__default__',
    tier: 'standard',
    inputCreditsPerMtok: 40,
    outputCreditsPerMtok: 200,
    cacheReadCreditsPerMtok: 4,
    cacheWriteCreditsPerMtok: 50,
    effectiveFrom: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
});

describe('normalizeAiCreditPricingKey', () => {
    test.each([
        [
            'anthropic',
            'claude-haiku-4-5-20251001',
            'claude-haiku-4-5',
            '__default__',
        ],
        ['anthropic', 'claude-sonnet-5', 'claude-sonnet-5', '__default__'],
        ['anthropic', 'sonnet', 'claude-sonnet', '__default__'],
        ['anthropic', 'opus', 'claude-opus', '__default__'],
        ['anthropic', 'haiku', 'claude-haiku', '__default__'],
        ['openai', 'gpt-5.4-2026-03-05', 'gpt-5.4', '__default__'],
        ['openai', 'gpt-5-mini-2025-08-07', 'gpt-5-mini', '__default__'],
        ['openai', 'gpt-5.6-sol', 'gpt-5.6-sol', '__default__'],
        ['azure', 'gpt-4.1-mini', 'gpt-4.1-mini', '__default__'],
        [
            'bedrock',
            'us.anthropic.claude-haiku-4-5-20251001-v1:0',
            'anthropic.claude-haiku-4-5',
            'us',
        ],
        [
            'bedrock',
            'global.anthropic.claude-sonnet-5',
            'anthropic.claude-sonnet-5',
            'global',
        ],
        [
            'bedrock',
            'anthropic.claude-opus-4-5-20251101-v1:0',
            'anthropic.claude-opus-4-5',
            '__default__',
        ],
        [
            'bedrock',
            'anthropic.claude-opus-5',
            'anthropic.claude-opus-5',
            '__default__',
        ],
        [
            'bedrock',
            'arn:aws:bedrock:eu-west-1::inference-profile/eu.anthropic.claude-sonnet-4-5-20250929-v1:0',
            'anthropic.claude-sonnet-4-5',
            'eu',
        ],
        ['bedrock', 'sonnet', 'claude-sonnet', '__default__'],
    ])('%s %s -> %s in scope %s', (provider, model, modelKey, pricingScope) => {
        expect(normalizeAiCreditPricingKey(provider, model)).toEqual({
            modelKey,
            pricingScope,
        });
    });
});

describe('findAiCreditRate', () => {
    const rows: AiCreditRateCardRow[] = [
        row({ modelKey: 'claude-sonnet-5', inputCreditsPerMtok: 40 }),
        row({
            modelKey: 'claude-sonnet-5',
            inputCreditsPerMtok: 60,
            effectiveFrom: new Date('2026-10-01T00:00:00Z'),
        }),
        row({ modelKey: '__default__', inputCreditsPerMtok: 99 }),
        row({
            provider: 'bedrock',
            pricingScope: 'us',
            modelKey: '__default__',
            inputCreditsPerMtok: 66,
        }),
        row({
            provider: 'bedrock',
            pricingScope: '__default__',
            modelKey: '__default__',
            inputCreditsPerMtok: 60,
        }),
    ];

    test('uses the latest row whose effective date is on or before the call', () => {
        const before = findAiCreditRate(rows, {
            provider: 'anthropic',
            model: 'claude-sonnet-5',
            at: new Date('2026-09-30T23:59:59Z'),
        });
        const after = findAiCreditRate(rows, {
            provider: 'anthropic',
            model: 'claude-sonnet-5',
            at: new Date('2026-10-01T00:00:00Z'),
        });
        expect(before?.inputCreditsPerMtok).toBe(40);
        expect(after?.inputCreditsPerMtok).toBe(60);
    });

    test('falls back to the provider default for a model with no row', () => {
        const rate = findAiCreditRate(rows, {
            provider: 'anthropic',
            model: 'claude-sonnet-4-20250514',
            at: new Date('2026-09-15T00:00:00Z'),
        });
        expect(rate?.inputCreditsPerMtok).toBe(99);
    });

    test('prefers the pricing scope default before the provider default', () => {
        const usRate = findAiCreditRate(rows, {
            provider: 'bedrock',
            model: 'us.anthropic.claude-opus-5',
            at: new Date('2026-09-15T00:00:00Z'),
        });
        const unknownScopeRate = findAiCreditRate(rows, {
            provider: 'bedrock',
            model: 'ca.anthropic.claude-opus-5',
            at: new Date('2026-09-15T00:00:00Z'),
        });
        expect(usRate?.inputCreditsPerMtok).toBe(66);
        expect(unknownScopeRate?.inputCreditsPerMtok).toBe(60);
    });

    test('returns null before any row is in force or for an unknown provider', () => {
        expect(
            findAiCreditRate(rows, {
                provider: 'anthropic',
                model: 'claude-sonnet-5',
                at: new Date('2026-08-31T00:00:00Z'),
            }),
        ).toBeNull();
        expect(
            findAiCreditRate(rows, {
                provider: 'google',
                model: 'gemini-3.8-flash',
                at: new Date('2026-09-15T00:00:00Z'),
            }),
        ).toBeNull();
    });
});

describe('calculateAiCredits', () => {
    const rate = row({ modelKey: 'claude-sonnet-5' });

    test('prices each token class at its own rate with cache carved out of input', () => {
        const credits = calculateAiCredits(
            {
                inputTokens: 1_000_000,
                outputTokens: 100_000,
                cacheReadTokens: 500_000,
                cacheWriteTokens: 100_000,
            },
            rate,
        );
        // 400k uncached × 40 + 500k × 4 + 100k × 50 + 100k × 200, per million
        expect(credits).toBeCloseTo(16 + 2 + 5 + 20, 6);
    });

    test('treats unreported classes as zero and never prices negative input', () => {
        expect(
            calculateAiCredits(
                {
                    inputTokens: null,
                    outputTokens: 10_000,
                    cacheReadTokens: null,
                    cacheWriteTokens: null,
                },
                rate,
            ),
        ).toBeCloseTo(2, 6);
        expect(
            calculateAiCredits(
                {
                    inputTokens: 100,
                    outputTokens: 0,
                    cacheReadTokens: 500,
                    cacheWriteTokens: 0,
                },
                rate,
            ),
        ).toBeCloseTo(0.002, 6);
    });
});

describe('priceAiUsageInCredits', () => {
    test('returns null when no rate applies so the call is reported as unpriced', () => {
        expect(
            priceAiUsageInCredits([], {
                provider: 'anthropic',
                model: 'claude-sonnet-5',
                at: new Date(),
                tokens: {
                    inputTokens: 10,
                    outputTokens: 10,
                    cacheReadTokens: 0,
                    cacheWriteTokens: 0,
                },
            }),
        ).toBeNull();
    });
});
