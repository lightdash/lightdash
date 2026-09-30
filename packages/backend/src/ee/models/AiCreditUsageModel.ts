import {
    AI_BILLABLE_FEATURES,
    calculateAiCredits,
    findAiCreditRate,
    getAiCreditContractWindow,
    type AiCreditPeriod,
    type AiCreditRateCardRow,
    type AiCreditUsageBreakdownRow,
    type AiCreditUsageSummary,
    type AiCreditUsageTotals,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    type AiCallFeature,
    type AiKeyManagement,
    type AiUsageEvent,
    type AiUsageOutcome,
} from '../../analytics/aiUsage';
import {
    AiUsageLedgerTableName,
    type DbAiUsageLedger,
} from '../../database/entities/aiUsageLedger';
import Logger from '../../logging/logger';
import {
    hasAllowance,
    type AiCreditContractModel,
    type AiCreditContractWithAllowance,
} from './AiCreditContractModel';
import { type AiCreditHoldModel } from './AiCreditHoldModel';
import { type AiCreditRateCardModel } from './AiCreditRateCardModel';

type Dependencies = {
    database: Knex;
    rateCardModel: AiCreditRateCardModel;
    contractModel: AiCreditContractModel;
    holdModel: AiCreditHoldModel;
};

// Fails to compile if the shared allowlist names a feature the ledger never records.
const BILLABLE_FEATURE_LIST: readonly AiCallFeature[] = AI_BILLABLE_FEATURES;
const BILLABLE_FEATURES: ReadonlySet<string> = new Set(BILLABLE_FEATURE_LIST);
const BILLABLE_KEY_MANAGEMENT: AiKeyManagement = 'lightdash-managed';
const BILLABLE_OUTCOME: AiUsageOutcome = 'complete';

type BillingFacts = {
    feature: string;
    keyManagement: AiKeyManagement | null;
    outcome: AiUsageOutcome;
};

const isChargeableCall = ({
    feature,
    outcome,
}: Pick<BillingFacts, 'feature' | 'outcome'>): boolean =>
    outcome === BILLABLE_OUTCOME && BILLABLE_FEATURES.has(feature);

export const isAiUsageBillable = (facts: BillingFacts): boolean =>
    facts.keyManagement === BILLABLE_KEY_MANAGEMENT && isChargeableCall(facts);

export type LedgerUsageGroup = {
    feature: string;
    key_management: AiKeyManagement | null;
    outcome: AiUsageOutcome;
    usage_channel: DbAiUsageLedger['usage_channel'];
    provider: string | null;
    model: string | null;
    // Any call in the group; every call in it is priced by the same rate card row.
    priced_at: Date;
    // Postgres numeric and bigint aggregates arrive as strings through the pg driver.
    calls: string;
    total_tokens: string;
    uncached_input_tokens: string;
    output_tokens: string;
    cache_read_tokens: string;
    cache_write_tokens: string;
};

export type AiCreditUsageAccumulator = Pick<
    AiCreditUsageSummary,
    'billable' | 'selfManaged' | 'excluded' | 'unpricedTokens'
> & {
    byFeature: Record<string, AiCreditUsageTotals>;
    byTier: Record<string, AiCreditUsageTotals>;
    byChannel: Record<string, AiCreditUsageTotals>;
    byKeyOrigin: Record<string, AiCreditUsageTotals>;
};

const emptyTotals = (): AiCreditUsageTotals => ({
    credits: 0,
    tokens: 0,
    calls: 0,
});

const addTotals = (
    totals: AiCreditUsageTotals,
    added: AiCreditUsageTotals,
): AiCreditUsageTotals => ({
    credits: totals.credits + added.credits,
    tokens: totals.tokens + added.tokens,
    calls: totals.calls + added.calls,
});

const addKeyed = (
    rows: Record<string, AiCreditUsageTotals>,
    key: string,
    added: AiCreditUsageTotals,
): Record<string, AiCreditUsageTotals> => ({
    ...rows,
    [key]: addTotals(rows[key] ?? emptyTotals(), added),
});

