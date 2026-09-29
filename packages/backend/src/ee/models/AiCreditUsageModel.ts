import {
    calculateAiCredits,
    findAiCreditRate,
    priceAiUsageInCredits,
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
    type AiCreditEntitlementModel,
    type AiCreditEntitlementWithAllowance,
} from './AiCreditEntitlementModel';
import { type AiCreditHoldModel } from './AiCreditHoldModel';
import { type AiCreditRateCardModel } from './AiCreditRateCardModel';

type Dependencies = {
    database: Knex;
    rateCardModel: AiCreditRateCardModel;
    entitlementModel: AiCreditEntitlementModel;
    holdModel: AiCreditHoldModel;
};

// Everything else is recorded in the ledger but never charged.
export const AI_BILLABLE_FEATURES = [
    'agent',
    'deep-research',
    'agent-subtask',
    'compaction',
    'data-app',
] as const satisfies readonly AiCallFeature[];

const BILLABLE_FEATURES: ReadonlySet<AiCallFeature> = new Set(
    AI_BILLABLE_FEATURES,
);
const BILLABLE_KEY_MANAGEMENT: AiKeyManagement = 'lightdash-managed';
const BILLABLE_OUTCOME: AiUsageOutcome = 'complete';

export const isAiUsageBillable = ({
    feature,
    keyManagement,
    outcome,
}: Pick<
    AiUsageEvent['properties'],
    'feature' | 'keyManagement' | 'outcome'
>): boolean =>
    keyManagement === BILLABLE_KEY_MANAGEMENT &&
    outcome === BILLABLE_OUTCOME &&
    BILLABLE_FEATURES.has(feature);

const LEDGER_PAGE_SIZE = 5_000;

const LEDGER_USAGE_COLUMNS = [
    'ai_usage_ledger_uuid',
    'created_at',
    'provider',
    'model',
    'input_tokens',
    'output_tokens',
    'cache_read_tokens',
    'cache_write_tokens',
] as const;

type LedgerUsageRow = Pick<
    DbAiUsageLedger,
    (typeof LEDGER_USAGE_COLUMNS)[number]
> & { provider: string; model: string };

type LedgerCursor = { createdAt: Date; uuid: string };

const LEDGER_SUMMARY_COLUMNS = [
    ...LEDGER_USAGE_COLUMNS,
    'feature',
    'key_management',
    'outcome',
    'total_tokens',
] as const;

type LedgerSummaryRow = Pick<
    DbAiUsageLedger,
    (typeof LEDGER_SUMMARY_COLUMNS)[number]
>;

export type AiCreditUsageAccumulator = Pick<
    AiCreditUsageSummary,
    'billable' | 'selfManaged' | 'excluded' | 'unpricedTokens'
> & {
    byFeature: Record<string, AiCreditUsageTotals>;
    byTier: Record<string, AiCreditUsageTotals>;
    byKeyOrigin: Record<string, AiCreditUsageTotals>;
};

const emptyTotals = (): AiCreditUsageTotals => ({
    credits: 0,
    tokens: 0,
    calls: 0,
});

const addTotals = (
    totals: AiCreditUsageTotals,
    credits: number,
    tokens: number,
): AiCreditUsageTotals => ({
    credits: totals.credits + credits,
    tokens: totals.tokens + tokens,
    calls: totals.calls + 1,
});

const addKeyed = (
    rows: Record<string, AiCreditUsageTotals>,
    key: string,
    credits: number,
    tokens: number,
): Record<string, AiCreditUsageTotals> => ({
    ...rows,
    [key]: addTotals(rows[key] ?? emptyTotals(), credits, tokens),
});

export const emptyAccumulator = (): AiCreditUsageAccumulator => ({
    billable: emptyTotals(),
    selfManaged: emptyTotals(),
    excluded: emptyTotals(),
    unpricedTokens: 0,
    byFeature: {},
    byTier: {},
    byKeyOrigin: {},
});

/** Sorts a keyed breakdown into rows, largest credits first. */
export const toBreakdownRows = (
    rows: Record<string, AiCreditUsageTotals>,
): AiCreditUsageBreakdownRow[] =>
    Object.entries(rows)
        .map(([key, totals]) => ({ key, ...totals }))
        .sort((a, b) => b.credits - a.credits);

/**
 * Folds one ledger row into the summary. Exported so the rules can be tested
 * without a database.
 */
