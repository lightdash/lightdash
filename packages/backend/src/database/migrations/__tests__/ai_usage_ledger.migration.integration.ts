import { SEED_ORG_1, SEED_ORG_1_ADMIN } from '@lightdash/common';
import knex, { Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { type AiUsageEvent } from '../../../analytics/aiUsage';
import { AiUsageLedgerModel } from '../../../models/AiUsageLedgerModel';

const TABLE = 'ai_usage_ledger';

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
        organizationId: SEED_ORG_1.organization_uuid,
        projectId: randomUUID(),
        aiAgentId: null,
        threadId: randomUUID(),
        promptId: randomUUID(),
        dataAppId: null,
        model: 'claude-sonnet-5',
        provider: 'anthropic',
        keyManagement: 'lightdash-managed',
        managedAgentRunId: null,
        deepResearchRunId: null,
        deepResearchPhase: null,
        inputTokens: 1200,
        outputTokens: 300,
        cacheReadTokens: 800,
        cacheWriteTokens: 100,
        reasoningTokens: null,
        totalTokens: 1500,
        ...overrides,
    },
});

describe('AI usage ledger on the real PostgreSQL schema', () => {
    let database: Knex;
    let transaction: Knex.Transaction;
    let model: AiUsageLedgerModel;

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
        model = new AiUsageLedgerModel({ database: transaction });
    });

    afterEach(async () => {
        await transaction.rollback();
    });

    afterAll(async () => {
        await database.destroy();
    });

    test('records one row per call with its token classes and key origin', async () => {
        const event = usageEvent();
        await model.recordEvent(event);
        const [row] = await transaction(TABLE).where({
            event_id: event.properties.eventId,
        });
        expect(row).toMatchObject({
            organization_uuid: SEED_ORG_1.organization_uuid,
            user_uuid: SEED_ORG_1_ADMIN.user_uuid,
            thread_uuid: event.properties.threadId,
            feature: 'agent',
            key_management: 'lightdash-managed',
            outcome: 'complete',
        });
        expect(
            [
                row.input_tokens,
                row.output_tokens,
                row.cache_read_tokens,
                row.cache_write_tokens,
                row.total_tokens,
            ].map(Number),
        ).toEqual([1200, 300, 800, 100, 1500]);
        expect(row.reasoning_tokens).toBeNull();
    });

    test('drops a call that has no organisation to attribute it to', async () => {
        const event = usageEvent({ organizationId: null });
        await model.recordEvent(event);
        expect(
            await transaction(TABLE).where({
                event_id: event.properties.eventId,
            }),
        ).toEqual([]);
    });

    test('keeps a failed data app generation with its outcome', async () => {
        const event = usageEvent({
            feature: 'data-app',
            functionId: 'appClaudeGeneration',
            outcome: 'failed',
            dataAppId: randomUUID(),
        });
        await model.recordEvent(event);
        const [row] = await transaction(TABLE).where({
            event_id: event.properties.eventId,
        });
        expect(row.outcome).toBe('failed');
        expect(row.app_uuid).toBe(event.properties.dataAppId);
    });

    test('refuses a second row for the same event id', async () => {
        const event = usageEvent();
        await model.recordEvent(event);
        await expect(model.recordEvent(event)).rejects.toThrow(
            /ai_usage_ledger_event_id_unique/,
        );
    });

    test('retention removes rows past the cutoff and keeps newer ones', async () => {
        const old = usageEvent();
        const recent = usageEvent();
        await model.recordEvent(old);
        await model.recordEvent(recent);
        await transaction.raw(
            `UPDATE ${TABLE} SET created_at = now() - interval '91 days' WHERE event_id = ?`,
            [old.properties.eventId],
        );

        const deleted = await model.deleteOlderThan(90);

        expect(deleted).toBe(1);
        const remaining = await transaction(TABLE).whereIn('event_id', [
            old.properties.eventId,
            recent.properties.eventId,
        ]);
        expect(remaining.map((row) => row.event_id)).toEqual([
            recent.properties.eventId,
        ]);
    });

    test('retention refuses a cutoff that would delete everything', async () => {
        await expect(model.deleteOlderThan(0)).rejects.toThrow(
            /Invalid retention days/,
        );
    });
});
