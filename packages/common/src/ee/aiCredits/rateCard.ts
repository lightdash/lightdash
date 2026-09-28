export const AI_CREDIT_MODEL_TIERS = ['fast', 'standard', 'premium'] as const;
export type AiCreditModelTier = (typeof AI_CREDIT_MODEL_TIERS)[number];

export const AI_CREDIT_DEFAULT_PRICING_SCOPE = '__default__';
export const AI_CREDIT_DEFAULT_MODEL_KEY = '__default__';

// A row prices calls from effectiveFrom until a later-dated row for the same key exists.
export type AiCreditRateCardRow = {
    provider: string;
    pricingScope: string;
    modelKey: string;
    tier: AiCreditModelTier;
    inputCreditsPerMtok: number;
    outputCreditsPerMtok: number;
    cacheReadCreditsPerMtok: number;
    cacheWriteCreditsPerMtok: number;
    effectiveFrom: Date;
};

type AiCreditPricingKey = {
    modelKey: string;
    pricingScope: string;
};

// inputTokens is the cache-inclusive total providers report; null means unreported.
export type AiCreditTokenCounts = {
    inputTokens: number | null;
    outputTokens: number | null;
    cacheReadTokens: number | null;
    cacheWriteTokens: number | null;
};

const CLI_ALIAS_MODEL_KEYS: Record<string, string> = {
    sonnet: 'claude-sonnet',
    opus: 'claude-opus',
    haiku: 'claude-haiku',
};

// Bedrock model ids start with the vendor; anything before it is a routing prefix.
const BEDROCK_VENDORS = new Set([
    'anthropic',
    'openai',
    'amazon',
    'meta',
    'mistral',
    'cohere',
    'ai21',
    'deepseek',
    'google',
    'stability',
]);
const BEDROCK_VERSION_SUFFIX = /-v\d+:\d+$/;
const DATED_SNAPSHOT_SUFFIX = /-(20\d{6}|\d{4}-\d{2}-\d{2})$/;

const stripDatedSnapshot = (model: string): string =>
    model.replace(DATED_SNAPSHOT_SUFFIX, '');

// Must agree with the warehouse's model-key normalisation so both price the same row.
export const normalizeAiCreditPricingKey = (
    provider: string,
    model: string,
): AiCreditPricingKey => {
    const alias = CLI_ALIAS_MODEL_KEYS[model];
    if (alias !== undefined) {
        return {
            modelKey: alias,
            pricingScope: AI_CREDIT_DEFAULT_PRICING_SCOPE,
        };
    }
    if (provider !== 'bedrock') {
        return {
            modelKey: stripDatedSnapshot(model),
            pricingScope: AI_CREDIT_DEFAULT_PRICING_SCOPE,
        };
    }
    const pricingModel = model.slice(model.lastIndexOf('/') + 1);
    const segments = pricingModel.split('.');
    const routingPrefix =
        segments.length >= 3 && !BEDROCK_VENDORS.has(segments[0])
            ? segments[0]
            : null;
    const withoutPrefix =
        routingPrefix === null
            ? pricingModel
            : pricingModel.slice(routingPrefix.length + 1);
    return {
        modelKey: stripDatedSnapshot(
            withoutPrefix.replace(BEDROCK_VERSION_SUFFIX, ''),
        ),
        pricingScope: routingPrefix ?? AI_CREDIT_DEFAULT_PRICING_SCOPE,
    };
};

const latestInForce = (
    rows: AiCreditRateCardRow[],
    at: Date,
): AiCreditRateCardRow | null =>
    rows.reduce<AiCreditRateCardRow | null>(
        (best, row) =>
            row.effectiveFrom <= at &&
            (best === null || row.effectiveFrom > best.effectiveFrom)
                ? row
                : best,
        null,
    );

// Exact model in scope, else the scope default, else the provider default; null means unpriced, not free.
export const findAiCreditRate = (
    rows: AiCreditRateCardRow[],
    { provider, model, at }: { provider: string; model: string; at: Date },
): AiCreditRateCardRow | null => {
    const { modelKey, pricingScope } = normalizeAiCreditPricingKey(
        provider,
        model,
    );
    const providerRows = rows.filter((row) => row.provider === provider);
    const candidates: AiCreditPricingKey[] = [
        { modelKey, pricingScope },
        { modelKey: AI_CREDIT_DEFAULT_MODEL_KEY, pricingScope },
        {
            modelKey: AI_CREDIT_DEFAULT_MODEL_KEY,
            pricingScope: AI_CREDIT_DEFAULT_PRICING_SCOPE,
        },
    ];
    return candidates.reduce<AiCreditRateCardRow | null>(
        (found, key) =>
            found ??
            latestInForce(
                providerRows.filter(
                    (row) =>
                        row.modelKey === key.modelKey &&
                        row.pricingScope === key.pricingScope,
                ),
                at,
            ),
        null,
    );
};

export const calculateAiCredits = (
    tokens: AiCreditTokenCounts,
    rate: AiCreditRateCardRow,
): number => {
    const cacheRead = tokens.cacheReadTokens ?? 0;
    const cacheWrite = tokens.cacheWriteTokens ?? 0;
    const uncachedInput = Math.max(
        (tokens.inputTokens ?? 0) - cacheRead - cacheWrite,
        0,
    );
    const output = tokens.outputTokens ?? 0;
    return (
        (uncachedInput * rate.inputCreditsPerMtok +
            cacheRead * rate.cacheReadCreditsPerMtok +
            cacheWrite * rate.cacheWriteCreditsPerMtok +
            output * rate.outputCreditsPerMtok) /
        1_000_000
    );
};

export const priceAiUsageInCredits = (
    rows: AiCreditRateCardRow[],
    call: {
        provider: string;
        model: string;
        at: Date;
        tokens: AiCreditTokenCounts;
    },
): number | null => {
    const rate = findAiCreditRate(rows, call);
    return rate === null ? null : calculateAiCredits(call.tokens, rate);
};
