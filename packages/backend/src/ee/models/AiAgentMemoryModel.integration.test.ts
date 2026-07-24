import { SEED_ORG_1, SEED_PROJECT } from '@lightdash/common';
import type { Knex } from 'knex';
import { getTestContext } from '../../vitest.setup.integration';
import { AiThreadTableName } from '../database/entities/ai';
import {
    AiAgentMemoryTableName,
    AiAgentThreadDistillTableName,
} from '../database/entities/aiAgentMemory';
import { AiAgentMemoryModel } from './AiAgentMemoryModel';

describe('AiAgentMemoryModel integration', () => {
    let database: Knex;
    let model: AiAgentMemoryModel;
    const threadUuids = new Set<string>();

    beforeAll(() => {
        database = getTestContext().db;
        model = getTestContext()
            .app.getModels()
            .getAiAgentMemoryModel<AiAgentMemoryModel>();
    });

    afterEach(async () => {
        if (threadUuids.size === 0) {
            return;
        }

        const ids = [...threadUuids];
        await database(AiAgentMemoryTableName)
            .whereIn('source_thread_uuid', ids)
            .delete();
        await database(AiAgentThreadDistillTableName)
            .whereIn('ai_thread_uuid', ids)
            .delete();
        await database(AiThreadTableName)
            .whereIn('ai_thread_uuid', ids)
            .delete();
        threadUuids.clear();
    });

    const createThread = async () => {
        const [thread] = await database(AiThreadTableName)
            .insert({
                organization_uuid: SEED_ORG_1.organization_uuid,
                project_uuid: SEED_PROJECT.project_uuid,
                created_from: 'web_app',
                agent_uuid: null,
            })
            .returning('ai_thread_uuid');
        threadUuids.add(thread.ai_thread_uuid);
        return thread.ai_thread_uuid;
    };

    const memoryInput = (
        sourceThreadUuid: string,
        overrides: Partial<
            Parameters<AiAgentMemoryModel['upsertSourceThreadMemory']>[0]
        > = {},
    ) => ({
        organizationUuid: SEED_ORG_1.organization_uuid,
        projectUuid: SEED_PROJECT.project_uuid,
        agentUuid: null,
        userUuid: null,
        sourceThreadUuid,
        slug: `memory-${crypto.randomUUID().slice(0, 8)}`,
        title: 'Net revenue convention',
        rawMemory: 'Use net revenue.',
        threadSummary: 'The user established the revenue convention.',
        terms: ['revenue'],
        objects: [
            {
                type: 'field' as const,
                explore: 'orders',
                fieldId: 'orders_net_revenue',
            },
        ],
        unresolvedObjects: [],
        generatedAt: new Date('2026-07-22T10:00:00Z'),
        ...overrides,
    });

    it('replaces source-thread content while keeping slug and telemetry', async () => {
        const sourceThreadUuid = await createThread();
        const first = await model.upsertSourceThreadMemory(
            memoryInput(sourceThreadUuid),
        );
        const citedAt = new Date('2026-07-22T11:00:00Z');
        const pulledAt = new Date('2026-07-22T12:00:00Z');
        await database(AiAgentMemoryTableName)
            .where('ai_agent_memory_uuid', first.ai_agent_memory_uuid)
            .update({
                cited_count: 3,
                last_cited_at: citedAt,
                pulled_count: 5,
                last_pulled_at: pulledAt,
            });

        const generatedAt = new Date('2026-07-22T13:00:00Z');
        const updated = await model.upsertSourceThreadMemory(
            memoryInput(sourceThreadUuid, {
                slug: 'replacement-slug-is-ignored',
                title: 'Recognized net revenue convention',
                rawMemory: 'Use recognized net revenue.',
                threadSummary: 'The resumed thread confirmed the convention.',
                terms: ['net revenue'],
                objects: [{ type: 'explore', name: 'orders' }],
                unresolvedObjects: [
                    { type: 'explore', name: 'missing_orders' },
                ],
                generatedAt,
            }),
        );

        expect(updated).toMatchObject({
            ai_agent_memory_uuid: first.ai_agent_memory_uuid,
            slug: first.slug,
            title: 'Recognized net revenue convention',
            raw_memory: 'Use recognized net revenue.',
            thread_summary: 'The resumed thread confirmed the convention.',
            terms: ['net revenue'],
            objects: [{ type: 'explore', name: 'orders' }],
            unresolved_objects: [{ type: 'explore', name: 'missing_orders' }],
            generated_at: generatedAt,
            cited_count: 3,
            last_cited_at: citedAt,
            pulled_count: 5,
            last_pulled_at: pulledAt,
        });
    });

    it('upserts one ledger row and clears stale outcome details', async () => {
        const aiThreadUuid = await createThread();
        const memory = await model.upsertSourceThreadMemory(
            memoryInput(aiThreadUuid),
        );
        const first = await model.upsertThreadDistill({
            aiThreadUuid,
            outcome: 'memory',
            distillPromptHash: 'hash-1',
            distilledUpTo: new Date('2026-07-22T10:00:00Z'),
        });

        const noOp = await model.upsertThreadDistill({
            aiThreadUuid,
            outcome: 'no_op',
            noOpReason: 'insufficient_signal',
            distillPromptHash: 'hash-2',
            distilledUpTo: new Date('2026-07-22T11:00:00Z'),
        });
        expect(noOp).toMatchObject({
            ai_agent_thread_distill_uuid: first.ai_agent_thread_distill_uuid,
            outcome: 'no_op',
            no_op_reason: 'insufficient_signal',
            error_message: null,
            distilled_up_to: new Date('2026-07-22T11:00:00Z'),
        });
        const activeMemory = await database(AiAgentMemoryTableName)
            .where('source_thread_uuid', aiThreadUuid)
            .where('status', 'active')
            .first();
        expect(activeMemory?.ai_agent_memory_uuid).toBe(
            memory.ai_agent_memory_uuid,
        );

        const failed = await model.upsertThreadDistill({
            aiThreadUuid,
            outcome: 'failed',
            errorMessage: 'provider timeout',
            distillPromptHash: 'hash-3',
            distilledUpTo: new Date('2026-07-22T12:00:00Z'),
        });
        expect(failed).toMatchObject({
            ai_agent_thread_distill_uuid: first.ai_agent_thread_distill_uuid,
            outcome: 'failed',
            no_op_reason: null,
            error_message: 'provider timeout',
            distill_prompt_hash: 'hash-3',
        });

        const succeeded = await model.upsertThreadDistill({
            aiThreadUuid,
            outcome: 'memory',
            distillPromptHash: null,
            distilledUpTo: new Date('2026-07-22T13:00:00Z'),
        });
        expect(succeeded).toMatchObject({
            ai_agent_thread_distill_uuid: first.ai_agent_thread_distill_uuid,
            outcome: 'memory',
            no_op_reason: null,
            error_message: null,
            distill_prompt_hash: null,
        });
        const ledgerCount = await database(AiAgentThreadDistillTableName)
            .where('ai_thread_uuid', aiThreadUuid)
            .count<{ count: bigint }>('* as count')
            .first();
        expect(Number(ledgerCount?.count)).toBe(1);
    });

    it('returns only active project memories in citation ranking order', async () => {
        const [firstThread, secondThread, thirdThread, retiredThread] =
            await Promise.all([
                createThread(),
                createThread(),
                createThread(),
                createThread(),
            ]);
        const first = await model.upsertSourceThreadMemory(
            memoryInput(firstThread, {
                generatedAt: new Date('2026-07-22T12:00:00Z'),
            }),
        );
        const second = await model.upsertSourceThreadMemory(
            memoryInput(secondThread, {
                generatedAt: new Date('2026-07-22T13:00:00Z'),
            }),
        );
        const third = await model.upsertSourceThreadMemory(
            memoryInput(thirdThread, {
                generatedAt: new Date('2026-07-22T11:00:00Z'),
            }),
        );
        const retired = await model.upsertSourceThreadMemory(
            memoryInput(retiredThread, {
                generatedAt: new Date('2026-07-22T14:00:00Z'),
            }),
        );
        await database(AiAgentMemoryTableName)
            .where('ai_agent_memory_uuid', first.ai_agent_memory_uuid)
            .update({ last_cited_at: new Date('2026-07-22T09:00:00Z') });
        await database(AiAgentMemoryTableName)
            .where('ai_agent_memory_uuid', retired.ai_agent_memory_uuid)
            .update({ status: 'retired' });

        const rows = await model.findActiveForProject({
            projectUuid: SEED_PROJECT.project_uuid,
        });

        expect(rows.map((row) => row.ai_agent_memory_uuid)).toEqual([
            first.ai_agent_memory_uuid,
            second.ai_agent_memory_uuid,
            third.ai_agent_memory_uuid,
        ]);
    });
});
