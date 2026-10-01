import { AI_CREDIT_HOLD_REASONS, type AiCreditPeriod } from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { type AiUsageEvent } from '../../../../analytics/aiUsage';
import { AiUsageLedgerModel } from '../../../../models/AiUsageLedgerModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../../testing/migratedDatabase';
import { AiCreditAllowanceAlertModel } from '../../../models/AiCreditAllowanceAlertModel';
import { AiCreditContractModel } from '../../../models/AiCreditContractModel';
import { AiCreditHoldModel } from '../../../models/AiCreditHoldModel';
import { AiCreditRateCardModel } from '../../../models/AiCreditRateCardModel';
import { AiCreditUsageModel } from '../../../models/AiCreditUsageModel';

// One million uncached Sonnet 5 input tokens on the seeded card is 40 credits.
const SONNET_INPUT_MTOK_CREDITS = 40;

const usageEvent = (
    organizationUuid: string,
    overrides: Partial<AiUsageEvent['properties']> = {},
): AiUsageEvent => ({
    event: 'ai.usage',
    userId: randomUUID(),
    properties: {
        eventId: randomUUID(),
        outcome: 'complete',
        feature: 'agent',
        functionId: 'streamAgentResponse',
        organizationId: organizationUuid,
        projectId: null,
        aiAgentId: null,
        threadId: randomUUID(),
        promptId: null,
        dataAppId: null,
        model: 'claude-sonnet-5',
        provider: 'anthropic',
        keyManagement: 'lightdash-managed',
        managedAgentRunId: null,
        deepResearchRunId: null,
        deepResearchPhase: null,
        channel: null,
        externalUserId: null,
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: null,
        totalTokens: 1_000_000,
        ...overrides,
    },
});