export const emptyAccumulator = (): AiCreditUsageAccumulator => ({
    billable: emptyTotals(),
    selfManaged: emptyTotals(),
    excluded: emptyTotals(),
    unpricedTokens: 0,
    byFeature: {},
    byTier: {},
    byChannel: {},
    byKeyOrigin: {},
});

export const toBreakdownRows = (
    rows: Record<string, AiCreditUsageTotals>,
): AiCreditUsageBreakdownRow[] =>
    Object.entries(rows)
        .map(([key, totals]) => ({ key, ...totals }))
        .sort((a, b) => b.credits - a.credits);

// Rows recorded before the key origin or channel columns existed carry null there.
const UNKNOWN_BREAKDOWN_KEY = 'unknown';

export const accumulateUsage = (
    rateCard: AiCreditRateCardRow[],
    acc: AiCreditUsageAccumulator,
    group: LedgerUsageGroup,
): AiCreditUsageAccumulator => {
    const tokens = Number(group.total_tokens);
    const rate =
        group.provider === null || group.model === null
            ? null
            : findAiCreditRate(rateCard, {
                  provider: group.provider,
                  model: group.model,
                  at: group.priced_at,
              });
    if (rate === null) {
        return { ...acc, unpricedTokens: acc.unpricedTokens + tokens };
    }
    // The uncached input is clamped per call in SQL, so the tokens are passed pre-split.
    const totals: AiCreditUsageTotals = {
        credits: calculateAiCredits(
            {
                inputTokens:
                    Number(group.uncached_input_tokens) +
                    Number(group.cache_read_tokens) +
                    Number(group.cache_write_tokens),
                outputTokens: Number(group.output_tokens),
                cacheReadTokens: Number(group.cache_read_tokens),
                cacheWriteTokens: Number(group.cache_write_tokens),
            },
            rate,
        ),
        tokens,
        calls: Number(group.calls),
    };
    const byKeyOrigin = addKeyed(
        acc.byKeyOrigin,
        group.key_management ?? UNKNOWN_BREAKDOWN_KEY,
        totals,
    );
    const facts: BillingFacts = {
        feature: group.feature,
        keyManagement: group.key_management,
        outcome: group.outcome,
    };
    if (isAiUsageBillable(facts)) {
        return {
            ...acc,
            billable: addTotals(acc.billable, totals),
            byFeature: addKeyed(acc.byFeature, group.feature, totals),
            byTier: addKeyed(acc.byTier, rate.tier, totals),
            byChannel: addKeyed(
                acc.byChannel,
                group.usage_channel ?? UNKNOWN_BREAKDOWN_KEY,
                totals,
            ),
            byKeyOrigin,
        };
    }
    if (group.key_management === 'self-managed' && isChargeableCall(facts)) {
        return {
            ...acc,
            selfManaged: addTotals(acc.selfManaged, totals),
            byKeyOrigin,
        };
    }
    return {
        ...acc,
        excluded: addTotals(acc.excluded, totals),
        byKeyOrigin,
    };
};

const toRateBoundaries = (rateCard: AiCreditRateCardRow[]): Date[] =>
    [...new Set(rateCard.map((row) => row.effectiveFrom.getTime()))]
        .sort((a, b) => a - b)
        .map((time) => new Date(time));

/**
 * Credits are never stored: every sum is derived from the ledger, pricing each
 * call with the rate card in force when it was made.
 */
export class AiCreditUsageModel {
    private readonly database: Knex;

    private readonly rateCardModel: AiCreditRateCardModel;

    private readonly contractModel: AiCreditContractModel;

    private readonly holdModel: AiCreditHoldModel;

    constructor({
        database,
        rateCardModel,
        contractModel,
        holdModel,
    }: Dependencies) {
        this.database = database;
        this.rateCardModel = rateCardModel;
        this.contractModel = contractModel;
        this.holdModel = holdModel;
    }

