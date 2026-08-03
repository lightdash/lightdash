import {
    CommercialFeatureFlags,
    FeatureFlags,
    SEED_ORG_1,
    SEED_PROJECT,
    type AiAgentMemoryConsolidationOperation,
    type AiProjectContextTypedObjectRef,
} from '@lightdash/common';
import { randomUUID } from 'crypto';
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
import { AiThreadTableName } from '../../database/entities/ai';
import { AiAgentTableName } from '../../database/entities/aiAgent';
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
    let agentUuid: string;
    let resolvableExploreName: string;
    const originalFlags = new Map<string, DbFeatureFlag | undefined>();
    const createdUserUuids: string[] = [];
    const createdThreadUuids: string[] = [];

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

        const [agent] = await database(AiAgentTableName)
            .insert({
                organization_uuid: SEED_ORG_1.organization_uuid,
                project_uuid: SEED_PROJECT.project_uuid,
                name: 'Consolidation agent',
                slug: `consolidation-agent-${randomUUID().slice(0, 8)}`,
                description: null,
                image_url: null,
                image_url_source: null,
                tags: null,
                enable_data_access: false,
                enable_self_improvement: false,
                enable_content_tools: false,
                enable_user_context: false,
                admin_only: false,
                model_config: null,
                is_system: false,
                version: 1,
            })
            .returning<Array<{ ai_agent_uuid: string }>>('ai_agent_uuid');
        agentUuid = agent.ai_agent_uuid;

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
        if (createdThreadUuids.length > 0) {
            await database(AiThreadTableName)
                .whereIn('ai_thread_uuid', createdThreadUuids)
                .delete();
            createdThreadUuids.length = 0;
        }
    });

    afterAll(async () => {
        await database(AiAgentTableName)
            .where('ai_agent_uuid', agentUuid)
            .delete();
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

    /** Observes sweep enqueues without inserting real graphile jobs. */
    const stubSchedulerClient = () => ({
        aiAgentMemoryDistill: vi.fn(async () => ({ jobId: 'stub-job' })),
        aiAgentMemoryConsolidatePartition: vi.fn(async () => ({})),
    });

    const buildService = (
        consolidateCall: AiAgentMemoryConsolidateCall,
        {
            consolidationDryRun = false,
            schedulerClientOverride,
        }: {
            consolidationDryRun?: boolean;
            schedulerClientOverride?: ReturnType<typeof stubSchedulerClient>;
        } = {},
    ) =>
        new AiAgentMemoryService({
            analytics,
            aiAgentMemoryModel: model,
            aiAgentModel: getTestContext().app.getModels().getAiAgentModel(),
            groupsModel: getTestContext().app.getModels().getGroupsModel(),
            projectModel: getTestContext().app.getModels().getProjectModel(),
            featureFlagService,
            schedulerClient: schedulerClientOverride ?? schedulerClient,
            consolidationDryRun,
            consolidateCall,
        });

    /** The payload the sweep enqueues for one seeded partition. */
    const partitionPayload = (ownerUserUuid: string) => ({
        organizationUuid: SEED_ORG_1.organization_uuid,
        projectUuid: SEED_PROJECT.project_uuid,
        userUuid: 'system',
        ownerUserUuid,
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

    /** The row a merge created: its stored slug carries a uniqueness suffix. */
    const mergedRow = async (handle: string): Promise<DbAiAgentMemory> => {
        const row = await database(AiAgentMemoryTableName)
            .where('project_uuid', SEED_PROJECT.project_uuid)
            .whereILike('slug', `${handle}-%`)
            .first<DbAiAgentMemory>();
        if (!row) throw new Error(`Missing merged memory for ${handle}`);
        return row;
    };

    /** Gives a seeded row the distill-time provenance a real memory has. */
    const attachSourceThread = async (slug: string): Promise<string> => {
        const [thread] = await database(AiThreadTableName)
            .insert({
                organization_uuid: SEED_ORG_1.organization_uuid,
                project_uuid: SEED_PROJECT.project_uuid,
                created_from: 'web_app',
                agent_uuid: agentUuid,
            })
            .returning<Array<{ ai_thread_uuid: string }>>('ai_thread_uuid');
        createdThreadUuids.push(thread.ai_thread_uuid);
        await database(AiAgentMemoryTableName)
            .where('project_uuid', SEED_PROJECT.project_uuid)
            .where('slug', slug)
            .update({
                source_thread_uuid: thread.ai_thread_uuid,
                agent_uuid: agentUuid,
            });
        return thread.ai_thread_uuid;
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

        await service.consolidateScheduledPartition(
            partitionPayload(ownerUuid),
        );

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

    it('merges into one active row that inherits what its sources earned', async () => {
        const slugs = await seedPartition({
            userUuid: ownerUuid,
            count: FLOOR,
            prefix: 'merge',
        });
        const [first, second] = [slugs[0]!, slugs[1]!];
        const exploreObject = {
            type: 'explore' as const,
            name: resolvableExploreName,
        };
        const fieldObject = {
            type: 'field' as const,
            explore: resolvableExploreName,
            fieldId: `${resolvableExploreName}_status`,
        };
        await Promise.all([
            attachSourceThread(first),
            attachSourceThread(second),
        ]);
        await database(AiAgentMemoryTableName)
            .where('project_uuid', SEED_PROJECT.project_uuid)
            .where('slug', first)
            .update({
                scope: 'project',
                objects: JSON.stringify([exploreObject]),
                cited_count: 4,
                last_cited_at: new Date('2026-07-25T10:00:00Z'),
                pulled_count: 6,
                last_pulled_at: new Date('2026-07-26T10:00:00Z'),
            });
        await database(AiAgentMemoryTableName)
            .where('project_uuid', SEED_PROJECT.project_uuid)
            .where('slug', second)
            .update({
                objects: JSON.stringify([fieldObject]),
                cited_count: 3,
                last_cited_at: new Date('2026-07-27T10:00:00Z'),
                pulled_count: 1,
                last_pulled_at: null,
            });
        const sources = await Promise.all([
            memoryBySlug(first),
            memoryBySlug(second),
        ]);

        await buildService(
            cannedCall([
                {
                    type: 'merge',
                    source_slugs: [first, second],
                    slug: 'consolidation-merged',
                    title: 'One revenue convention',
                    memory: 'Revenue always means net revenue after refunds.',
                    terms: ['net revenue'],
                    objects: [
                        exploreObject,
                        fieldObject,
                        { type: 'explore', name: 'no_source_named_this' },
                    ],
                    reason: 'Both memories state the same convention.',
                },
            ]),
        ).consolidateScheduledPartition(partitionPayload(ownerUuid));

        const merged = await mergedRow('consolidation-merged');
        expect(merged).toMatchObject({
            status: 'active',
            user_uuid: ownerUuid,
            // No source thread and no summary: this is what routes the memory
            // page to its consolidated-provenance branch.
            source_thread_uuid: null,
            thread_summary: null,
            agent_uuid: agentUuid,
            title: 'One revenue convention',
            raw_memory: 'Revenue always means net revenue after refunds.',
            // Objects stay a subset of the union of the sources' objects.
            objects: [exploreObject, fieldObject],
            // Mixed scope narrows; it never widens to project.
            scope: 'user',
            cited_count: 7,
            last_cited_at: new Date('2026-07-27T10:00:00Z'),
            pulled_count: 7,
            last_pulled_at: new Date('2026-07-26T10:00:00Z'),
            // The newest evidence behind it, never the merge time.
            generated_at: sources[0]!.generated_at,
        });
        // The row's real insert time is the created-at column, not generated_at.
        expect(merged.created_at.getTime()).toBeGreaterThan(
            merged.generated_at.getTime(),
        );

        const [supersededFirst, supersededSecond] = await Promise.all([
            memoryBySlug(first),
            memoryBySlug(second),
        ]);
        expect(supersededFirst).toMatchObject({
            status: 'superseded',
            superseded_by_uuid: merged.ai_agent_memory_uuid,
            raw_memory: sources[0]!.raw_memory,
        });
        expect(supersededSecond).toMatchObject({
            status: 'superseded',
            superseded_by_uuid: merged.ai_agent_memory_uuid,
            raw_memory: sources[1]!.raw_memory,
        });

        // Consolidated provenance: the memory page's lineage branch, and a
        // replacement pointer that leads a citation of a merged-away memory
        // somewhere useful.
        const reader = buildService(cannedCall([]));
        const page = await reader.getMemory(
            getTestContext().testUser,
            SEED_PROJECT.project_uuid,
            merged.slug,
        );
        expect(page.provenance.type).toBe('consolidated');
        expect(
            page.provenance.type === 'consolidated'
                ? page.provenance.sources.map((source) => source.slug).sort()
                : [],
        ).toEqual([first, second].sort());
        expect(page.replacementSlug).toBeNull();
        await expect(
            reader
                .getMemory(
                    getTestContext().testUser,
                    SEED_PROJECT.project_uuid,
                    first,
                )
                .then((source) => source.replacementSlug),
        ).resolves.toBe(merged.slug);

        // Injection renders the merged row and neither of its sources.
        const active = await model.findActiveForProject({
            projectUuid: SEED_PROJECT.project_uuid,
            userUuid: ownerUuid,
        });
        const activeSlugs = active.map((memory) => memory.slug);
        expect(activeSlugs).toContain(merged.slug);
        expect(activeSlugs).not.toContain(first);
        expect(activeSlugs).not.toContain(second);
        // Inherited citations, not the merge time, decide where it ranks.
        expect(activeSlugs[0]).toBe(merged.slug);
        const block = renderMemoryBlock(
            active.map((memory) => ({
                slug: memory.slug,
                content: memory.raw_memory,
                scope: memory.scope,
                objects: memory.objects,
                ageDays: 1,
            })),
        );
        expect(block).toContain(`id="${merged.slug}"`);
        expect(block).not.toContain(`id="${first}"`);
        expect(block).not.toContain(`id="${second}"`);

        const [run] = await runsForOwner(ownerUuid);
        expect(run).toMatchObject({ applied_count: 1, rejected_count: 0 });
        expect(run!.applied_operations[0]).toMatchObject({
            type: 'merge',
            slug: merged.slug,
            objects: [exploreObject, fieldObject],
        });
    });

    it('keeps a merged row at project scope only when every source is', async () => {
        const slugs = await seedPartition({
            userUuid: ownerUuid,
            count: FLOOR,
            prefix: 'scope',
        });
        await database(AiAgentMemoryTableName)
            .where('project_uuid', SEED_PROJECT.project_uuid)
            .whereIn('slug', [slugs[0]!, slugs[1]!])
            .update({ scope: 'project' });

        await buildService(
            cannedCall([
                {
                    type: 'merge',
                    source_slugs: [slugs[0]!, slugs[1]!],
                    slug: 'consolidation-scoped',
                    title: 'Project knowledge',
                    memory: 'One claim.',
                    terms: [],
                    objects: [],
                    reason: 'Both memories state the same convention.',
                },
            ]),
        ).consolidateScheduledPartition(partitionPayload(ownerUuid));

        expect(await mergedRow('consolidation-scoped')).toMatchObject({
            scope: 'project',
        });
    });

    it('flags the merged row’s objects from the live catalog, not its sources’ snapshots', async () => {
        const exploreObject = {
            type: 'explore' as const,
            name: resolvableExploreName,
        };
        const missingObject = {
            type: 'explore' as const,
            name: 'no_such_explore_exists',
        };
        const slugs = await seedPartition({
            userUuid: ownerUuid,
            count: FLOOR,
            prefix: 'staleflags',
            objects: [exploreObject, missingObject],
        });
        // A distill-time snapshot the live catalog has since contradicted.
        await database(AiAgentMemoryTableName)
            .where('project_uuid', SEED_PROJECT.project_uuid)
            .whereIn('slug', [slugs[0]!, slugs[1]!])
            .update({ unresolved_objects: JSON.stringify([exploreObject]) });

        await buildService(
            cannedCall([
                {
                    type: 'merge',
                    source_slugs: [slugs[0]!, slugs[1]!],
                    slug: 'consolidation-flags',
                    title: 'Merged',
                    memory: 'One claim.',
                    terms: [],
                    objects: [exploreObject, missingObject],
                    reason: 'Both memories state the same convention.',
                },
            ]),
        ).consolidateScheduledPartition(partitionPayload(ownerUuid));

        expect(await mergedRow('consolidation-flags')).toMatchObject({
            unresolved_objects: [missingObject],
        });
    });

    it('never merges across two owners', async () => {
        const slugs = await seedPartition({
            userUuid: ownerUuid,
            count: FLOOR,
            prefix: 'mergeowner',
        });
        const [otherSlug] = await seedPartition({
            userUuid: otherOwnerUuid,
            count: 1,
            prefix: 'mergeotherowner',
        });

        await buildService(
            cannedCall([
                {
                    type: 'merge',
                    source_slugs: [slugs[0]!, otherSlug!],
                    slug: 'consolidation-crossowner',
                    title: 'Merged across owners',
                    memory: 'One claim.',
                    terms: [],
                    objects: [],
                    reason: 'Same claim twice.',
                },
            ]),
        ).consolidateScheduledPartition(partitionPayload(ownerUuid));

        const [run] = await runsForOwner(ownerUuid);
        expect(run).toMatchObject({ applied_count: 0, rejected_count: 1 });
        expect(run!.rejected_operations[0]!.reason).toBe('unknown_slug');
        await expect(mergedRow('consolidation-crossowner')).rejects.toThrow();
        expect(await memoryBySlug(otherSlug!)).toMatchObject({
            status: 'active',
        });
        expect(await memoryBySlug(slugs[0]!)).toMatchObject({
            status: 'active',
        });
    });

    it('shows a second pass the merged row instead of its sources', async () => {
        // One row above the floor, so folding two into one keeps the
        // partition eligible for the verification pass.
        const slugs = await seedPartition({
            userUuid: ownerUuid,
            count: FLOOR + 1,
            prefix: 'secondpass',
        });
        await buildService(
            cannedCall([
                {
                    type: 'merge',
                    source_slugs: [slugs[0]!, slugs[1]!],
                    slug: 'consolidation-secondpass',
                    title: 'Merged',
                    memory: 'One claim.',
                    terms: [],
                    objects: [],
                    reason: 'Both memories state the same convention.',
                },
            ]),
        ).consolidateScheduledPartition(partitionPayload(ownerUuid));
        const merged = await mergedRow('consolidation-secondpass');

        // The corpus moved, so the pass runs again; the curator finding nothing
        // left to do is a successful no-op run.
        const second = cannedCall([]);
        await buildService(second).consolidateScheduledPartition(
            partitionPayload(ownerUuid),
        );

        const [{ input }] = second.mock.calls[0] as [
            { input: Array<{ id: string }> },
        ];
        const ids = input.map((entry) => entry.id);
        expect(ids).toContain(merged.slug);
        expect(ids).not.toContain(slugs[0]);
        expect(ids).not.toContain(slugs[1]);

        const third = cannedCall([]);
        await buildService(third).consolidateScheduledPartition(
            partitionPayload(ownerUuid),
        );
        expect(third).not.toHaveBeenCalled();
        expect(await mergedRow('consolidation-secondpass')).toMatchObject({
            ai_agent_memory_uuid: merged.ai_agent_memory_uuid,
            status: 'active',
        });
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
                    source_slugs: [slugs[0]!, slugs[0]!],
                    slug: 'consolidation-merged',
                    title: 'Merged',
                    memory: 'One claim.',
                    terms: [],
                    objects: [],
                    reason: 'A merge that names one memory twice.',
                },
                {
                    type: 'retire',
                    slug: slugs[3]!,
                    reason: 'Its explore no longer resolves.',
                },
            ]),
        );

        await service.consolidateScheduledPartition(
            partitionPayload(ownerUuid),
        );

        const [run] = await runsForOwner(ownerUuid);
        expect(run).toMatchObject({
            status: 'succeeded',
            applied_count: 1,
            rejected_count: 2,
        });
        expect(
            run!.rejected_operations.map((rejection) => rejection.reason),
        ).toEqual(['unknown_slug', 'insufficient_sources']);
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

        await service.consolidateScheduledPartition(
            partitionPayload(ownerUuid),
        );

        const [run] = await runsForOwner(ownerUuid);
        expect(run).toMatchObject({ applied_count: 1, rejected_count: 1 });
        expect(
            run!.rejected_operations.map((rejection) => rejection.reason),
        ).toEqual(['unknown_slug']);
        // The merged row exists, but under a slug no operation could have named.
        expect(await mergedRow('consolidation-merged')).toMatchObject({
            status: 'active',
        });
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
            await database(AiAgentMemoryTableName)
                .where('project_uuid', SEED_PROJECT.project_uuid)
                .where('slug', slugs[4]!)
                .update({ status: 'retired' });
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
                        type: 'merge',
                        source_slugs: [slugs[4]!, slugs[5]!],
                        slug: 'consolidation-moved-merge',
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
                ],
            };
        });

        await service.consolidateScheduledPartition(
            partitionPayload(ownerUuid),
        );

        const [run] = await runsForOwner(ownerUuid);
        expect(run).toMatchObject({
            status: 'succeeded',
            applied_count: 1,
            rejected_count: 3,
        });
        expect(
            run!.rejected_operations.map((rejection) => rejection.reason),
        ).toEqual(['row_moved', 'row_moved', 'row_moved']);
        expect(await memoryBySlug(slugs[1]!)).toMatchObject({
            status: 'active',
            superseded_by_uuid: null,
        });
        // A rejected merge creates no row, so its unmoved source stays active
        // rather than pointing at a merged row nothing can reconcile.
        await expect(mergedRow('consolidation-moved-merge')).rejects.toThrow();
        expect(await memoryBySlug(slugs[5]!)).toMatchObject({
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

            await service.consolidateScheduledPartition(
                partitionPayload(ownerUuid),
            );
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
                unresolvedObjectKeys: new Set<string>(),
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
        await buildService(first).consolidateScheduledPartition(
            partitionPayload(ownerUuid),
        );

        const second = cannedCall([]);
        await buildService(second).consolidateScheduledPartition(
            partitionPayload(ownerUuid),
        );

        expect(first).toHaveBeenCalledOnce();
        expect(second).not.toHaveBeenCalled();
        expect(await runsForOwner(ownerUuid)).toHaveLength(1);
    });

    it('records a full proposal in dry-run mode without touching a memory row', async () => {
        const slugs = await seedPartition({
            userUuid: ownerUuid,
            count: FLOOR,
            prefix: 'dryrun',
        });
        const rowsBefore = await database(AiAgentMemoryTableName)
            .where('project_uuid', SEED_PROJECT.project_uuid)
            .where('user_uuid', ownerUuid)
            .orderBy('slug', 'asc');
        const operations: AiAgentMemoryConsolidationOperation[] = [
            {
                type: 'merge',
                source_slugs: [slugs[0]!, slugs[1]!],
                slug: 'consolidation-dryrun-merged',
                title: 'One convention',
                memory: 'Revenue always means net revenue.',
                terms: ['net revenue'],
                objects: [],
                reason: 'Both memories state the same convention.',
            },
            {
                type: 'supersede',
                loser_slug: slugs[2]!,
                winner_slug: slugs[3]!,
                reason: 'The winner is the user’s later correction.',
            },
            { type: 'retire', slug: slugs[4]!, reason: 'Its explore is gone.' },
            { type: 'retire', slug: 'never-in-this-input', reason: 'Gone.' },
        ];
        const call = cannedCall(operations);

        await buildService(call, {
            consolidationDryRun: true,
        }).consolidateScheduledPartition(partitionPayload(ownerUuid));

        // The curator ran; the corpus is byte-for-byte what it was.
        expect(call).toHaveBeenCalledOnce();
        const rowsAfter = await database(AiAgentMemoryTableName)
            .where('project_uuid', SEED_PROJECT.project_uuid)
            .where('user_uuid', ownerUuid)
            .orderBy('slug', 'asc');
        expect(rowsAfter).toEqual(rowsBefore);

        const [run] = await runsForOwner(ownerUuid);
        expect(run).toMatchObject({
            status: 'succeeded',
            dry_run: true,
            input_count: FLOOR,
            applied_count: 3,
            rejected_count: 1,
            error_message: null,
        });
        expect(
            run!.applied_operations.map((operation) => operation.type),
        ).toEqual(['merge', 'supersede', 'retire']);
        expect(run!.rejected_operations[0]!.reason).toBe('unknown_slug');

        // One dry sample per changed corpus: the hash advanced.
        const second = cannedCall([]);
        await buildService(second, {
            consolidationDryRun: true,
        }).consolidateScheduledPartition(partitionPayload(ownerUuid));
        expect(second).not.toHaveBeenCalled();
        expect(await runsForOwner(ownerUuid)).toHaveLength(1);
    });

    it('rejects a dry-run proposal moved by a concurrent live run', async () => {
        const slugs = await seedPartition({
            userUuid: ownerUuid,
            count: FLOOR,
            prefix: 'dryrace',
        });
        const operation: AiAgentMemoryConsolidationOperation = {
            type: 'retire',
            slug: slugs[0]!,
            reason: 'Its explore is gone.',
        };
        let releaseDryRun!: () => void;
        const liveFinished = new Promise<void>((resolve) => {
            releaseDryRun = resolve;
        });
        const dryCall = vi.fn(async () => {
            await liveFinished;
            return { operations: [operation] };
        });
        const dryRun = buildService(dryCall, {
            consolidationDryRun: true,
        }).consolidateScheduledPartition(partitionPayload(ownerUuid));
        await vi.waitFor(() => expect(dryCall).toHaveBeenCalledOnce());

        await buildService(
            cannedCall([operation]),
        ).consolidateScheduledPartition(partitionPayload(ownerUuid));
        releaseDryRun();
        await expect(dryRun).resolves.toBe('dry_run');

        const runs = await runsForOwner(ownerUuid);
        const preview = runs.find((run) => run.dry_run);
        expect(preview).toMatchObject({
            applied_count: 0,
            rejected_count: 1,
        });
        expect(preview!.rejected_operations[0]!.reason).toBe('row_moved');
    });

    it('still consolidates an unchanged corpus once dry-run mode is turned off', async () => {
        await seedPartition({
            userUuid: ownerUuid,
            count: FLOOR,
            prefix: 'dryoff',
        });
        const preview = cannedCall([]);
        await buildService(preview, {
            consolidationDryRun: true,
        }).consolidateScheduledPartition(partitionPayload(ownerUuid));
        expect(preview).toHaveBeenCalledOnce();

        // The dry run applied nothing: the first live pass still owes this
        // corpus its curation, even though the hash has not moved.
        const live = cannedCall([]);
        await buildService(live).consolidateScheduledPartition(
            partitionPayload(ownerUuid),
        );

        expect(live).toHaveBeenCalledOnce();
        const runs = await runsForOwner(ownerUuid);
        expect(runs.map((run) => run.dry_run)).toEqual([true, false]);
        expect(runs[0]!.input_hash).toBe(runs[1]!.input_hash);
    });

    it('does not retry a failed partition until the corpus changes', async () => {
        await seedPartition({
            userUuid: ownerUuid,
            count: FLOOR,
            prefix: 'failskip',
        });
        const failing = vi.fn().mockRejectedValue(new Error('model exploded'));
        await buildService(failing).consolidateScheduledPartition(
            partitionPayload(ownerUuid),
        );

        const afterFailure = cannedCall([]);
        await buildService(afterFailure).consolidateScheduledPartition(
            partitionPayload(ownerUuid),
        );
        expect(afterFailure).not.toHaveBeenCalled();

        await seedPartition({
            userUuid: ownerUuid,
            count: 1,
            prefix: 'failskip-new',
        });
        const afterChange = cannedCall([]);
        await buildService(afterChange).consolidateScheduledPartition(
            partitionPayload(ownerUuid),
        );

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
        const enqueue = stubSchedulerClient();
        const call = cannedCall([]);
        const service = buildService(call, {
            schedulerClientOverride: enqueue,
        });

        // The sweep never enqueues a below-floor partition...
        await service.sweepConsolidationPartitions();
        expect(
            enqueue.aiAgentMemoryConsolidatePartition,
        ).not.toHaveBeenCalledWith(partitionPayload(otherOwnerUuid));

        // ...and a stale job for one is a quiet skip on the recheck.
        await expect(
            service.consolidateScheduledPartition(
                partitionPayload(otherOwnerUuid),
            ),
        ).resolves.toBe('skipped');

        expect(call).not.toHaveBeenCalled();
        expect(await runsForOwner(otherOwnerUuid)).toHaveLength(0);
    });

    it('sweep enqueues one keyed job per eligible partition', async () => {
        await seedPartition({
            userUuid: ownerUuid,
            count: FLOOR,
            prefix: 'sweep',
        });
        const enqueue = stubSchedulerClient();

        const enqueued = await buildService(cannedCall([]), {
            schedulerClientOverride: enqueue,
        }).sweepConsolidationPartitions();

        expect(enqueued).toBeGreaterThanOrEqual(1);
        expect(enqueue.aiAgentMemoryConsolidatePartition).toHaveBeenCalledWith(
            partitionPayload(ownerUuid),
        );
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

        await buildService(call).consolidateScheduledPartition(
            partitionPayload(ownerUuid),
        );

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

        await buildService(call).consolidateScheduledPartition(
            partitionPayload(ownerUuid),
        );

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
        const enqueue = stubSchedulerClient();
        const call = cannedCall([]);
        const service = buildService(call, {
            schedulerClientOverride: enqueue,
        });

        // The sweep filters the organization out...
        await service.sweepConsolidationPartitions();
        expect(
            enqueue.aiAgentMemoryConsolidatePartition,
        ).not.toHaveBeenCalledWith(partitionPayload(ownerUuid));

        // ...and a job enqueued before the flag flipped skips on the recheck.
        await expect(
            service.consolidateScheduledPartition(partitionPayload(ownerUuid)),
        ).resolves.toBe('skipped');

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
        ).consolidateScheduledPartition(partitionPayload(ownerUuid));

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
