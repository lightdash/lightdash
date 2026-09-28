export const AI_CREDIT_MODEL_TIERS = ['fast', 'standard', 'premium'] as const;
export type AiCreditModelTier = (typeof AI_CREDIT_MODEL_TIERS)[number];

export const AI_CREDIT_DEFAULT_PRICING_SCOPE = '__default__';
export const AI_CREDIT_DEFAULT_MODEL_KEY = '__default__';

/**
 * One rate card row: what a model costs in credits per million tokens of each
 * class, from `effectiveFrom` until a later-dated row for the same key exists.
 */
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

export type AiCreditPricingKey = {
    modelKey: string;
    pricingScope: string;
};

/**
 * `inputTokens` is the cache-inclusive total the providers report; uncached
 * input is derived by subtracting the cache classes. Null means the provider
 * did not report that class.
 */
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

const BEDROCK_ROUTING_PREFIX = /^[a-z-]+\.[a-z0-9-]+\./;
const BEDROCK_VERSION_SUFFIX = /-v\d+:\d+$/;
const DATED_SNAPSHOT_SUFFIX = /-(20\d{6}|\d{4}-\d{2}-\d{2})$/;

const stripDatedSnapshot = (model: string): string =>
    model.replace(DATED_SNAPSHOT_SUFFIX, '');

/**
 * Reduces a raw model id to the key the rate card is indexed by. Mirrors the
 * warehouse rule so the app and the internal cost model agree on every model:
 * dated snapshot suffixes are dropped, bare CLI aliases map to a tier key, and
 * Bedrock inference-profile ids lose their routing prefix and version suffix
 * while keeping the vendor. The routing prefix becomes the pricing scope.
 */
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
    const routingPrefix = BEDROCK_ROUTING_PREFIX.test(pricingModel)
        ? pricingModel.slice(0, pricingModel.indexOf('.'))
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

/**
 * The rate in force for a call: the exact model in its pricing scope, else the
 * scope's default row, else the provider's default row. Null when the provider
 * has no rows at all, which callers must surface as unpriced rather than free.
 */
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

/**
 * Credits for one call at a given rate. Each token class is priced at its own
 * rate; cache reads and writes are carved out of the inclusive input total.
 */
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
