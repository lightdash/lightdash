import {
    getCalendarMonthPeriod,
    SEED_ORG_1,
    SEED_ORG_1_ADMIN,
} from '@lightdash/common';
import knex, { Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { type AiUsageEvent } from '../../../../analytics/aiUsage';
import { AiUsageLedgerModel } from '../../../../models/AiUsageLedgerModel';
import { AiCreditEntitlementModel } from '../../../models/AiCreditEntitlementModel';
import { AiCreditHoldModel } from '../../../models/AiCreditHoldModel';
import { AiCreditRateCardModel } from '../../../models/AiCreditRateCardModel';
import { AiCreditUsageModel } from '../../../models/AiCreditUsageModel';

const ORG = SEED_ORG_1.organization_uuid;

// One million uncached Sonnet 5 input tokens on the seeded card is 40 credits.
const SONNET_INPUT_MTOK_CREDITS = 40;

const usageEvent = (
    overrides: Partial<AiUsageEvent['properties']> = {},
): AiUsageEvent => ({
    event: 'ai.usage',
    userId: SEED_ORG_1_ADMIN.user_uuid,
    properties: {
        eventId: randomUUID(),
        outcome: 'complete',
        feature: 'agent',
        functionId: 'streamAgentResponse',
        organizationId: ORG,
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
    let database: Knex;
    let transaction: Knex.Transaction;
    let ledger: AiUsageLedgerModel;
    let entitlements: AiCreditEntitlementModel;
    let holds: AiCreditHoldModel;
    let usage: AiCreditUsageModel;
    const now = new Date('2026-09-29T12:00:00Z');
    const window = {
        periodStart: new Date('2026-09-15T00:00:00Z'),
        periodEnd: new Date('2026-10-15T00:00:00Z'),
    };

    // The sink records the call first, then evaluates the allowance.
    const recordAndEvaluate = async (event: AiUsageEvent) => {
        await ledger.recordEvent(event);
        await transaction.raw(
            'UPDATE ai_usage_ledger SET created_at = ? WHERE event_id = ?',
            [now, event.properties.eventId],
        );
        await usage.onUsageRecorded(event, now);
    };

    beforeAll(() => {
        if (!process.env.PGCONNECTIONURI && !process.env.PGDATABASE)
            throw new Error('PostgreSQL integration connection is required');
        database = knex({
            client: 'pg',
            connection: process.env.PGCONNECTIONURI ?? {
                host: process.env.PGHOST,
                port: Number(process.env.PGPORT ?? 5432),
                user: process.env.PGUSER,
                password: process.env.PGPASSWORD,
                database: process.env.PGDATABASE,
            },
        });
    });

    beforeEach(async () => {
        transaction = await database.transaction();
        ledger = new AiUsageLedgerModel({ database: transaction });
        entitlements = new AiCreditEntitlementModel({ database: transaction });
        holds = new AiCreditHoldModel({ database: transaction });
        usage = new AiCreditUsageModel({
            database: transaction,
            rateCardModel: new AiCreditRateCardModel({ database: transaction }),
            entitlementModel: entitlements,
            holdModel: holds,
        });
        await transaction('ai_credit_holds')
            .where({ organization_uuid: ORG })
            .delete();
        await transaction('ai_credit_entitlements')
            .where({ organization_uuid: ORG })
            .delete();
        await transaction('ai_usage_ledger')
            .where({ organization_uuid: ORG })
            .delete();
    });

    afterEach(async () => {
        await transaction.rollback();
    });

    afterAll(async () => {
        await database.destroy();
    });

    describe('usage in a window', () => {
        test('sums only billable calls, priced with the rate card', async () => {
            await recordAndEvaluate(usageEvent());
            await recordAndEvaluate(usageEvent());
            await recordAndEvaluate(
                usageEvent({ keyManagement: 'self-managed' }),
            );
            await recordAndEvaluate(
                usageEvent({ feature: 'review-classifier' }),
            );
            await recordAndEvaluate(
                usageEvent({ feature: 'data-app', outcome: 'failed' }),
            );

            expect(
                await usage.sumCredits(ORG, getCalendarMonthPeriod(now)),
            ).toBeCloseTo(2 * SONNET_INPUT_MTOK_CREDITS, 6);
        });

        test('a model without a rate card row adds nothing rather than failing', async () => {
            await recordAndEvaluate(
                usageEvent({ provider: 'google', model: 'gemini-3.8-flash' }),
            );
            expect(
                await usage.sumCredits(ORG, getCalendarMonthPeriod(now)),
            ).toBe(0);
        });

        test('charges to the entitlement window when one covers the call, else the calendar month', async () => {
            expect(await usage.getPeriod(ORG, now)).toEqual(
                getCalendarMonthPeriod(now),
            );
            await entitlements.create({
                organizationUuid: ORG,
                ...window,
                allowanceCredits: 100,
            });
            expect(await usage.getPeriod(ORG, now)).toMatchObject(window);
        });
    });

    describe('hold placement from the sink', () => {
        test('places one hold that expires with the window once the allowance is used up', async () => {
            await entitlements.create({
                organizationUuid: ORG,
                ...window,
                allowanceCredits: 2 * SONNET_INPUT_MTOK_CREDITS,
            });

            await recordAndEvaluate(usageEvent());
            expect(await holds.findActive(ORG, now)).toEqual([]);

            await recordAndEvaluate(usageEvent());
            await recordAndEvaluate(usageEvent());

            const active = await holds.findActive(ORG, now);
            expect(active).toHaveLength(1);
            expect(active[0]).toMatchObject({
                reason: 'allowance_exhausted',
                placedBy: 'system',
                userUuid: null,
            });
            expect(active[0].expiresAt?.toISOString()).toBe(
                window.periodEnd.toISOString(),
            );
        });

        test('never places a hold without an agreed allowance', async () => {
            await entitlements.create({
                organizationUuid: ORG,
                ...window,
                allowanceCredits: null,
            });
            await recordAndEvaluate(usageEvent());
            expect(await holds.findActive(ORG, now)).toEqual([]);
        });

        test('never places a hold for an organisation with no entitlement', async () => {
            await recordAndEvaluate(usageEvent());
            expect(await holds.findActive(ORG, now)).toEqual([]);
        });
    });

    describe('holds', () => {
        test('a hold stops applying at its expiry and can be released earlier', async () => {
            const hold = await holds.place({
                organizationUuid: ORG,
                userUuid: null,
                reason: 'allowance_exhausted',
                notes: null,
                placedBy: 'system',
                expiresAt: window.periodEnd,
            });
            expect(
                (await holds.findActive(ORG, now)).map((h) => h.uuid),
            ).toEqual([hold.uuid]);
            expect(await holds.findActive(ORG, window.periodEnd)).toEqual([]);

            await holds.release(hold.uuid);
            expect(await holds.findActive(ORG, now)).toEqual([]);
        });

        test('a manual pause has no expiry', async () => {
            await holds.place({
                organizationUuid: ORG,
                userUuid: null,
                reason: 'manual_pause',
                notes: 'operator note',
                placedBy: 'someone@lightdash.com',
                expiresAt: null,
            });
            expect(
                await holds.findActive(ORG, new Date('2030-01-01T00:00:00Z')),
            ).toHaveLength(1);
        });

        test('rejects a reason outside the fixed list', async () => {
            await expect(
                transaction.raw(
                    `INSERT INTO ai_credit_holds (organization_uuid, reason, placed_by) VALUES (?, 'because', 'test')`,
                    [ORG],
                ),
            ).rejects.toThrow(/ai_credit_holds_reason_check/);
        });
    });

    describe('entitlements', () => {
        test('rejects a window that ends before it starts', async () => {
            await expect(
                entitlements.create({
                    organizationUuid: ORG,
                    periodStart: window.periodEnd,
                    periodEnd: window.periodStart,
                    allowanceCredits: null,
                }),
            ).rejects.toThrow(/ai_credit_entitlements_period_check/);
        });
    });
});
