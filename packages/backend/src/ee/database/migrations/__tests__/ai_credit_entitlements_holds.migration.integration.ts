import { AI_CREDIT_HOLD_REASONS, type AiCreditPeriod } from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { type AiUsageEvent } from '../../../../analytics/aiUsage';
import { AiUsageLedgerModel } from '../../../../models/AiUsageLedgerModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../../testing/migratedDatabase';
import { AiCreditEntitlementModel } from '../../../models/AiCreditEntitlementModel';
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

describe('AI credit entitlements, holds and usage on the real PostgreSQL schema', () => {
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

    // Console writes entitlements and holds directly, so the tests do too.
    const insertEntitlement = async (
        allowanceCredits: number | null,
        { periodStart, periodEnd }: AiCreditPeriod = period,
    ): Promise<string> => {
        const [{ ai_credit_entitlement_uuid: uuid }] = await transaction(
            'ai_credit_entitlements',
        )
            .insert({
                organization_uuid: organizationUuid,
                period_start: periodStart,
                period_end: periodEnd,
                allowance_credits: allowanceCredits,
            })
            .returning('ai_credit_entitlement_uuid');
        return uuid;
    };

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
            entitlementModel: new AiCreditEntitlementModel({
                database: transaction,
            }),
            holdModel: holds,
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
        test('the call that reaches the allowance places one hold that expires with the period', async () => {
            await insertEntitlement(2 * SONNET_INPUT_MTOK_CREDITS);

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
            await insertEntitlement(SONNET_INPUT_MTOK_CREDITS);
            const events = [1, 2, 3].map(() => usageEvent(organizationUuid));
            await Promise.all(events.map((event) => record(event)));

            await Promise.all(
                events.map((event) => usage.onUsageRecorded(event, now)),
            );

            expect(await holds.findActive(organizationUuid, now)).toHaveLength(
                1,
            );
        });

        test('a hold released early is not placed again in the same period', async () => {
            await insertEntitlement(SONNET_INPUT_MTOK_CREDITS);
            await recordAndEvaluate(usageEvent(organizationUuid));
            await transaction('ai_credit_holds')
                .where({ organization_uuid: organizationUuid })
                .update({ released_at: now });

            await recordAndEvaluate(usageEvent(organizationUuid));

            expect(await holds.findActive(organizationUuid, now)).toEqual([]);
        });

        test('an annual pool is evaluated alongside a monthly window that starts the same day', async () => {
            const year = {
                periodStart: period.periodStart,
                periodEnd: new Date('2027-09-15T00:00:00Z'),
            };
            await insertEntitlement(10 * SONNET_INPUT_MTOK_CREDITS);
            await insertEntitlement(SONNET_INPUT_MTOK_CREDITS, year);

            await recordAndEvaluate(usageEvent(organizationUuid));

            const active = await holds.findActive(organizationUuid, now);
            expect(active).toHaveLength(1);
            expect(active[0].expiresAt?.toISOString()).toBe(
                year.periodEnd.toISOString(),
            );
        });

        test('never places a hold without an agreed allowance', async () => {
            await insertEntitlement(null);
            await recordAndEvaluate(usageEvent(organizationUuid));
            expect(await holds.findActive(organizationUuid, now)).toEqual([]);
        });

        test('never places a hold for an organization with no entitlement', async () => {
            await recordAndEvaluate(usageEvent(organizationUuid));
            expect(await holds.findActive(organizationUuid, now)).toEqual([]);
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

    describe('entitlements', () => {
        test('rejects a period that ends before it starts', async () => {
            await expect(
                insertEntitlement(null, {
                    periodStart: period.periodEnd,
                    periodEnd: period.periodStart,
                }),
            ).rejects.toThrow(/ai_credit_entitlements_period_check/);
        });
    });
});
