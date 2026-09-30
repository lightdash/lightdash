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
const CREDITS_PER_CALL = 40;

const usageEvent = (organizationUuid: string): AiUsageEvent => ({
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
    },
});

describe('AI credit allowance alerts on the real PostgreSQL schema', () => {
    let migrated: MigratedDatabase;
    let transaction: Knex.Transaction;
    let organizationUuid: string;
    let ledger: AiUsageLedgerModel;
    let alerts: AiCreditAllowanceAlertModel;
    let usage: AiCreditUsageModel;
    const now = new Date('2026-09-29T12:00:00Z');

    const recordCalls = async (count: number) => {
        await Array.from({ length: count }).reduce<Promise<void>>(
            async (previous) => {
                await previous;
                const event = usageEvent(organizationUuid);
                await ledger.recordEvent(event);
                await transaction.raw(
                    'UPDATE ai_usage_ledger SET created_at = ? WHERE event_id = ?',
                    [now, event.properties.eventId],
                );
                await usage.onUsageRecorded(event, now);
            },
            Promise.resolve(),
        );
    };

    const saveContract = async (allowanceCredits: number | null) => {
        const values = {
            organization_uuid: organizationUuid,
            starts_at: new Date('2026-01-15T00:00:00Z'),
            ends_at: null,
            reset_interval_months: 1,
            allowance_credits: allowanceCredits,
        };
        await transaction('ai_credit_contracts')
            .insert(values)
            .onConflict('organization_uuid')
            .merge(values);
    };

    const recordedThresholds = async () =>
        (
            await transaction('ai_credit_allowance_alerts')
                .where({ organization_uuid: organizationUuid })
                .orderBy('threshold_percent')
        ).map((row) => row.threshold_percent);

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
    });

    beforeEach(async () => {
        transaction = await migrated.database.transaction();
        [{ organization_uuid: organizationUuid }] = await transaction(
            'organizations',
        )
            .insert({ organization_name: `ai credit alerts ${randomUUID()}` })
            .returning('organization_uuid');
        ledger = new AiUsageLedgerModel({ database: transaction });
        alerts = new AiCreditAllowanceAlertModel({ database: transaction });
        usage = new AiCreditUsageModel({
            database: transaction,
            rateCardModel: new AiCreditRateCardModel({ database: transaction }),
            contractModel: new AiCreditContractModel({
                database: transaction,
            }),
            holdModel: new AiCreditHoldModel({ database: transaction }),
            allowanceAlertModel: alerts,
        });
    });

    afterEach(async () => {
        await transaction.rollback();
    });

    afterAll(async () => {
        await migrated.destroy();
    });

    test('records each threshold once, as usage crosses it', async () => {
        await saveContract(10 * CREDITS_PER_CALL);

        await recordCalls(4);
        expect(await recordedThresholds()).toEqual([]);

        await recordCalls(1);
        expect(await recordedThresholds()).toEqual([50]);

        await recordCalls(5);
        expect(await recordedThresholds()).toEqual([50, 80, 100]);

        await recordCalls(2);
        expect(await alerts.findUndelivered(10)).toHaveLength(3);
    });

    test('records nothing for a contract without an agreed allowance', async () => {
        await saveContract(null);
        await recordCalls(3);
        expect(await recordedThresholds()).toEqual([]);
    });

    test('raising the allowance above usage lets a threshold alert again when usage reaches it', async () => {
        await saveContract(2 * CREDITS_PER_CALL);
        await recordCalls(1);
        expect(await recordedThresholds()).toEqual([50]);
        await alerts.markDelivered(
            (await alerts.findUndelivered(10)).map(({ uuid }) => uuid),
        );

        await saveContract(10 * CREDITS_PER_CALL);
        await recordCalls(1);
        expect(await recordedThresholds()).toEqual([]);

        await recordCalls(3);
        const pending = await alerts.findUndelivered(10);
        expect(pending.map((alert) => alert.thresholdPercent)).toEqual([50]);
    });

    test('a changed allowance that usage still exceeds does not alert again', async () => {
        await saveContract(2 * CREDITS_PER_CALL);
        await recordCalls(1);
        await alerts.markDelivered(
            (await alerts.findUndelivered(10)).map(({ uuid }) => uuid),
        );

        await saveContract(3 * CREDITS_PER_CALL);
        await recordCalls(1);
        expect(await alerts.findUndelivered(10)).toEqual([]);
    });

    test('concurrent calls crossing the same threshold record it once', async () => {
        await saveContract(2 * CREDITS_PER_CALL);
        const events = [
            usageEvent(organizationUuid),
            usageEvent(organizationUuid),
        ];
        await Promise.all(events.map((event) => ledger.recordEvent(event)));
        await transaction.raw(
            'UPDATE ai_usage_ledger SET created_at = ? WHERE organization_uuid = ?',
            [now, organizationUuid],
        );
        await Promise.all(
            events.map((event) => usage.onUsageRecorded(event, now)),
        );
        expect(await recordedThresholds()).toEqual([50, 80, 100]);
    });
});