export const accumulateUsage = (
    rateCard: AiCreditRateCardRow[],
    acc: AiCreditUsageAccumulator,
    row: LedgerSummaryRow,
): AiCreditUsageAccumulator => {
    const tokens = Number(row.total_tokens ?? 0);
    const rate =
        row.provider === null || row.model === null
            ? null
            : findAiCreditRate(rateCard, {
                  provider: row.provider,
                  model: row.model,
                  at: row.created_at,
              });
    if (rate === null) {
        return { ...acc, unpricedTokens: acc.unpricedTokens + tokens };
    }
    const toCountOrNull = (value: string | null) =>
        value === null ? null : Number(value);
    const credits = calculateAiCredits(
        {
            inputTokens: toCountOrNull(row.input_tokens),
            outputTokens: toCountOrNull(row.output_tokens),
            cacheReadTokens: toCountOrNull(row.cache_read_tokens),
            cacheWriteTokens: toCountOrNull(row.cache_write_tokens),
        },
        rate,
    );
    const byKeyOrigin = addKeyed(
        acc.byKeyOrigin,
        row.key_management ?? 'unknown',
        credits,
        tokens,
    );
    if (
        isAiUsageBillable({
            feature: row.feature as AiCallFeature,
            keyManagement: row.key_management,
            outcome: row.outcome,
        })
    ) {
        return {
            ...acc,
            billable: addTotals(acc.billable, credits, tokens),
            byFeature: addKeyed(acc.byFeature, row.feature, credits, tokens),
            byTier: addKeyed(acc.byTier, rate.tier, credits, tokens),
            byKeyOrigin,
        };
    }
    if (row.key_management === 'self-managed') {
        return {
            ...acc,
            selfManaged: addTotals(acc.selfManaged, credits, tokens),
            byKeyOrigin,
        };
    }
    return {
        ...acc,
        excluded: addTotals(acc.excluded, credits, tokens),
        byKeyOrigin,
    };
};

const toCount = (value: string | null): number | null =>
    value === null ? null : Number(value);

// Unpriced models count as zero rather than failing the sum.
const priceLedgerRow = (
    rateCard: AiCreditRateCardRow[],
    row: LedgerUsageRow,
): number =>
    priceAiUsageInCredits(rateCard, {
        provider: row.provider,
        model: row.model,
        at: row.created_at,
        tokens: {
            inputTokens: toCount(row.input_tokens),
            outputTokens: toCount(row.output_tokens),
            cacheReadTokens: toCount(row.cache_read_tokens),
            cacheWriteTokens: toCount(row.cache_write_tokens),
        },
    }) ?? 0;

/**
 * Credits are never stored: every sum is derived from the ledger, pricing each
 * call with the rate card in force when it was made.
 */
export class AiCreditUsageModel {
    private readonly database: Knex;

    private readonly rateCardModel: AiCreditRateCardModel;

    private readonly entitlementModel: AiCreditEntitlementModel;

    private readonly holdModel: AiCreditHoldModel;

    constructor({
        database,
        rateCardModel,
        entitlementModel,
        holdModel,
    }: Dependencies) {
        this.database = database;
        this.rateCardModel = rateCardModel;
        this.entitlementModel = entitlementModel;
        this.holdModel = holdModel;
    }

    private async sumLedgerPages(
        organizationUuid: string,
        period: AiCreditPeriod,
        rateCard: AiCreditRateCardRow[],
        after: LedgerCursor | null,
        total: number,
    ): Promise<number> {
        const rows: LedgerUsageRow[] = await this.database(
            AiUsageLedgerTableName,
        )
            .select(LEDGER_USAGE_COLUMNS)
            .where({
                organization_uuid: organizationUuid,
                key_management: BILLABLE_KEY_MANAGEMENT,
                outcome: BILLABLE_OUTCOME,
            })
            .whereIn('feature', AI_BILLABLE_FEATURES)
            .whereNotNull('provider')
            .whereNotNull('model')
            .where('created_at', '>=', period.periodStart)
            .where('created_at', '<', period.periodEnd)
            .modify((query) => {
                if (after !== null) {
                    void query.where((builder) => {
                        void builder
                            .where('created_at', '>', after.createdAt)
                            .orWhere((tie) => {
                                void tie
                                    .where('created_at', after.createdAt)
                                    .where(
                                        'ai_usage_ledger_uuid',
                                        '>',
                                        after.uuid,
                                    );
                            });
                    });
                }
            })
            .orderBy([
                { column: 'created_at', order: 'asc' },
                { column: 'ai_usage_ledger_uuid', order: 'asc' },
            ])
            .limit(LEDGER_PAGE_SIZE);
        const pageTotal = rows.reduce(
            (sum, row) => sum + priceLedgerRow(rateCard, row),
            total,
        );
        if (rows.length < LEDGER_PAGE_SIZE) return pageTotal;
        const last = rows[rows.length - 1];
        return this.sumLedgerPages(
            organizationUuid,
            period,
            rateCard,
            { createdAt: last.created_at, uuid: last.ai_usage_ledger_uuid },
            pageTotal,
        );
    }