describe('AI credit contracts, holds and usage on the real PostgreSQL schema', () => {
    let migrated: MigratedDatabase;
    let transaction: Knex.Transaction;
    let organizationUuid: string;
    let ledger: AiUsageLedgerModel;
    let holds: AiCreditHoldModel;
    let usage: AiCreditUsageModel;
    const now = new Date('2026-09-29T12:00:00Z');
    const period: AiCreditPeriod = {
        periodStart: new Date('2026-09-15T00:00:00Z'),
        periodEnd: new Date('2026-10-15T00:00:00Z'),
    };

    const record = async (event: AiUsageEvent, at: Date = now) => {
        await ledger.recordEvent(event);
        await transaction.raw(
            'UPDATE ai_usage_ledger SET created_at = ? WHERE event_id = ?',
            [at, event.properties.eventId],
        );
    };

    const recordAndEvaluate = async (event: AiUsageEvent) => {
        await record(event);
        await usage.onUsageRecorded(event, now);
    };

    // Console writes the contract row directly, so the tests do too.
    const saveContract = async (
        allowanceCredits: number | null,
        overrides: {
            resetIntervalMonths?: number;
            endsAt?: Date | null;
            allowanceMode?: 'warn' | 'enforce';
        } = {},
    ): Promise<string> => {
        const values = {
            organization_uuid: organizationUuid,
            starts_at: new Date('2026-01-15T00:00:00Z'),
            ends_at: overrides.endsAt ?? null,
            reset_interval_months: overrides.resetIntervalMonths ?? 1,
            allowance_credits: allowanceCredits,
            allowance_mode: overrides.allowanceMode ?? 'warn',
        };
        const [{ ai_credit_contract_uuid: uuid }] = await transaction(
            'ai_credit_contracts',
        )
            .insert(values)
            .onConflict('organization_uuid')
            .merge(values)
            .returning('ai_credit_contract_uuid');
        return uuid;
    };

    const evaluate = () =>
        usage.onUsageRecorded(usageEvent(organizationUuid), now);

    const insertHold = async (
        hold: { reason?: string; expires_at?: Date | null } = {},
    ): Promise<string> => {
        const {
            rows: [{ ai_credit_hold_uuid: uuid }],
        } = await transaction.raw<{ rows: { ai_credit_hold_uuid: string }[] }>(
            `INSERT INTO ai_credit_holds (organization_uuid, reason, notes, placed_by, expires_at)
             VALUES (?, ?, 'operator note', 'operator@lightdash.com', ?)
             RETURNING ai_credit_hold_uuid`,
            [
                organizationUuid,
                hold.reason ?? 'manual_pause',
                hold.expires_at ?? null,
            ],
        );
        return uuid;
    };

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
    });

    beforeEach(async () => {
        transaction = await migrated.database.transaction();
        [{ organization_uuid: organizationUuid }] = await transaction(
            'organizations',
        )
            .insert({ organization_name: `ai credits ${randomUUID()}` })
            .returning('organization_uuid');
        ledger = new AiUsageLedgerModel({ database: transaction });
        holds = new AiCreditHoldModel({ database: transaction });
        usage = new AiCreditUsageModel({
            database: transaction,
            rateCardModel: new AiCreditRateCardModel({ database: transaction }),
            contractModel: new AiCreditContractModel({
                database: transaction,
            }),
            holdModel: holds,
            allowanceAlertModel: new AiCreditAllowanceAlertModel({
                database: transaction,
            }),
        });
    });

    afterEach(async () => {
        await transaction.rollback();
    });

    afterAll(async () => {
        await migrated.destroy();
    });

    describe('usage in a period', () => {
        test('sums only billable calls, priced with the rate card', async () => {
            await record(usageEvent(organizationUuid));
            await record(usageEvent(organizationUuid));
            await record(
                usageEvent(organizationUuid, { keyManagement: 'self-managed' }),
            );
            await record(
                usageEvent(organizationUuid, { feature: 'review-classifier' }),
            );
            await record(
                usageEvent(organizationUuid, {
                    feature: 'data-app',
                    outcome: 'failed',
                }),
            );

            expect(
                await usage.sumCredits(organizationUuid, period),
            ).toBeCloseTo(2 * SONNET_INPUT_MTOK_CREDITS, 6);
        });

        test('a model without a rate card row adds nothing rather than failing', async () => {
            await record(
                usageEvent(organizationUuid, {
                    provider: 'google',
                    model: 'gemini-3.8-flash',
                }),
            );
            expect(await usage.sumCredits(organizationUuid, period)).toBe(0);
        });

        test('prices each call with the rate in force when it was made', async () => {
            await transaction('ai_credit_rate_card').insert({
                provider: 'anthropic',
                pricing_scope: '__default__',
                model_key: 'claude-sonnet-5',
                tier: 'standard',
                input_credits_per_mtok: 2 * SONNET_INPUT_MTOK_CREDITS,
                output_credits_per_mtok: 400,
                cache_read_credits_per_mtok: 8,
                cache_write_credits_per_mtok: 100,
                effective_from: new Date('2026-09-20T00:00:00Z'),
            });
            await record(
                usageEvent(organizationUuid),
                new Date('2026-09-16T00:00:00Z'),
            );
            await record(usageEvent(organizationUuid), now);

            expect(
                await usage.sumCredits(organizationUuid, period),
            ).toBeCloseTo(3 * SONNET_INPUT_MTOK_CREDITS, 6);
        });
    });

    describe('hold placement from the sink', () => {
        test('the call that reaches the allowance places one hold that expires with the window', async () => {
            await saveContract(2 * SONNET_INPUT_MTOK_CREDITS);

            await recordAndEvaluate(usageEvent(organizationUuid));
            expect(await holds.findActive(organizationUuid, now)).toEqual([]);

            await recordAndEvaluate(usageEvent(organizationUuid));
            const active = await holds.findActive(organizationUuid, now);
            expect(active).toHaveLength(1);
            expect(active[0]).toMatchObject({
                reason: 'allowance_exhausted',
                placedBy: 'system',
                userUuid: null,
                notes: null,
            });
            expect(active[0].expiresAt?.toISOString()).toBe(
                period.periodEnd.toISOString(),
            );

            await recordAndEvaluate(usageEvent(organizationUuid));
            expect(await holds.findActive(organizationUuid, now)).toHaveLength(
                1,
            );
        });

        test('concurrent calls that reach the allowance place one hold', async () => {
            await saveContract(SONNET_INPUT_MTOK_CREDITS);
            const events = [1, 2, 3].map(() => usageEvent(organizationUuid));
            await Promise.all(events.map((event) => record(event)));

            await Promise.all(
                events.map((event) => usage.onUsageRecorded(event, now)),
            );

            expect(await holds.findActive(organizationUuid, now)).toHaveLength(
                1,
            );
        });

        test('a hold released early is not placed again in the same window', async () => {
            await saveContract(SONNET_INPUT_MTOK_CREDITS);
            await recordAndEvaluate(usageEvent(organizationUuid));
            await transaction('ai_credit_holds')
                .where({ organization_uuid: organizationUuid })
                .update({ released_at: now });

            await recordAndEvaluate(usageEvent(organizationUuid));

            expect(await holds.findActive(organizationUuid, now)).toEqual([]);
        });

        test('only usage in the current window counts toward its allowance', async () => {
            await saveContract(SONNET_INPUT_MTOK_CREDITS);
            await record(
                usageEvent(organizationUuid),
                new Date('2026-09-10T00:00:00Z'),
            );
            await usage.onUsageRecorded(usageEvent(organizationUuid), now);

            expect(await holds.findActive(organizationUuid, now)).toEqual([]);
        });

        test('a quarterly contract counts usage across the whole quarter', async () => {
            await saveContract(2 * SONNET_INPUT_MTOK_CREDITS, {
                resetIntervalMonths: 3,
            });
            await record(
                usageEvent(organizationUuid),
                new Date('2026-09-02T00:00:00Z'),
            );
            await recordAndEvaluate(usageEvent(organizationUuid));

            const active = await holds.findActive(organizationUuid, now);
            expect(active).toHaveLength(1);
            expect(active[0].expiresAt?.toISOString()).toBe(
                '2026-10-15T00:00:00.000Z',
            );
        });

        test('never places a hold without an agreed allowance', async () => {
            await saveContract(null);
            await recordAndEvaluate(usageEvent(organizationUuid));
            expect(await holds.findActive(organizationUuid, now)).toEqual([]);
        });

        test('never places a hold for an organization with no contract', async () => {
            await recordAndEvaluate(usageEvent(organizationUuid));
            expect(await holds.findActive(organizationUuid, now)).toEqual([]);
        });
    });

    describe('changing a contract', () => {
        test('raising the allowance above usage lifts the hold straight away', async () => {
            await saveContract(SONNET_INPUT_MTOK_CREDITS);
            await recordAndEvaluate(usageEvent(organizationUuid));
            expect(await holds.findActive(organizationUuid, now)).toHaveLength(
                1,
            );

            await saveContract(10 * SONNET_INPUT_MTOK_CREDITS);

            expect(await holds.findActive(organizationUuid, now)).toEqual([]);
        });

        test('an allowance raised to no more than usage is held again on the next call', async () => {
            await saveContract(SONNET_INPUT_MTOK_CREDITS);
            await recordAndEvaluate(usageEvent(organizationUuid));
            await recordAndEvaluate(usageEvent(organizationUuid));

            await saveContract(2 * SONNET_INPUT_MTOK_CREDITS);
            await evaluate();

            expect(await holds.findActive(organizationUuid, now)).toHaveLength(
                1,
            );
        });

        test('lowering the allowance below usage holds the organization on the next call', async () => {
            await saveContract(10 * SONNET_INPUT_MTOK_CREDITS);
            await recordAndEvaluate(usageEvent(organizationUuid));

            await saveContract(SONNET_INPUT_MTOK_CREDITS);
            await evaluate();

            expect(await holds.findActive(organizationUuid, now)).toHaveLength(
                1,
            );
        });

        test('a hold stops applying when the contract ends', async () => {
            await saveContract(SONNET_INPUT_MTOK_CREDITS);
            await recordAndEvaluate(usageEvent(organizationUuid));

            await saveContract(SONNET_INPUT_MTOK_CREDITS, {
                endsAt: new Date('2026-10-01T00:00:00Z'),
            });

            expect(await holds.findActive(organizationUuid, now)).toHaveLength(
                1,
            );
            expect(
                await holds.findActive(
                    organizationUuid,
                    new Date('2026-10-02T00:00:00Z'),
                ),
            ).toEqual([]);
        });

        test('changing the reset interval lifts the hold for the old window', async () => {
            await saveContract(SONNET_INPUT_MTOK_CREDITS);
            await recordAndEvaluate(usageEvent(organizationUuid));

            await saveContract(SONNET_INPUT_MTOK_CREDITS, {
                resetIntervalMonths: 12,
            });

            expect(await holds.findActive(organizationUuid, now)).toEqual([]);
        });

        test('a manual pause is not affected by the contract', async () => {
            await saveContract(SONNET_INPUT_MTOK_CREDITS);
            await insertHold();
            await saveContract(10 * SONNET_INPUT_MTOK_CREDITS);

            expect(await holds.findActive(organizationUuid, now)).toHaveLength(
                1,
            );
        });

        test('an allowance hold without a contract never applies', async () => {
            await insertHold({
                reason: 'allowance_exhausted',
                expires_at: period.periodEnd,
            });

            expect(await holds.findActive(organizationUuid, now)).toEqual([]);
        });

        test('an organization has one contract', async () => {
            await saveContract(SONNET_INPUT_MTOK_CREDITS);
            await expect(
                transaction('ai_credit_contracts').insert({
                    organization_uuid: organizationUuid,
                    starts_at: now,
                    ends_at: null,
                    reset_interval_months: 1,
                    allowance_credits: null,
                }),
            ).rejects.toThrow(/unique/);
        });

        test('rejects an interval under a month', async () => {
            await expect(
                saveContract(null, { resetIntervalMonths: 0 }),
            ).rejects.toThrow(/ai_credit_contracts_reset_interval_check/);
        });

        test('rejects an end before the start', async () => {
            await expect(
                saveContract(null, {
                    endsAt: new Date('2025-01-01T00:00:00Z'),
                }),
            ).rejects.toThrow(/ai_credit_contracts_period_check/);
        });
    });

    describe('ledger retention', () => {
        const retentionCutoffDays = 90;
        const longAgo = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);

        const cleanUpAndCountRemaining = async () => {
            const retained = await new AiCreditContractModel({
                database: transaction,
            }).findOrganizationUuidsResettingEvery(3);
            await ledger.deleteOlderThan(retentionCutoffDays, retained);
            const rows = await transaction('ai_usage_ledger').where({
                organization_uuid: organizationUuid,
            });
            return rows.length;
        };

        test('an organization on a yearly contract keeps usage older than the retention window', async () => {
            await saveContract(null, { resetIntervalMonths: 12 });
            await record(usageEvent(organizationUuid), longAgo);

            expect(await cleanUpAndCountRemaining()).toBe(1);
        });

        test('an organization on a quarterly contract keeps usage older than the retention window', async () => {
            await saveContract(null, { resetIntervalMonths: 3 });
            await record(usageEvent(organizationUuid), longAgo);

            expect(await cleanUpAndCountRemaining()).toBe(1);
        });

        test('an organization on a monthly contract loses usage older than the retention window', async () => {
            await saveContract(null, { resetIntervalMonths: 1 });
            await record(usageEvent(organizationUuid), longAgo);

            expect(await cleanUpAndCountRemaining()).toBe(0);
        });

        test('an organization without a contract loses usage older than the retention window', async () => {
            await record(usageEvent(organizationUuid), longAgo);

            expect(await cleanUpAndCountRemaining()).toBe(0);
        });
    });

    describe('daily usage', () => {
        const at = (day: string) => new Date(`${day}T12:00:00Z`);

        test('splits billable credits by day and channel, with empty days kept', async () => {
            await record(
                usageEvent(organizationUuid, { channel: 'web' }),
                at('2026-09-16'),
            );
            await record(
                usageEvent(organizationUuid, { channel: 'slack' }),
                at('2026-09-16'),
            );
            await record(
                usageEvent(organizationUuid, { channel: 'web' }),
                at('2026-09-18'),
            );
            await record(
                usageEvent(organizationUuid, {
                    channel: 'web',
                    keyManagement: 'self-managed',
                }),
                at('2026-09-18'),
            );
            await record(
                usageEvent(organizationUuid, {
                    channel: 'web',
                    feature: 'review-classifier',
                }),
                at('2026-09-18'),
            );

            const daily = await usage.summarizeByDay(
                organizationUuid,
                period,
                'channel',
            );

            expect(daily.series).toEqual([
                expect.objectContaining({ key: 'web', name: null }),
                expect.objectContaining({ key: 'slack', name: null }),
            ]);
            const credits = (day: string) =>
                daily.days.find((d) => d.date === day)?.credits;
            expect(credits('2026-09-16')?.[0]).toBeCloseTo(
                SONNET_INPUT_MTOK_CREDITS,
                6,
            );
            expect(credits('2026-09-16')?.[1]).toBeCloseTo(
                SONNET_INPUT_MTOK_CREDITS,
                6,
            );
            expect(credits('2026-09-17')).toEqual([0, 0]);
            expect(credits('2026-09-18')?.[0]).toBeCloseTo(
                SONNET_INPUT_MTOK_CREDITS,
                6,
            );
            expect(credits('2026-09-18')?.[1]).toBe(0);
            expect(daily.days).toHaveLength(30);
        });

        test('names projects and groups deleted and unattributed usage', async () => {
            const {
                rows: [{ project_uuid: projectUuid }],
            } = await transaction.raw<{ rows: { project_uuid: string }[] }>(
                `INSERT INTO projects (name, organization_id)
                 SELECT 'Marketing', organization_id FROM organizations WHERE organization_uuid = ?
                 RETURNING project_uuid`,
                [organizationUuid],
            );
            await record(
                usageEvent(organizationUuid, { projectId: projectUuid }),
                at('2026-09-16'),
            );
            await record(
                usageEvent(organizationUuid, { projectId: projectUuid }),
                at('2026-09-16'),
            );
            await record(
                usageEvent(organizationUuid, { projectId: randomUUID() }),
                at('2026-09-16'),
            );
            await record(
                usageEvent(organizationUuid, { projectId: null }),
                at('2026-09-16'),
            );

            const daily = await usage.summarizeByDay(
                organizationUuid,
                period,
                'project',
            );

            expect(daily.series.map((series) => series.type)).toEqual([
                'value',
                'deleted',
                'unattributed',
            ]);
            expect(daily.series[0]).toEqual(
                expect.objectContaining({
                    key: projectUuid,
                    name: 'Marketing',
                }),
            );
        });

        test('groups embedded viewers instead of listing them', async () => {
            await record(
                usageEvent(organizationUuid, { externalUserId: 'viewer-1' }),
                at('2026-09-16'),
            );
            await record(
                usageEvent(organizationUuid, { externalUserId: 'viewer-2' }),
                at('2026-09-16'),
            );

            const daily = await usage.summarizeByDay(
                organizationUuid,
                period,
                'user',
            );

            expect(daily.series).toEqual([
                {
                    type: 'embeddedViewers',
                    credits: expect.closeTo(2 * SONNET_INPUT_MTOK_CREDITS, 6),
                },
            ]);
        });
    });

    describe('pausing billable AI', () => {
        const blockingReason = async (at: Date = now) =>
            (await holds.findBlocking(organizationUuid, at))?.reason ?? null;

        test('a used-up allowance keeps AI working on a warn-only contract', async () => {
            await saveContract(SONNET_INPUT_MTOK_CREDITS);
            await recordAndEvaluate(usageEvent(organizationUuid));

            expect(await holds.findActive(organizationUuid, now)).toHaveLength(
                1,
            );
            expect(await blockingReason()).toBeNull();
        });

        test('a used-up allowance pauses AI on an enforced contract', async () => {
            await saveContract(SONNET_INPUT_MTOK_CREDITS, {
                allowanceMode: 'enforce',
            });
            await recordAndEvaluate(usageEvent(organizationUuid));

            expect(await blockingReason()).toBe('allowance_exhausted');
        });

        test('switching the contract to warn-only or raising the allowance lifts the pause straight away', async () => {
            await saveContract(SONNET_INPUT_MTOK_CREDITS, {
                allowanceMode: 'enforce',
            });
            await recordAndEvaluate(usageEvent(organizationUuid));

            await saveContract(SONNET_INPUT_MTOK_CREDITS, {
                allowanceMode: 'warn',
            });
            expect(await blockingReason()).toBeNull();

            await saveContract(10 * SONNET_INPUT_MTOK_CREDITS, {
                allowanceMode: 'enforce',
            });
            expect(await blockingReason()).toBeNull();
        });

        test('a manual pause pauses AI whatever the contract says, until it is released', async () => {
            await saveContract(null);
            const uuid = await insertHold({ reason: 'manual_pause' });
            expect(await blockingReason()).toBe('manual_pause');

            await transaction('ai_credit_holds')
                .where({ ai_credit_hold_uuid: uuid })
                .update({ released_at: now });
            expect(await blockingReason()).toBeNull();
        });

        test('a pause stops applying once it expires', async () => {
            await insertHold({
                reason: 'trial_ended',
                expires_at: period.periodEnd,
            });
            expect(await blockingReason()).toBe('trial_ended');
            expect(await blockingReason(period.periodEnd)).toBeNull();
        });

        test('rejects an allowance mode outside warn and enforce', async () => {
            await saveContract(null);
            await expect(
                transaction('ai_credit_contracts')
                    .where({ organization_uuid: organizationUuid })
                    .update({ allowance_mode: 'grace' as never }),
            ).rejects.toThrow(/ai_credit_contracts_allowance_mode_check/);
        });
    });

    describe('holds', () => {
        test('a hold stops being active at its expiry and can be released earlier', async () => {
            const uuid = await insertHold({ expires_at: period.periodEnd });
            expect(
                (await holds.findActive(organizationUuid, now)).map(
                    (hold) => hold.uuid,
                ),
            ).toEqual([uuid]);
            expect(
                await holds.findActive(organizationUuid, period.periodEnd),
            ).toEqual([]);

            await transaction('ai_credit_holds')
                .where({ ai_credit_hold_uuid: uuid })
                .update({ released_at: now });
            expect(await holds.findActive(organizationUuid, now)).toEqual([]);
        });

        test('a manual pause with no expiry stays active', async () => {
            await insertHold();
            expect(
                await holds.findActive(
                    organizationUuid,
                    new Date('2030-01-01T00:00:00Z'),
                ),
            ).toHaveLength(1);
        });

        test('rejects a reason outside the fixed list', async () => {
            await expect(insertHold({ reason: 'because' })).rejects.toThrow(
                /ai_credit_holds_reason_check/,
            );
        });

        test('the database accepts exactly the shared hold reasons', async () => {
            const {
                rows: [{ definition }],
            } = await transaction.raw<{ rows: { definition: string }[] }>(
                `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname = 'ai_credit_holds_reason_check'`,
            );
            const allowed = [...definition.matchAll(/'([a-z_]+)'::text/g)].map(
                ([, reason]) => reason,
            );
            expect(allowed.sort()).toEqual([...AI_CREDIT_HOLD_REASONS].sort());
        });
    });

    describe('usage summary for a period', () => {
        test('splits calls into billable, self-managed and excluded, with breakdowns', async () => {
            await record(usageEvent(organizationUuid));
            await record(
                usageEvent(organizationUuid, {
                    model: 'claude-opus-5',
                    inputTokens: 100_000,
                    totalTokens: 100_000,
                }),
            );
            await record(
                usageEvent(organizationUuid, { keyManagement: 'self-managed' }),
            );
            await record(
                usageEvent(organizationUuid, { feature: 'review-classifier' }),
            );
            await record(
                usageEvent(organizationUuid, {
                    feature: 'data-app',
                    outcome: 'failed',
                }),
            );
            await record(
                usageEvent(organizationUuid, {
                    provider: 'google',
                    model: 'gemini-3.8-flash',
                    inputTokens: 500,
                    totalTokens: 500,
                }),
            );

            const summary = await usage.summarize(organizationUuid, period);

            // 40 for a million Sonnet tokens plus 10 for a hundred thousand Opus tokens.
            expect(summary.billable.credits).toBeCloseTo(50, 6);
            expect(summary.billable.calls).toBe(2);
            expect(summary.selfManaged.credits).toBeCloseTo(40, 6);
            expect(summary.excluded.calls).toBe(2);
            expect(summary.unpricedTokens).toBe(500);
            expect(summary.byFeature).toEqual({
                agent: expect.objectContaining({ calls: 2 }),
            });
            expect(Object.keys(summary.byTier).sort()).toEqual([
                'premium',
                'standard',
            ]);
            expect(summary.byKeyOrigin['self-managed']?.calls).toBe(1);
            expect(summary.byKeyOrigin['lightdash-managed']?.calls).toBe(4);
        });

        test('only counts calls inside the period', async () => {
            await record(usageEvent(organizationUuid));
            await record(
                usageEvent(organizationUuid),
                new Date('2026-08-01T00:00:00Z'),
            );
            const summary = await usage.summarize(organizationUuid, period);
            expect(summary.billable.calls).toBe(1);
        });
    });
});
