import {
    getCalendarMonthPeriod,
    isAiUsageBillable,
    priceAiUsageInCredits,
    type AiCreditPeriod,
    type AiCreditRateCardRow,
} from '@lightdash/common';
import { Knex } from 'knex';
import { type AiUsageEvent } from '../../analytics/aiUsage';
import {
    AiUsageLedgerTableName,
    type DbAiUsageLedger,
} from '../../database/entities/aiUsageLedger';
import Logger from '../../logging/logger';
import { type AiCreditEntitlementModel } from './AiCreditEntitlementModel';
import { type AiCreditHoldModel } from './AiCreditHoldModel';
import { type AiCreditRateCardModel } from './AiCreditRateCardModel';

type Dependencies = {
    database: Knex;
    rateCardModel: AiCreditRateCardModel;
    entitlementModel: AiCreditEntitlementModel;
    holdModel: AiCreditHoldModel;
};

// Rate rows change rarely and every sum would otherwise read them.
const RATE_CARD_TTL_MS = 60_000;

const LEDGER_PAGE_SIZE = 5_000;

const LEDGER_USAGE_COLUMNS = [
    'ai_usage_ledger_uuid',
    'created_at',
    'feature',
    'key_management',
    'outcome',
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
>;

type LedgerCursor = { createdAt: Date; uuid: string };

const toCount = (value: string | null): number | null =>
    value === null ? null : Number(value);

/**
 * Credits consumed by an organisation, always derived from the ledger and the
 * rate card in force at each call. Nothing here is cached in the database.
 */
export class AiCreditUsageModel {
    private readonly database: Knex;

    private readonly rateCardModel: AiCreditRateCardModel;

    private readonly entitlementModel: AiCreditEntitlementModel;

    private readonly holdModel: AiCreditHoldModel;

    private rateCardCache: {
        rows: AiCreditRateCardRow[];
        loadedAt: number;
    } | null = null;

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

    private async getRateCard(): Promise<AiCreditRateCardRow[]> {
        if (
            this.rateCardCache &&
            Date.now() - this.rateCardCache.loadedAt < RATE_CARD_TTL_MS
        ) {
            return this.rateCardCache.rows;
        }
        const rows = await this.rateCardModel.getAll();
        this.rateCardCache = { rows, loadedAt: Date.now() };
        return rows;
    }

    private static priceLedgerRow(
        rateCard: AiCreditRateCardRow[],
        row: LedgerUsageRow,
    ): number {
        if (
            row.provider === null ||
            row.model === null ||
            !isAiUsageBillable({
                feature: row.feature,
                keyOrigin: row.key_management,
                outcome: row.outcome,
            })
        ) {
            return 0;
        }
        return (
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
            }) ?? 0
        );
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
        const pageTotal = rows.reduce(
            (sum, row) =>
                sum + AiCreditUsageModel.priceLedgerRow(rateCard, row),
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

    /** Billable credits an organisation consumed inside a window. */
    async sumCredits(
        organizationUuid: string,
        period: AiCreditPeriod,
    ): Promise<number> {
        return this.sumLedgerPages(
            organizationUuid,
            period,
            await this.getRateCard(),
            null,
            0,
        );
    }

    /**
     * The window a call is charged to: the entitlement covering it when the
     * organisation has one, otherwise its calendar month.
     */
    async getPeriod(
        organizationUuid: string,
        at: Date,
    ): Promise<AiCreditPeriod> {
        const entitlement = await this.entitlementModel.findCovering(
            organizationUuid,
            at,
        );
        return entitlement ?? getCalendarMonthPeriod(at);
    }

    /**
     * Runs after a call is recorded, off the request path. When the call is
     * billable and the organisation's current entitlement has an allowance,
     * compares the window's usage with it and places a hold that expires with
     * the window once the allowance is used up. Nothing enforces the hold yet.
     */
    async onUsageRecorded(
        event: AiUsageEvent,
        at: Date = new Date(),
    ): Promise<void> {
        const { properties } = event;
        if (
            properties.organizationId === null ||
            !isAiUsageBillable({
                feature: properties.feature,
                keyOrigin: properties.keyManagement,
                outcome: properties.outcome,
            })
        ) {
            return;
        }
        const entitlement = await this.entitlementModel.findCovering(
            properties.organizationId,
            at,
        );
        if (entitlement === null || entitlement.allowanceCredits === null) {
            return;
        }
        const used = await this.sumCredits(
            properties.organizationId,
            entitlement,
        );
        if (used < entitlement.allowanceCredits) return;
        const active = await this.holdModel.findActive(
            properties.organizationId,
            at,
        );
        if (active.some((hold) => hold.reason === 'allowance_exhausted')) {
            return;
        }
        await this.holdModel.place({
            organizationUuid: properties.organizationId,
            userUuid: null,
            reason: 'allowance_exhausted',
            notes: null,
            placedBy: 'system',
            expiresAt: entitlement.periodEnd,
        });
        Logger.info(
            `AI credit allowance exhausted for organization ${properties.organizationId}: ${used} of ${entitlement.allowanceCredits} credits used, hold placed until ${entitlement.periodEnd.toISOString()}`,
        );
    }
}