    async sumCredits(
        organizationUuid: string,
        period: AiCreditPeriod,
    ): Promise<number> {
        return this.sumLedgerPages(
            organizationUuid,
            period,
            await this.rateCardModel.getAll(),
            null,
            0,
        );
    }

    private async foldSummaryPages(
        organizationUuid: string,
        period: AiCreditPeriod,
        rateCard: AiCreditRateCardRow[],
        after: LedgerCursor | null,
        acc: AiCreditUsageAccumulator,
    ): Promise<AiCreditUsageAccumulator> {
        const rows: LedgerSummaryRow[] = await this.database(
            AiUsageLedgerTableName,
        )
            .select(LEDGER_SUMMARY_COLUMNS)
            .where({ organization_uuid: organizationUuid })
            .where('created_at', '>=', period.periodStart)
            .where('created_at', '<', period.periodEnd)
            .modify((query) => {
                if (after !== null) {
                    void query.where((builder) => {
                        void builder
                            .where('created_at', '>', after.createdAt)
                            .orWhere((tie) => {
                                void tie
                                    .where('created_at', after.createdAt)
                                    .where(
                                        'ai_usage_ledger_uuid',
                                        '>',
                                        after.uuid,
                                    );
                            });
                    });
                }
            })
            .orderBy([
                { column: 'created_at', order: 'asc' },
                { column: 'ai_usage_ledger_uuid', order: 'asc' },
            ])
            .limit(LEDGER_PAGE_SIZE);
        const pageAcc = rows.reduce(
            (current, row) => accumulateUsage(rateCard, current, row),
            acc,
        );
        if (rows.length < LEDGER_PAGE_SIZE) return pageAcc;
        const last = rows[rows.length - 1];
        return this.foldSummaryPages(
            organizationUuid,
            period,
            rateCard,
            { createdAt: last.created_at, uuid: last.ai_usage_ledger_uuid },
            pageAcc,
        );
    }

    /** Everything the usage card needs for one period, from one walk over the ledger. */
    async summarize(
        organizationUuid: string,
        period: AiCreditPeriod,
    ): Promise<AiCreditUsageAccumulator> {
        return this.foldSummaryPages(
            organizationUuid,
            period,
            await this.rateCardModel.getAll(),
            null,
            emptyAccumulator(),
        );
    }

    private async placeHoldIfExhausted(
        entitlement: AiCreditEntitlementWithAllowance,
    ): Promise<void> {
        if (await this.holdModel.findAllowanceExhaustedHold(entitlement.uuid)) {
            return;
        }
        if (
            await this.holdModel.findActiveAllowanceExhaustedHoldUntil(
                entitlement.organizationUuid,
                entitlement.periodEnd,
            )
        ) {
            return;
        }
        const used = await this.sumCredits(
            entitlement.organizationUuid,
            entitlement,
        );
        if (used < entitlement.allowanceCredits) return;
        const hold =
            await this.holdModel.createAllowanceExhaustedHold(entitlement);
        if (hold === undefined) return;
        Logger.info(
            `AI credit allowance exhausted for organization ${entitlement.organizationUuid}: ${used} of ${entitlement.allowanceCredits} credits used, hold placed until ${entitlement.periodEnd.toISOString()}`,
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
        const entitlements =
            await this.entitlementModel.findCoveringWithAllowance(
                organizationId,
                at,
            );
        // Longest window first, so its hold covers shorter windows that run out with it.
        await [...entitlements]
            .sort((a, b) => b.periodEnd.getTime() - a.periodEnd.getTime())
            .reduce<Promise<void>>(
                (previous, entitlement) =>
                    previous.then(() => this.placeHoldIfExhausted(entitlement)),
                Promise.resolve(),
            );
    }
}
