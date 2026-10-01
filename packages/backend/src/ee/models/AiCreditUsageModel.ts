import {
    AI_BILLABLE_FEATURES,
    assertUnreachable,
    calculateAiCredits,
    findAiCreditRate,
    getAiCreditContractWindow,
    isAiCreditAllowanceAlertPlanSettled,
    planAiCreditAllowanceAlerts,
    type AiCreditAllowanceAlertRecord,
    type AiCreditDailyUsage,
    type AiCreditPeriod,
    type AiCreditRateCardRow,
    type AiCreditUsageBreakdown,
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
import { EmailTableName } from '../../database/entities/emails';
import { OrganizationTableName } from '../../database/entities/organizations';
import { ProjectTableName } from '../../database/entities/projects';
import { UserTableName } from '../../database/entities/users';
import Logger from '../../logging/logger';
import { AiAgentTableName } from '../database/entities/aiAgent';
import { type AiCreditAllowanceAlertModel } from './AiCreditAllowanceAlertModel';
import {
    hasAllowance,
    type AiCreditContractModel,
    type AiCreditContractWithAllowance,
} from './AiCreditContractModel';
import {
    breakdownHasNames,
    buildAiCreditDailyUsage,
    type AiCreditDailyUsageBucket,
    type AiCreditDailyUsageEntry,
} from './aiCreditDailyUsage';
import { type AiCreditHoldModel } from './AiCreditHoldModel';
import { type AiCreditRateCardModel } from './AiCreditRateCardModel';

type Dependencies = {
    database: Knex;
    rateCardModel: AiCreditRateCardModel;
    contractModel: AiCreditContractModel;
    holdModel: AiCreditHoldModel;
    allowanceAlertModel: AiCreditAllowanceAlertModel;
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

export type LedgerDailyUsageGroup = PricedTokenGroup & {
    day: string;
    breakdown_key: string | null;
    is_embedded_viewer: boolean;
};

const BREAKDOWN_COLUMNS: Record<AiCreditUsageBreakdown, keyof DbAiUsageLedger> =
    {
        feature: 'feature',
        channel: 'usage_channel',
        user: 'user_uuid',
        project: 'project_uuid',
        agent: 'agent_uuid',
    };

export const toDailyUsageBucket = (
    breakdown: AiCreditUsageBreakdown,
    group: Pick<LedgerDailyUsageGroup, 'breakdown_key' | 'is_embedded_viewer'>,
): AiCreditDailyUsageBucket => {
    // Every embedded viewer acts as the embed's service user, so their calls are grouped rather than listed.
    if (breakdown === 'user' && group.is_embedded_viewer) {
        return { type: 'embeddedViewers' };
    }
    return group.breakdown_key === null
        ? { type: 'unattributed' }
        : { type: 'value', key: group.breakdown_key };
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

type PricedTokenGroup = Pick<
    LedgerUsageGroup,
    | 'provider'
    | 'model'
    | 'priced_at'
    | 'uncached_input_tokens'
    | 'output_tokens'
    | 'cache_read_tokens'
    | 'cache_write_tokens'
>;

/** Null when the rate card has no row for the group's model. */
export const priceUsageGroup = (
    rateCard: AiCreditRateCardRow[],
    group: PricedTokenGroup,
): { credits: number; tier: string } | null => {
    const rate =
        group.provider === null || group.model === null
            ? null
            : findAiCreditRate(rateCard, {
                  provider: group.provider,
                  model: group.model,
                  at: group.priced_at,
              });
    if (rate === null) return null;
    // The uncached input is clamped per call in SQL, so the tokens are passed pre-split.
    const credits = calculateAiCredits(
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
    );
    return { credits, tier: rate.tier };
};

export const accumulateUsage = (
    rateCard: AiCreditRateCardRow[],
    acc: AiCreditUsageAccumulator,
    group: LedgerUsageGroup,
): AiCreditUsageAccumulator => {
    const tokens = Number(group.total_tokens);
    const priced = priceUsageGroup(rateCard, group);
    if (priced === null) {
        return { ...acc, unpricedTokens: acc.unpricedTokens + tokens };
    }
    const totals: AiCreditUsageTotals = {
        credits: priced.credits,
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
            byTier: addKeyed(acc.byTier, priced.tier, totals),
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

    private readonly allowanceAlertModel: AiCreditAllowanceAlertModel;

    constructor({
        database,
        rateCardModel,
        contractModel,
        holdModel,
        allowanceAlertModel,
    }: Dependencies) {
        this.database = database;
        this.rateCardModel = rateCardModel;
        this.contractModel = contractModel;
        this.holdModel = holdModel;
        this.allowanceAlertModel = allowanceAlertModel;
    }

    private rateSegment(rateBoundaries: Date[]): Knex.Raw {
        return rateBoundaries.length === 0
            ? this.database.raw('0')
            : this.database.raw(
                  `width_bucket(created_at, ARRAY[${rateBoundaries
                      .map(() => '?')
                      .join(', ')}]::timestamptz[])`,
                  rateBoundaries,
              );
    }

    private tokenAggregates(): Knex.Raw[] {
        return [
            this.database.raw('min(created_at) as priced_at'),
            this.database.raw('count(*) as calls'),
            this.database.raw('coalesce(sum(total_tokens), 0) as total_tokens'),
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
        ];
    }

    // Pricing is linear in tokens, so calls sharing a model and a rate card segment can be summed before pricing.
    private async groupUsage(
        organizationUuid: string,
        period: AiCreditPeriod,
        rateBoundaries: Date[],
    ): Promise<LedgerUsageGroup[]> {
        const rateSegment = this.rateSegment(rateBoundaries);
        return this.database(AiUsageLedgerTableName)
            .select(
                'feature',
                'key_management',
                'outcome',
                'usage_channel',
                'provider',
                'model',
                ...this.tokenAggregates(),
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

    // Billable calls only, filtered in SQL with the same rule as isAiUsageBillable.
    private async groupBillableUsageByDay(
        organizationUuid: string,
        period: AiCreditPeriod,
        breakdown: AiCreditUsageBreakdown,
        rateBoundaries: Date[],
    ): Promise<LedgerDailyUsageGroup[]> {
        const day = this.database.raw(
            `to_char(created_at at time zone 'UTC', 'YYYY-MM-DD')`,
        );
        const embedded = this.database.raw('(external_user_id is not null)');
        const column = BREAKDOWN_COLUMNS[breakdown];
        return (
            this.database(AiUsageLedgerTableName)
                .select(
                    this.database.raw(`${day.toQuery()} as day`),
                    `${column} as breakdown_key`,
                    this.database.raw(
                        `${embedded.toQuery()} as is_embedded_viewer`,
                    ),
                    'provider',
                    'model',
                    ...this.tokenAggregates(),
                )
                .where({
                    organization_uuid: organizationUuid,
                    key_management: BILLABLE_KEY_MANAGEMENT,
                    outcome: BILLABLE_OUTCOME,
                })
                .whereIn('feature', BILLABLE_FEATURE_LIST)
                .where('created_at', '>=', period.periodStart)
                .where('created_at', '<', period.periodEnd)
                // Plain columns first: knex drops the rest when the first argument is a raw expression.
                .groupBy(
                    column,
                    'provider',
                    'model',
                    day,
                    embedded,
                    this.rateSegment(rateBoundaries),
                )
        );
    }

    // Names are scoped to the organization; a key with no row here was deleted.
    private async findBreakdownNames(
        organizationUuid: string,
        breakdown: AiCreditUsageBreakdown,
        keys: string[],
    ): Promise<Map<string, string>> {
        if (keys.length === 0) return new Map();
        switch (breakdown) {
            case 'user': {
                const rows: { key: string; name: string }[] =
                    await this.database(UserTableName)
                        .leftJoin(EmailTableName, function joinPrimaryEmail() {
                            this.on(
                                `${EmailTableName}.user_id`,
                                '=',
                                `${UserTableName}.user_id`,
                            ).andOnVal(`${EmailTableName}.is_primary`, true);
                        })
                        .whereIn(`${UserTableName}.user_uuid`, keys)
                        .select(
                            `${UserTableName}.user_uuid as key`,
                            this.database.raw(
                                `coalesce(nullif(trim(concat_ws(' ', ${UserTableName}.first_name, ${UserTableName}.last_name)), ''), ${EmailTableName}.email, 'Unnamed user') as name`,
                            ),
                        );
                return new Map(rows.map(({ key, name }) => [key, name]));
            }
            case 'project': {
                const rows: { key: string; name: string }[] =
                    await this.database(ProjectTableName)
                        .innerJoin(
                            OrganizationTableName,
                            `${OrganizationTableName}.organization_id`,
                            `${ProjectTableName}.organization_id`,
                        )
                        .where(
                            `${OrganizationTableName}.organization_uuid`,
                            organizationUuid,
                        )
                        .whereIn(`${ProjectTableName}.project_uuid`, keys)
                        .select(
                            `${ProjectTableName}.project_uuid as key`,
                            `${ProjectTableName}.name as name`,
                        );
                return new Map(rows.map(({ key, name }) => [key, name]));
            }
            case 'agent': {
                const rows: { key: string; name: string }[] =
                    await this.database(AiAgentTableName)
                        .where('organization_uuid', organizationUuid)
                        .whereIn('ai_agent_uuid', keys)
                        .select('ai_agent_uuid as key', 'name');
                return new Map(rows.map(({ key, name }) => [key, name]));
            }
            case 'feature':
            case 'channel':
                return new Map();
            default:
                return assertUnreachable(
                    breakdown,
                    `Unknown AI credit usage breakdown ${breakdown}`,
                );
        }
    }

    /** Billable credits per UTC day of the period, split by one breakdown. */
    async summarizeByDay(
        organizationUuid: string,
        period: AiCreditPeriod,
        breakdown: AiCreditUsageBreakdown,
    ): Promise<AiCreditDailyUsage> {
        const rateCard = await this.rateCardModel.getAll();
        const groups = await this.groupBillableUsageByDay(
            organizationUuid,
            period,
            breakdown,
            toRateBoundaries(rateCard),
        );
        const entries = groups.flatMap<AiCreditDailyUsageEntry>((group) => {
            const priced = priceUsageGroup(rateCard, group);
            return priced === null
                ? []
                : [
                      {
                          date: group.day,
                          bucket: toDailyUsageBucket(breakdown, group),
                          credits: priced.credits,
                      },
                  ];
        });
        const names = breakdownHasNames(breakdown)
            ? await this.findBreakdownNames(organizationUuid, breakdown, [
                  ...new Set(
                      entries.flatMap(({ bucket }) =>
                          bucket.type === 'value' ? [bucket.key] : [],
                      ),
                  ),
              ])
            : null;
        return buildAiCreditDailyUsage({ period, breakdown, entries, names });
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
        window: AiCreditPeriod,
        used: number,
    ): Promise<void> {
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

    private async recordAllowanceAlerts(
        contract: AiCreditContractWithAllowance,
        window: AiCreditPeriod,
        used: number,
        records: AiCreditAllowanceAlertRecord[],
    ): Promise<void> {
        const plan = planAiCreditAllowanceAlerts({
            usedCredits: used,
            allowanceCredits: contract.allowanceCredits,
            records,
        });
        await this.allowanceAlertModel.rearm(contract, window, plan.rearmed);
        await this.allowanceAlertModel.carryOver(
            contract,
            window,
            plan.carriedOver,
        );
        await this.allowanceAlertModel.recordReached(
            contract,
            window,
            plan.reached,
            used,
        );
    }

    // One sum serves both the hold and the alerts, and is skipped once neither can change.
    private async evaluateAllowance(
        contract: AiCreditContractWithAllowance,
        at: Date,
    ): Promise<void> {
        const window = getAiCreditContractWindow(contract, at);
        if (window === null) return;
        const [hold, alerts] = await Promise.all([
            this.holdModel.findAllowanceExhaustedHold(contract, window),
            this.allowanceAlertModel.findForWindow(contract, window),
        ]);
        if (
            hold !== undefined &&
            isAiCreditAllowanceAlertPlanSettled(
                alerts,
                contract.allowanceCredits,
            )
        ) {
            return;
        }
        const used = await this.sumCredits(contract.organizationUuid, window);
        await this.recordAllowanceAlerts(contract, window, used, alerts);
        if (hold === undefined) {
            await this.placeHoldIfExhausted(contract, window, used);
        }
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
        await this.evaluateAllowance(contract, at);
    }
}
