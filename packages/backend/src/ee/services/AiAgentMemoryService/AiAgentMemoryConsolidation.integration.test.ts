import {
    CommercialFeatureFlags,
    FeatureFlags,
    SEED_ORG_1,
    SEED_PROJECT,
    type AiAgentMemoryConsolidationOperation,
    type AiProjectContextTypedObjectRef,
} from '@lightdash/common';
import type { Knex } from 'knex';
import { vi } from 'vitest';
import { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import { parseConfig } from '../../../config/parseConfig';
import {
    FeatureFlagsTableName,
    type DbFeatureFlag,
    type FeatureFlagsTable,
} from '../../../database/entities/featureFlags';
import { UserTableName } from '../../../database/entities/users';
import { FeatureFlagService } from '../../../services/FeatureFlag/FeatureFlagService';
import { getTestContext } from '../../../vitest.setup.integration';
import {
    AiAgentMemoryConsolidationRunTableName,
    AiAgentMemoryTableName,
    type DbAiAgentMemory,
    type DbAiAgentMemoryConsolidationRun,
} from '../../database/entities/aiAgentMemory';
import { AiAgentMemoryModel } from '../../models/AiAgentMemoryModel';
import { CommercialFeatureFlagModel } from '../../models/CommercialFeatureFlagModel';
import { CommercialSchedulerClient } from '../../scheduler/SchedulerClient';
import { renderMemoryBlock } from '../ai/utils/memoryBlock';
import {
    AiAgentMemoryService,
    type AiAgentMemoryConsolidateCall,
} from './AiAgentMemoryService';
import { AI_AGENT_MEMORY_CONSOLIDATION_MIN_ACTIVE_ROWS } from './consolidation';

const FLOOR = AI_AGENT_MEMORY_CONSOLIDATION_MIN_ACTIVE_ROWS;

describe('AI agent memory consolidation integration', () => {
    let database: Knex;
    let model: AiAgentMemoryModel;
    let featureFlagService: FeatureFlagService;
    let schedulerClient: CommercialSchedulerClient;
    let analytics: LightdashAnalytics;
    let ownerUuid: string;
    let otherOwnerUuid: string;
    let resolvableExploreName: string;
    const originalFlags = new Map<string, DbFeatureFlag | undefined>();
    const createdUserUuids: string[] = [];

    const setFeatureFlag = async (flagId: string, enabled: boolean) => {
        await database<FeatureFlagsTable>(FeatureFlagsTableName)
            .insert({ flag_id: flagId, default_enabled: enabled })
            .onConflict('flag_id')
            .merge({ default_enabled: enabled });
    };

    const createUser = async (firstName: string): Promise<string> => {
        const [user] = await database(UserTableName)
            .insert({
                first_name: firstName,
                last_name: 'Consolidation',
                is_marketing_opted_in: false,
                is_tracking_anonymized: false,
                is_setup_complete: true,
                is_active: true,
            })
            .returning<Array<{ user_uuid: string }>>('user_uuid');
        createdUserUuids.push(user.user_uuid);
        return user.user_uuid;
    };

    beforeAll(async () => {
        database = getTestContext().db;
        model = getTestContext()
            .app.getModels()
            .getAiAgentMemoryModel<AiAgentMemoryModel>();
        const lightdashConfig = parseConfig();
        lightdashConfig.enabledFeatureFlags.delete(FeatureFlags.AiAgentMemory);
        lightdashConfig.disabledFeatureFlags.delete(FeatureFlags.AiAgentMemory);
        const featureFlagModel = new CommercialFeatureFlagModel({
            database,
            lightdashConfig,
        });
        featureFlagService = new FeatureFlagService({
            lightdashConfig,
            featureFlagModel,
        });
        analytics = new LightdashAnalytics({
            lightdashConfig,
            writeKey: 'notrack',
            dataPlaneUrl: 'notrack',
            options: { enable: false },
        });
        schedulerClient = new CommercialSchedulerClient({
            lightdashConfig,
            analytics,
            schedulerModel: getTestContext()
                .app.getModels()
                .getSchedulerModel(),
            featureFlagModel,
        });

        const flagIds = [
            FeatureFlags.AiAgentMemory,
            CommercialFeatureFlags.AiCopilot,
        ];
        const storedFlags = await Promise.all(
            flagIds.map((flagId) =>
                database<FeatureFlagsTable>(FeatureFlagsTableName)
                    .where('flag_id', flagId)
                    .first(),
            ),
        );
        flagIds.forEach((flagId, index) => {
            originalFlags.set(flagId, storedFlags[index]);
        });
        await Promise.all(
            flagIds.map((flagId) => setFeatureFlag(flagId, true)),
        );

        ownerUuid = await createUser('Owner');
        otherOwnerUuid = await createUser('Other');

        const explores = await getTestContext()
            .app.getModels()
            .getProjectModel()
            .findExploresFromCache(SEED_PROJECT.project_uuid, 'name');
        const [firstExplore] = Object.keys(explores);
        if (!firstExplore) {
            throw new Error('Seed project has no cached explores');
        }
        resolvableExploreName = firstExplore;
    });

    afterEach(async () => {
        await setFeatureFlag(FeatureFlags.AiAgentMemory, true);
        await database(AiAgentMemoryConsolidationRunTableName)
            .whereIn('user_uuid', createdUserUuids)
            .delete();
        await database(AiAgentMemoryTableName)
            .where('project_uuid', SEED_PROJECT.project_uuid)
            .where((builder) => {
                void builder
                    .whereIn('user_uuid', createdUserUuids)
                    .orWhereILike('slug', 'consolidation-%');
            })
            .delete();
    });

    afterAll(async () => {
        await database(UserTableName)
            .whereIn('user_uuid', createdUserUuids)
            .delete();
        await Promise.all(
            [...originalFlags].map(([flagId, flag]) =>
                flag
                    ? database<FeatureFlagsTable>(FeatureFlagsTableName)
                          .insert({
                              flag_id: flag.flag_id,
                              default_enabled: flag.default_enabled,
                          })
                          .onConflict('flag_id')
                          .merge({ default_enabled: flag.default_enabled })
                    : database<FeatureFlagsTable>(FeatureFlagsTableName)
                          .where('flag_id', flagId)
                          .delete(),
            ),
        );
        const graphileClient = await schedulerClient.graphileUtils;
        await graphileClient.release();
    });

    /** Slugs come back in the order the injection ranking will select them. */
    const seedPartition = async (args: {
        userUuid: string | null;
        count: number;
        prefix: string;
        objects?: AiProjectContextTypedObjectRef[];
    }): Promise<string[]> => {
        const rows = Array.from({ length: args.count }, (_, index) => ({
            organization_uuid: SEED_ORG_1.organization_uuid,
            project_uuid: SEED_PROJECT.project_uuid,
            agent_uuid: null,
            user_uuid: args.userUuid,
            source_thread_uuid: null,
            slug: `consolidation-${args.prefix}-${index}`,
            title: `Memory ${index}`,
            raw_memory: `Body of memory ${index}.`,
            thread_summary: `Thread summary ${index} that must never be shown.`,
            terms: JSON.stringify([`term-${index}`]),
            objects: JSON.stringify(args.objects ?? []),
            unresolved_objects: JSON.stringify([]),
            scope: 'user' as const,
            // Descending generated_at, so selection order is index order.
            generated_at: new Date(
                Date.UTC(2026, 6, 20, 12) - index * 60 * 60 * 1000,
            ),
        }));
        await database(AiAgentMemoryTableName).insert(rows);
        return rows.map((row) => row.slug);
    };

    const buildService = (consolidateCall: AiAgentMemoryConsolidateCall) =>
        new AiAgentMemoryService({
            analytics,
            aiAgentMemoryModel: model,
            aiAgentModel: getTestContext().app.getModels().getAiAgentModel(),
            groupsModel: getTestContext().app.getModels().getGroupsModel(),
            projectModel: getTestContext().app.getModels().getProjectModel(),
            featureFlagService,
            schedulerClient,
            consolidateCall,
        });

    const cannedCall = (operations: AiAgentMemoryConsolidationOperation[]) =>
        vi.fn().mockResolvedValue({ operations });

    const memoryBySlug = async (slug: string): Promise<DbAiAgentMemory> => {
        const row = await database(AiAgentMemoryTableName)
            .where('project_uuid', SEED_PROJECT.project_uuid)
            .where('slug', slug)
            .first<DbAiAgentMemory>();
        if (!row) throw new Error(`Missing memory ${slug}`);
        return row;
    };

    const runsForOwner = async (
        userUuid: string,
    ): Promise<DbAiAgentMemoryConsolidationRun[]> =>
        database(AiAgentMemoryConsolidationRunTableName)
            .where('user_uuid', userUuid)
            .orderBy('created_at', 'asc');

    it('applies supersede and retire without ever rewriting content', async () => {
        const slugs = await seedPartition({
            userUuid: ownerUuid,
            count: FLOOR,
            prefix: 'apply',
        });
        const before = await memoryBySlug(slugs[0]!);
        const winner = await memoryBySlug(slugs[1]!);
        const service = buildService(
            cannedCall([
                {
                    type: 'supersede',
                    loser_slug: slugs[0]!,
                    winner_slug: slugs[1]!,
                    reason: 'The winner is the user’s later correction.',
                },
                {
                    type: 'retire',
                    slug: slugs[2]!,
                    reason: 'Its explore no longer resolves.',
                },
            ]),
        );

        await service.consolidate();

        const loser = await memoryBySlug(slugs[0]!);
        expect(loser).toMatchObject({
            status: 'superseded',
            superseded_by_uuid: winner.ai_agent_memory_uuid,
            raw_memory: before.raw_memory,
            title: before.title,
            generated_at: before.generated_at,
        });
        expect(await memoryBySlug(slugs[2]!)).toMatchObject({
            status: 'retired',
            superseded_by_uuid: null,
            raw_memory: `Body of memory 2.`,
        });
        expect(await memoryBySlug(slugs[1]!)).toMatchObject({
            status: 'active',
        });

        const [run] = await runsForOwner(ownerUuid);
        expect(run).toMatchObject({
            status: 'succeeded',
            input_count: FLOOR,
            applied_count: 2,
            rejected_count: 0,
            error_message: null,
        });
        expect(run!.prompt_hash).toHaveLength(64);
        expect(run!.input_hash).toHaveLength(64);
        expect(
            run!.applied_operations.map((operation) => operation.type),
        ).toEqual(['supersede', 'retire']);
    });

    it('records rejected operations with reasons and still succeeds', async () => {
        const slugs = await seedPartition({
            userUuid: ownerUuid,
            count: FLOOR,
            prefix: 'reject',
        });
        const service = buildService(
            cannedCall([
                {
                    type: 'retire',
                    slug: 'consolidation-not-in-input',
                    reason: 'Never seen.',
                },
                {
                    type: 'merge',
                    source_slugs: [slugs[0]!, slugs[1]!],
                    slug: 'consolidation-merged',
                    title: 'Merged',
                    memory: 'One claim.',
                    terms: [],
                    objects: [],
                    reason: 'Same claim twice.',
                },
                {
                    type: 'retire',
                    slug: slugs[3]!,
                    reason: 'Its explore no longer resolves.',
                },
            ]),
        );

        await service.consolidate();

        const [run] = await runsForOwner(ownerUuid);
        expect(run).toMatchObject({
            status: 'succeeded',
            applied_count: 1,
            rejected_count: 2,
        });
        expect(
            run!.rejected_operations.map((rejection) => rejection.reason),
        ).toEqual(['unknown_slug', 'unsupported_operation']);
        expect(run!.rejected_operations[0]!.operation).toMatchObject({
            type: 'retire',
            slug: 'consolidation-not-in-input',
        });
        expect(await memoryBySlug(slugs[3]!)).toMatchObject({
            status: 'retired',
        });
        expect(await memoryBySlug(slugs[0]!)).toMatchObject({
            status: 'active',
        });
    });

    it('rejects an operation naming a slug the same run would create', async () => {
        const slugs = await seedPartition({
            userUuid: ownerUuid,
            count: FLOOR,
            prefix: 'selfref',
        });
        const service = buildService(
            cannedCall([
                {
                    type: 'merge',
                    source_slugs: [slugs[0]!, slugs[1]!],
                    slug: 'consolidation-merged',
                    title: 'Merged',
                    memory: 'One claim.',
                    terms: [],
                    objects: [],
                    reason: 'Same claim twice.',
                },
                {
                    type: 'retire',
                    slug: 'consolidation-merged',
                    reason: 'Changed my mind about the row I just made.',
                },
            ]),
        );

        await service.consolidate();

        const [run] = await runsForOwner(ownerUuid);
        expect(run).toMatchObject({ applied_count: 0, rejected_count: 2 });
        expect(
            run!.rejected_operations.map((rejection) => rejection.reason),
        ).toEqual(['unsupported_operation', 'unknown_slug']);
    });

    it('rejects a row that changed status or generated_at between selection and apply', async () => {
        const slugs = await seedPartition({
            userUuid: ownerUuid,
            count: FLOOR,
            prefix: 'moved',
        });
        const service = buildService(async () => {
            // Concurrent writes land while the curator is thinking.
            await database(AiAgentMemoryTableName)
                .where('project_uuid', SEED_PROJECT.project_uuid)
                .where('slug', slugs[0]!)
                .update({ status: 'retired' });
            await database(AiAgentMemoryTableName)
                .where('project_uuid', SEED_PROJECT.project_uuid)
                .where('slug', slugs[1]!)
                .update({
                    raw_memory: 'Rewritten by a resumed thread.',
                    generated_at: new Date('2026-07-27T10:00:00Z'),
                });
            return {
                operations: [
                    {
                        type: 'retire',
                        slug: slugs[0]!,
                        reason: 'Its explore no longer resolves.',
                    },
                    {
                        type: 'supersede',
                        loser_slug: slugs[1]!,
                        winner_slug: slugs[2]!,
                        reason: 'Replaced by a later correction.',
                    },
                    {
                        type: 'retire',
                        slug: slugs[3]!,
                        reason: 'Its explore no longer resolves.',
                    },
                ],
            };
        });

        await service.consolidate();

        const [run] = await runsForOwner(ownerUuid);
        expect(run).toMatchObject({
            status: 'succeeded',
            applied_count: 1,
            rejected_count: 2,
        });
        expect(
            run!.rejected_operations.map((rejection) => rejection.reason),
        ).toEqual(['row_moved', 'row_moved']);
        expect(await memoryBySlug(slugs[1]!)).toMatchObject({
            status: 'active',
            superseded_by_uuid: null,
        });
        expect(await memoryBySlug(slugs[3]!)).toMatchObject({
            status: 'retired',
        });
    });

    it('rolls every operation back and records a failed run on a database failure', async () => {
        const slugs = await seedPartition({
            userUuid: ownerUuid,
            count: FLOOR,
            prefix: 'dbfail',
        });
        await database.raw(`
            CREATE OR REPLACE FUNCTION consolidation_test_trip() RETURNS trigger AS $$
            BEGIN
                IF NEW.slug = '${slugs[1]}' THEN
                    RAISE EXCEPTION 'consolidation test failure';
                END IF;
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        `);
        await database.raw(`
            CREATE TRIGGER consolidation_test_trip
            BEFORE UPDATE ON ${AiAgentMemoryTableName}
            FOR EACH ROW EXECUTE FUNCTION consolidation_test_trip();
        `);

        try {
            const service = buildService(
                cannedCall([
                    {
                        type: 'retire',
                        slug: slugs[0]!,
                        reason: 'Its explore no longer resolves.',
                    },
                    {
                        type: 'retire',
                        slug: slugs[1]!,
                        reason: 'Its explore no longer resolves.',
                    },
                ]),
            );

            await service.consolidate();
        } finally {
            await database.raw(
                `DROP TRIGGER IF EXISTS consolidation_test_trip ON ${AiAgentMemoryTableName}`,
            );
            await database.raw(
                'DROP FUNCTION IF EXISTS consolidation_test_trip()',
            );
        }

        expect(await memoryBySlug(slugs[0]!)).toMatchObject({
            status: 'active',
        });
        expect(await memoryBySlug(slugs[1]!)).toMatchObject({
            status: 'active',
        });
        const [run] = await runsForOwner(ownerUuid);
        expect(run).toMatchObject({
            status: 'failed',
            applied_count: 0,
            rejected_count: 0,
        });
        expect(run!.error_message).toContain('consolidation test failure');
        expect(run!.input_hash).toHaveLength(64);
    });

    it('serializes two workers racing the same partition', async () => {
        const slugs = await seedPartition({
            userUuid: ownerUuid,
            count: 3,
            prefix: 'race',
        });
        const rows = await Promise.all(slugs.map(memoryBySlug));
        const applyOnce = () =>
            model.applyConsolidation({
                run: {
                    organizationUuid: SEED_ORG_1.organization_uuid,
                    projectUuid: SEED_PROJECT.project_uuid,
                    ownerUserUuid: ownerUuid,
                    promptHash: 'prompt',
                    inputHash: 'input',
                    inputCount: rows.length,
                    errorMessage: null,
                    consolidatedUpTo: new Date(),
                },
                selection: rows.map((row) => ({
                    memoryUuid: row.ai_agent_memory_uuid,
                    slug: row.slug,
                    generatedAt: row.generated_at,
                })),
                operations: [
                    {
                        type: 'retire',
                        slug: slugs[0]!,
                        reason: 'Its explore no longer resolves.',
                    },
                ],
                rejected: [],
            });

        const results = await Promise.all([applyOnce(), applyOnce()]);

        // The loser re-reads inside the lock and finds the row already moved.
        expect(results.map((result) => result.applied.length).sort()).toEqual([
            0, 1,
        ]);
        expect(
            results.flatMap((result) =>
                result.rejected.map((rejection) => rejection.reason),
            ),
        ).toEqual(['row_moved']);
        expect(await memoryBySlug(slugs[0]!)).toMatchObject({
            status: 'retired',
        });
    });

    it('skips a second pass over an unchanged corpus without an LLM call', async () => {
        await seedPartition({
            userUuid: ownerUuid,
            count: FLOOR,
            prefix: 'skip',
        });
        const first = cannedCall([]);
        await buildService(first).consolidate();

        const second = cannedCall([]);
        await buildService(second).consolidate();

        expect(first).toHaveBeenCalledOnce();
        expect(second).not.toHaveBeenCalled();
        expect(await runsForOwner(ownerUuid)).toHaveLength(1);
    });

    it('does not retry a failed partition until the corpus changes', async () => {
        await seedPartition({
            userUuid: ownerUuid,
            count: FLOOR,
            prefix: 'failskip',
        });
        const failing = vi.fn().mockRejectedValue(new Error('model exploded'));
        await buildService(failing).consolidate();

        const afterFailure = cannedCall([]);
        await buildService(afterFailure).consolidate();
        expect(afterFailure).not.toHaveBeenCalled();

        await seedPartition({
            userUuid: ownerUuid,
            count: 1,
            prefix: 'failskip-new',
        });
        const afterChange = cannedCall([]);
        await buildService(afterChange).consolidate();

        expect(afterChange).toHaveBeenCalledOnce();
        const runs = await runsForOwner(ownerUuid);
        expect(runs.map((run) => run.status)).toEqual(['failed', 'succeeded']);
        expect(runs[0]!.input_hash).not.toBe(runs[1]!.input_hash);
    });

    it('leaves partitions below the row floor alone', async () => {
        await seedPartition({
            userUuid: otherOwnerUuid,
            count: FLOOR - 1,
            prefix: 'floor',
        });
        const call = cannedCall([]);

        await buildService(call).consolidate();

        expect(call).not.toHaveBeenCalled();
        expect(await runsForOwner(otherOwnerUuid)).toHaveLength(0);
    });

    it('never selects an owner-null row and never lets an operation cross owners', async () => {
        const slugs = await seedPartition({
            userUuid: ownerUuid,
            count: FLOOR,
            prefix: 'owner',
        });
        const [orphanSlug] = await seedPartition({
            userUuid: null,
            count: 1,
            prefix: 'orphan',
        });
        const [otherSlug] = await seedPartition({
            userUuid: otherOwnerUuid,
            count: 1,
            prefix: 'otherowner',
        });
        const call = cannedCall([
            {
                type: 'retire',
                slug: orphanSlug!,
                reason: 'Its explore no longer resolves.',
            },
            {
                type: 'supersede',
                loser_slug: otherSlug!,
                winner_slug: slugs[0]!,
                reason: 'Cross-owner replacement.',
            },
        ]);

        await buildService(call).consolidate();

        const [{ input }] = call.mock.calls[0] as [
            { input: Array<{ id: string }> },
        ];
        expect(input.map((entry) => entry.id)).not.toContain(orphanSlug);
        expect(input.map((entry) => entry.id)).not.toContain(otherSlug);
        expect(await memoryBySlug(orphanSlug!)).toMatchObject({
            status: 'active',
        });
        expect(await memoryBySlug(otherSlug!)).toMatchObject({
            status: 'active',
        });
        const [run] = await runsForOwner(ownerUuid);
        expect(run).toMatchObject({ applied_count: 0, rejected_count: 2 });
        expect(
            run!.rejected_operations.every(
                (rejection) => rejection.reason === 'unknown_slug',
            ),
        ).toBe(true);
    });

    it('projects the curator’s view without summaries, counters or uuids', async () => {
        const slugs = await seedPartition({
            userUuid: ownerUuid,
            count: FLOOR,
            prefix: 'projection',
            objects: [
                { type: 'explore', name: resolvableExploreName },
                { type: 'explore', name: 'no_such_explore_exists' },
            ],
        });
        const cited = await memoryBySlug(slugs[5]!);
        await database(AiAgentMemoryTableName)
            .where('ai_agent_memory_uuid', cited.ai_agent_memory_uuid)
            .update({
                cited_count: 9,
                last_cited_at: new Date('2026-07-26T10:00:00Z'),
                pulled_count: 3,
                // A distill-time snapshot that disagrees with the live catalog.
                unresolved_objects: JSON.stringify([
                    { type: 'explore', name: resolvableExploreName },
                ]),
            });
        const call = cannedCall([]);

        await buildService(call).consolidate();

        const [{ input }] = call.mock.calls[0] as [
            {
                input: Array<{
                    id: string;
                    objects: Array<{ resolved: boolean }>;
                }>;
            },
        ];
        expect(input).toHaveLength(FLOOR);
        const serialized = JSON.stringify(input);
        expect(serialized).not.toContain('must never be shown');
        expect(serialized).not.toContain(cited.ai_agent_memory_uuid);
        expect(serialized).not.toContain('cited');
        expect(serialized).not.toContain('pulled');
        // Citation ranking still orders the payload, but the counters are gone.
        expect(input[0]!.id).toBe(slugs[5]);
        expect(input[0]!.objects.map((object) => object.resolved)).toEqual([
            true,
            false,
        ]);
    });

    it('does nothing for an organization whose memory flag is off', async () => {
        await seedPartition({
            userUuid: ownerUuid,
            count: FLOOR,
            prefix: 'flagoff',
        });
        await setFeatureFlag(FeatureFlags.AiAgentMemory, false);
        const call = cannedCall([]);

        await buildService(call).consolidate();

        expect(call).not.toHaveBeenCalled();
        expect(await runsForOwner(ownerUuid)).toHaveLength(0);
    });

    it('stops injecting curated-away rows and leaves un-consolidated partitions untouched', async () => {
        const slugs = await seedPartition({
            userUuid: ownerUuid,
            count: FLOOR,
            prefix: 'injection',
        });
        await seedPartition({
            userUuid: otherOwnerUuid,
            count: 3,
            prefix: 'untouched',
        });
        const renderFor = async (userUuid: string) => {
            const memories = await model.findActiveForProject({
                projectUuid: SEED_PROJECT.project_uuid,
                userUuid,
            });
            return {
                slugs: memories.map((memory) => memory.slug),
                block: renderMemoryBlock(
                    memories.map((memory) => ({
                        slug: memory.slug,
                        content: memory.raw_memory,
                        scope: memory.scope,
                        objects: memory.objects,
                        ageDays: 1,
                    })),
                ),
            };
        };
        const beforeOther = await renderFor(otherOwnerUuid);

        await buildService(
            cannedCall([
                {
                    type: 'supersede',
                    loser_slug: slugs[0]!,
                    winner_slug: slugs[1]!,
                    reason: 'Replaced by a later correction.',
                },
                {
                    type: 'retire',
                    slug: slugs[2]!,
                    reason: 'Its explore no longer resolves.',
                },
            ]),
        ).consolidate();

        const afterOwner = await renderFor(ownerUuid);
        expect(afterOwner.slugs).not.toContain(slugs[0]);
        expect(afterOwner.slugs).not.toContain(slugs[2]);
        expect(afterOwner.slugs).toContain(slugs[1]);
        expect(afterOwner.block).not.toContain(`id="${slugs[0]}"`);
        expect(afterOwner.block).not.toContain(`id="${slugs[2]}"`);
        expect(afterOwner.block).toContain(`id="${slugs[1]}"`);
        // Injection caps at 30 rows and appends the search hint, unchanged.
        expect(afterOwner.block!.match(/<ld-memory /g)).toHaveLength(28);

        // A partition that was never consolidated renders exactly as before.
        expect(await renderFor(otherOwnerUuid)).toEqual(beforeOther);
    });
});