    // Pricing is linear in tokens, so calls sharing a model and a rate card segment can be summed before pricing.
    private async groupUsage(
        organizationUuid: string,
        period: AiCreditPeriod,
        rateBoundaries: Date[],
    ): Promise<LedgerUsageGroup[]> {
        const rateSegment =
            rateBoundaries.length === 0
                ? this.database.raw('0')
                : this.database.raw(
                      `width_bucket(created_at, ARRAY[${rateBoundaries
                          .map(() => '?')
                          .join(', ')}]::timestamptz[])`,
                      rateBoundaries,
                  );
        return this.database(AiUsageLedgerTableName)
            .select(
                'feature',
                'key_management',
                'outcome',
                'usage_channel',
                'provider',
                'model',
                this.database.raw('min(created_at) as priced_at'),
                this.database.raw('count(*) as calls'),
                this.database.raw(
                    'coalesce(sum(total_tokens), 0) as total_tokens',
                ),
                this.database.raw(
                    `coalesce(sum(greatest(coalesce(input_tokens, 0) - coalesce(cache_read_tokens, 0) - coalesce(cache_write_tokens, 0), 0)), 0) as uncached_input_tokens`,
                ),
                this.database.raw(
                    'coalesce(sum(output_tokens), 0) as output_tokens',
                ),
                this.database.raw(
                    'coalesce(sum(cache_read_tokens), 0) as cache_read_tokens',
                ),
                this.database.raw(
                    'coalesce(sum(cache_write_tokens), 0) as cache_write_tokens',
                ),
            )
            .where({ organization_uuid: organizationUuid })
            .where('created_at', '>=', period.periodStart)
            .where('created_at', '<', period.periodEnd)
            .groupBy(
                'feature',
                'key_management',
                'outcome',
                'usage_channel',
                'provider',
                'model',
                rateSegment,
            );
    }

    /** Everything the usage card needs for one period, from one aggregate over the ledger. */
    async summarize(
        organizationUuid: string,
        period: AiCreditPeriod,
    ): Promise<AiCreditUsageAccumulator> {
        const rateCard = await this.rateCardModel.getAll();
        const groups = await this.groupUsage(
            organizationUuid,
            period,
            toRateBoundaries(rateCard),
        );
        return groups.reduce(
            (acc, group) => accumulateUsage(rateCard, acc, group),
            emptyAccumulator(),
        );
    }

    // The hold decision reads the same billable figure the usage card shows.
    async sumCredits(
        organizationUuid: string,
        period: AiCreditPeriod,
    ): Promise<number> {
        const usage = await this.summarize(organizationUuid, period);
        return usage.billable.credits;
    }

    private async placeHoldIfExhausted(
        contract: AiCreditContractWithAllowance,
        at: Date,
    ): Promise<void> {
        const window = getAiCreditContractWindow(contract, at);
        if (window === null) return;
        if (await this.holdModel.findAllowanceExhaustedHold(contract, window)) {
            return;
        }
        const used = await this.sumCredits(contract.organizationUuid, window);
        if (used < contract.allowanceCredits) return;
        const hold = await this.holdModel.createAllowanceExhaustedHold(
            contract,
            window,
        );
        if (hold === undefined) return;
        Logger.info(
            `AI credit allowance exhausted for organization ${contract.organizationUuid}: ${used} of ${contract.allowanceCredits} credits used, hold placed until ${window.periodEnd.toISOString()}`,
        );
    }

    /** Runs off the request path, after the ledger row is written; nothing enforces the hold yet. */
    async onUsageRecorded(
        event: AiUsageEvent,
        at: Date = new Date(),
    ): Promise<void> {
        const { organizationId } = event.properties;
        if (organizationId === null || !isAiUsageBillable(event.properties)) {
            return;
        }
        const contract = await this.contractModel.find(organizationId);
        if (contract === undefined || !hasAllowance(contract)) return;
        await this.placeHoldIfExhausted(contract, at);
    }
}
