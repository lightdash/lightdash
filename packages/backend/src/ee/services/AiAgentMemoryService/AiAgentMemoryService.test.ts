import { Ability, AbilityBuilder } from '@casl/ability';
import {
    CommercialFeatureFlags,
    DimensionType,
    FeatureFlags,
    FieldType,
    ProjectType,
    SupportedDbtAdapter,
    type AnyType,
    type Explore,
    type MemberAbility,
} from '@lightdash/common';
import { vi } from 'vitest';
import type { AiAgentMemoryThread } from '../../models/AiAgentMemoryModel';
import {
    AiAgentMemoryService,
    validateMemoryObjects,
} from './AiAgentMemoryService';

const distillableThread = (
    activity: Date,
    overrides: Partial<AiAgentMemoryThread> = {},
): AiAgentMemoryThread => ({
    threadUuid: 'thread-enabled',
    organizationUuid: 'org-enabled',
    projectUuid: 'project-enabled',
    agentUuid: 'agent-1',
    title: 'Revenue definitions',
    createdFrom: 'slack',
    projectType: ProjectType.DEFAULT,
    latestActivity: activity,
    distilledUpTo: null,
    turns: [
        {
            promptUuid: 'prompt-1',
            createdAt: activity,
            userText: 'Revenue means net revenue here',
            assistantText: 'Answer',
            errorMessage: null,
            respondedAt: activity,
            interrupted: false,
            feedback: null,
            steers: [],
            tools: [],
        },
    ],
    ...overrides,
});

const explore: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'orders',
    label: 'Orders',
    tags: [],
    spotlight: { visibility: 'show', categories: [] },
    baseTable: 'orders',
    joinedTables: [],
    tables: {
        orders: {
            name: 'orders',
            label: 'Orders',
            database: 'db',
            schema: 'public',
            sqlTable: 'orders',
            sqlWhere: undefined,
            uncompiledSqlWhere: undefined,
            description: undefined,
            requiredFilters: [],
            dimensions: {
                status: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    name: 'status',
                    label: 'Status',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: '${TABLE}.status',
                    hidden: false,
                    source: undefined,
                    compiledSql: 'orders.status',
                    tablesReferences: ['orders'],
                    description: undefined,
                },
            },
            metrics: {},
            lineageGraph: {},
        },
    },
};

describe('validateMemoryObjects', () => {
    it('validates explore then field exactly and collects unresolved refs', () => {
        const validExplore = { type: 'explore' as const, name: 'orders' };
        const validField = {
            type: 'field' as const,
            explore: 'orders',
            fieldId: 'orders_status',
        };
        const wrongExplore = {
            type: 'field' as const,
            explore: 'missing',
            fieldId: 'orders_status',
        };
        const wrongCase = {
            type: 'field' as const,
            explore: 'orders',
            fieldId: 'Orders_Status',
        };

        expect(
            validateMemoryObjects(
                [validExplore, validField, wrongExplore, wrongCase],
                { orders: explore },
            ),
        ).toEqual({
            resolved: [validExplore, validField],
            unresolved: [wrongExplore, wrongCase],
        });
    });
});
describe('AiAgentMemoryService', () => {
    const buildUser = (
        canViewProject: boolean,
        { canManageAgents = false } = {},
    ) => {
        const { build: buildAbility, can } = new AbilityBuilder<MemberAbility>(
            Ability,
        );
        if (canViewProject) {
            can('view', 'Project', {
                organizationUuid: 'org-enabled',
            });
            if (canManageAgents) {
                can('manage', 'AiAgent', {
                    projectUuid: 'project-enabled',
                });
            }
        }
        return {
            organizationUuid: 'org-enabled',
            userUuid: 'current-user',
            ability: buildAbility(),
        } as AnyType;
    };

    const build = ({ enabledOrganization = 'org-enabled' } = {}) => {
        const getFlag = vi.fn(async ({ user, featureFlagId }) => ({
            id: featureFlagId,
            enabled:
                user.organizationUuid === enabledOrganization &&
                (featureFlagId === FeatureFlags.AiAgentMemory ||
                    featureFlagId === CommercialFeatureFlags.AiCopilot),
        }));
        const findByProjectAndSlug = vi.fn();
        const findByProjectAndUuid = vi.fn();
        const findThreadsDueForDistill = vi.fn();
        const findThreadForDistill = vi.fn();
        const upsertSourceThreadMemory = vi.fn().mockResolvedValue({
            ai_agent_memory_uuid: 'memory-1',
        });
        const upsertThreadDistill = vi.fn();
        const findActiveForProject = vi.fn().mockResolvedValue([]);
        const findActiveBySourceThread = vi.fn().mockResolvedValue(undefined);
        const resolveSourceThreadMemoryState = vi
            .fn()
            .mockResolvedValue('none');
        const updateStatus = vi.fn().mockResolvedValue(true);
        const findUserMemoriesPaginated = vi.fn().mockResolvedValue({
            data: { memories: [] },
            pagination: {
                page: 1,
                pageSize: 50,
                totalPageCount: 0,
                totalResults: 0,
            },
        });
        const findConsolidationCandidates = vi.fn().mockResolvedValue([]);
        const findLatestConsolidationRun = vi.fn().mockResolvedValue(undefined);
        const recordConsolidationRun = vi.fn().mockResolvedValue({});
        const applyConsolidation = vi.fn().mockResolvedValue({
            run: {},
            applied: [],
            rejected: [],
        });
        const findExploresFromCache = vi.fn().mockResolvedValue({});
        const aiAgentMemoryDistill = vi.fn();
        const aiAgentMemoryConsolidatePartition = vi.fn();
        const getAgent = vi.fn().mockResolvedValue({
            uuid: 'agent-1',
            name: 'Agent',
            organizationUuid: 'org-enabled',
            projectUuid: 'project-enabled',
            adminOnly: false,
            groupAccess: [],
            userAccess: [],
        });
        const findThreadOwnership = vi.fn().mockResolvedValue({
            threadUuid: 'thread-enabled',
            projectUuid: 'project-enabled',
            agentUuid: 'agent-1',
            ownerUserUuid: 'source-user',
        });
        const findUserInGroups = vi.fn().mockResolvedValue([]);
        const getProjectSummary = vi.fn(async (projectUuid: string) => ({
            organizationUuid:
                projectUuid === 'project-other' ? 'org-other' : 'org-enabled',
        }));
        const distillCall = vi.fn();
        const consolidateCall = vi.fn().mockResolvedValue({ operations: [] });
        const track = vi.fn();
        const prometheusMetrics = {
            trackAiAgentMemoryDistill: vi.fn(),
            incrementAiAgentMemorySweepEnqueued: vi.fn(),
            trackAiAgentMemoryConsolidate: vi.fn(),
            trackAiAgentMemoryConsolidateOperations: vi.fn(),
            incrementAiAgentMemoryEligiblePartitions: vi.fn(),
        };
        const service = new AiAgentMemoryService({
            analytics: { track } as AnyType,
            prometheusMetrics: prometheusMetrics as AnyType,
            aiAgentMemoryModel: {
                findByProjectAndSlug,
                findByProjectAndUuid,
                findThreadsDueForDistill,
                findThreadForDistill,
                upsertSourceThreadMemory,
                upsertThreadDistill,
                findActiveForProject,
                findActiveBySourceThread,
                resolveSourceThreadMemoryState,
                updateStatus,
                findUserMemoriesPaginated,
                findConsolidationCandidates,
                findLatestConsolidationRun,
                recordConsolidationRun,
                applyConsolidation,
            } as AnyType,
            aiAgentModel: { getAgent, findThreadOwnership } as AnyType,
            groupsModel: { findUserInGroups } as AnyType,
            projectModel: {
                getSummary: getProjectSummary,
                findExploresFromCache,
            } as AnyType,
            featureFlagService: { get: getFlag } as AnyType,
            schedulerClient: {
                aiAgentMemoryDistill,
                aiAgentMemoryConsolidatePartition,
            },
            distillCall,
            consolidateCall,
        });
        return {
            service,
            getFlag,
            findByProjectAndSlug,
            findByProjectAndUuid,
            findThreadsDueForDistill,
            findThreadForDistill,
            upsertSourceThreadMemory,
            upsertThreadDistill,
            findActiveForProject,
            findActiveBySourceThread,
            resolveSourceThreadMemoryState,
            updateStatus,
            findUserMemoriesPaginated,
            findConsolidationCandidates,
            findLatestConsolidationRun,
            recordConsolidationRun,
            applyConsolidation,
            findExploresFromCache,
            aiAgentMemoryDistill,
            aiAgentMemoryConsolidatePartition,
            getAgent,
            findThreadOwnership,
            distillCall,
            consolidateCall,
            track,
            prometheusMetrics,
        };
    };

    const memoryRow = (
        overrides: Record<string, unknown> = {},
    ): Record<string, unknown> => ({
        ai_agent_memory_uuid: 'memory-1',
        slug: 'net-revenue-ab12cd34',
        title: 'Net revenue convention',
        raw_memory: 'Use net revenue.',
        terms: [],
        objects: [],
        status: 'active',
        scope: 'user',
        agent_uuid: 'agent-1',
        user_uuid: 'source-user',
        source_thread_uuid: 'thread-enabled',
        generated_at: new Date('2026-07-22T10:00:00Z'),
        cited_count: 3,
        ...overrides,
    });

    const lineageSource = (overrides: Record<string, unknown> = {}) => ({
        slug: 'net-revenue-ab12cd34',
        agent_uuid: 'agent-1',
        source_thread_uuid: 'thread-enabled',
        thread_summary: '**The user** established the convention.',
        thread_title: 'Revenue definitions',
        ...overrides,
    });

    it('enqueues the exact activity watermark selected by the sweep', async () => {
        const { service, findThreadsDueForDistill, aiAgentMemoryDistill } =
            build();
        const latestActivity = new Date('2026-07-22T05:00:00.123Z');
        findThreadsDueForDistill.mockResolvedValue([
            {
                threadUuid: 'thread-enabled',
                organizationUuid: 'org-enabled',
                projectUuid: 'project-enabled',
                latestActivity,
            },
        ]);

        await expect(
            service.sweep(new Date('2026-07-22T12:00:00.000Z')),
        ).resolves.toBe(1);

        expect(aiAgentMemoryDistill).toHaveBeenCalledWith({
            organizationUuid: 'org-enabled',
            projectUuid: 'project-enabled',
            userUuid: 'system',
            threadUuid: 'thread-enabled',
            sweptUpdatedAt: '2026-07-22T05:00:00.123Z',
        });
    });

    it('returns full source provenance to an agent manager', async () => {
        const { service, findByProjectAndSlug, getAgent } = build();
        findByProjectAndSlug.mockResolvedValue({
            memory: memoryRow({
                objects: [
                    {
                        type: 'field',
                        explore: 'orders',
                        fieldId: 'orders_net_revenue',
                    },
                ],
                terms: ['net revenue'],
            }),
            sources: [lineageSource()],
            replacement: null,
        });
        getAgent.mockResolvedValue({
            uuid: 'agent-1',
            name: 'Agent',
            organizationUuid: 'org-enabled',
            projectUuid: 'project-enabled',
            adminOnly: true,
            groupAccess: [],
            userAccess: [],
        });
        const user = buildUser(true, { canManageAgents: true });

        await expect(
            service.getMemory(user, 'project-enabled', 'net-revenue-ab12cd34'),
        ).resolves.toMatchObject({
            uuid: 'memory-1',
            slug: 'net-revenue-ab12cd34',
            title: 'Net revenue convention',
            generatedAt: '2026-07-22T10:00:00.000Z',
            citedCount: 3,
            scope: 'user',
            provenance: {
                type: 'source_thread',
                source: {
                    slug: 'net-revenue-ab12cd34',
                    agentUuid: 'agent-1',
                    threadUuid: 'thread-enabled',
                    threadTitle: 'Revenue definitions',
                    threadSummary: '**The user** established the convention.',
                },
            },
        });
    });

    it('hides another user’s memory from a project viewer without thread access', async () => {
        const { service, findByProjectAndSlug } = build();
        findByProjectAndSlug.mockResolvedValue({
            memory: memoryRow(),
            sources: [lineageSource()],
            replacement: null,
        });

        await expect(
            service.getMemory(
                buildUser(true),
                'project-enabled',
                'net-revenue-ab12cd34',
            ),
        ).rejects.toThrow('Memory not found: net-revenue-ab12cd34');
    });

    it('returns the memory to its owner without manage access', async () => {
        const { service, findByProjectAndSlug } = build();
        findByProjectAndSlug.mockResolvedValue({
            memory: memoryRow({ user_uuid: 'current-user' }),
            sources: [lineageSource({ thread_title: 'Owner-visible title' })],
            replacement: null,
        });

        await expect(
            service.getMemory(
                buildUser(true),
                'project-enabled',
                'net-revenue-ab12cd34',
            ),
        ).resolves.toMatchObject({
            provenance: {
                type: 'source_thread',
                source: { threadTitle: 'Owner-visible title' },
            },
        });
    });

    it('lets the owner retire an active memory by UUID', async () => {
        const { service, findByProjectAndUuid, updateStatus } = build();
        findByProjectAndUuid.mockResolvedValue(
            memoryRow({ user_uuid: 'current-user' }),
        );

        await expect(
            service.updateMemoryStatus(
                buildUser(true),
                'project-enabled',
                'memory-1',
                'retired',
            ),
        ).resolves.toBeUndefined();
        expect(findByProjectAndUuid).toHaveBeenCalledWith({
            projectUuid: 'project-enabled',
            memoryUuid: 'memory-1',
        });
        expect(updateStatus).toHaveBeenCalledWith({
            memoryUuid: 'memory-1',
            status: 'retired',
        });
    });

    it('does not reactivate a memory when its source has a newer active memory', async () => {
        const {
            service,
            findByProjectAndUuid,
            findActiveBySourceThread,
            updateStatus,
        } = build();
        findByProjectAndUuid.mockResolvedValue(
            memoryRow({
                user_uuid: 'current-user',
                status: 'retired',
            }),
        );
        findActiveBySourceThread.mockResolvedValue({
            ai_agent_memory_uuid: 'newer-memory',
        });

        await expect(
            service.updateMemoryStatus(
                buildUser(true),
                'project-enabled',
                'memory-1',
                'active',
            ),
        ).rejects.toThrow('A newer memory from this source is already active');
        expect(updateStatus).not.toHaveBeenCalled();
    });

    it('keeps superseded memories read-only', async () => {
        const { service, findByProjectAndUuid, updateStatus } = build();
        findByProjectAndUuid.mockResolvedValue(
            memoryRow({
                user_uuid: 'current-user',
                status: 'superseded',
            }),
        );

        await expect(
            service.updateMemoryStatus(
                buildUser(true),
                'project-enabled',
                'memory-1',
                'active',
            ),
        ).rejects.toThrow('Superseded memories are read-only');
        expect(updateStatus).not.toHaveBeenCalled();
    });

    it('decides access from the memory row without loading the source thread', async () => {
        const { service, findByProjectAndSlug, findThreadOwnership } = build();
        findByProjectAndSlug.mockResolvedValue({
            memory: memoryRow({
                user_uuid: 'current-user',
                source_thread_uuid: null,
            }),
            sources: [],
            replacement: null,
        });

        await expect(
            service.getMemory(
                buildUser(true),
                'project-enabled',
                'net-revenue-ab12cd34',
            ),
        ).resolves.toMatchObject({
            provenance: { type: 'consolidated', sources: [] },
        });
        expect(findThreadOwnership).not.toHaveBeenCalled();
    });

    it('hides the memory from its owner when the owner loses agent access', async () => {
        const { service, findByProjectAndSlug, getAgent } = build();
        findByProjectAndSlug.mockResolvedValue({
            memory: memoryRow({ user_uuid: 'current-user' }),
            sources: [lineageSource()],
            replacement: null,
        });
        getAgent.mockResolvedValue({
            uuid: 'agent-1',
            name: 'Agent',
            organizationUuid: 'org-enabled',
            projectUuid: 'project-enabled',
            adminOnly: true,
            groupAccess: [],
            userAccess: [],
        });

        await expect(
            service.getMemory(
                buildUser(true),
                'project-enabled',
                'net-revenue-ab12cd34',
            ),
        ).rejects.toThrow('Memory not found: net-revenue-ab12cd34');
    });

    it('exposes an unowned memory only to an agent manager', async () => {
        const { service, findByProjectAndSlug } = build();
        findByProjectAndSlug.mockResolvedValue({
            memory: memoryRow({ user_uuid: null }),
            sources: [lineageSource()],
            replacement: null,
        });

        await expect(
            service.getMemory(
                buildUser(true),
                'project-enabled',
                'net-revenue-ab12cd34',
            ),
        ).rejects.toThrow('Memory not found: net-revenue-ab12cd34');
        await expect(
            service.getMemory(
                buildUser(true, { canManageAgents: true }),
                'project-enabled',
                'net-revenue-ab12cd34',
            ),
        ).resolves.toMatchObject({ slug: 'net-revenue-ab12cd34' });
    });

    it('hides a memory whose agent is gone from everyone', async () => {
        const { service, findByProjectAndSlug, getAgent } = build();
        findByProjectAndSlug.mockResolvedValue({
            memory: memoryRow({ agent_uuid: null, user_uuid: 'current-user' }),
            sources: [lineageSource()],
            replacement: null,
        });

        await expect(
            service.getMemory(
                buildUser(true, { canManageAgents: true }),
                'project-enabled',
                'net-revenue-ab12cd34',
            ),
        ).rejects.toThrow('Memory not found: net-revenue-ab12cd34');
        expect(getAgent).not.toHaveBeenCalled();
    });

    it('keeps reading a memory separate from injecting it into the reader’s context', async () => {
        const { service, findByProjectAndSlug, findActiveForProject } = build();
        findByProjectAndSlug.mockResolvedValue({
            memory: memoryRow(),
            sources: [lineageSource()],
            replacement: null,
        });

        await expect(
            service.getMemory(
                buildUser(true, { canManageAgents: true }),
                'project-enabled',
                'net-revenue-ab12cd34',
            ),
        ).resolves.toMatchObject({ slug: 'net-revenue-ab12cd34' });
        expect(findActiveForProject).not.toHaveBeenCalled();
    });

    it('attributes a distilled memory to the thread owner, not the last prompter', async () => {
        const {
            service,
            findThreadForDistill,
            findThreadOwnership,
            upsertSourceThreadMemory,
            distillCall,
        } = build();
        const activity = new Date('2026-07-22T05:00:00.000Z');
        findThreadForDistill.mockResolvedValue({
            threadUuid: 'thread-enabled',
            organizationUuid: 'org-enabled',
            projectUuid: 'project-enabled',
            agentUuid: 'agent-1',
            title: 'Revenue definitions',
            createdFrom: 'slack',
            projectType: ProjectType.DEFAULT,
            latestActivity: activity,
            distilledUpTo: null,
            turns: [
                {
                    promptUuid: 'prompt-1',
                    createdAt: new Date('2026-07-22T04:00:00.000Z'),
                    userText: 'First user asks',
                    assistantText: 'Answer',
                    errorMessage: null,
                    respondedAt: new Date('2026-07-22T04:01:00.000Z'),
                    interrupted: false,
                    feedback: null,
                    steers: [],
                    tools: [],
                },
                {
                    promptUuid: 'prompt-2',
                    createdAt: activity,
                    userText: 'Second user asks last',
                    assistantText: 'Answer',
                    errorMessage: null,
                    respondedAt: activity,
                    interrupted: false,
                    feedback: null,
                    steers: [],
                    tools: [],
                },
            ],
        });
        findThreadOwnership.mockResolvedValue({
            threadUuid: 'thread-enabled',
            projectUuid: 'project-enabled',
            agentUuid: 'agent-1',
            ownerUserUuid: 'first-prompter',
        });
        distillCall.mockResolvedValue({
            result: {
                type: 'memory',
                thread_summary: 'The users agreed a convention.',
                slug: 'net-revenue',
                title: 'Net revenue convention',
                raw_memory: 'Use net revenue.',
                terms: ['net revenue'],
                objects: [],
                scope: 'user',
            },
        });

        await expect(
            service.distillThread({
                organizationUuid: 'org-enabled',
                projectUuid: 'project-enabled',
                userUuid: 'system',
                threadUuid: 'thread-enabled',
                sweptUpdatedAt: activity.toISOString(),
            }),
        ).resolves.toBe('memory');

        expect(findThreadOwnership).toHaveBeenCalledWith({
            organizationUuid: 'org-enabled',
            threadUuid: 'thread-enabled',
        });
        expect(upsertSourceThreadMemory).toHaveBeenCalledWith(
            expect.objectContaining({ userUuid: 'first-prompter' }),
        );
    });

    it('writes a null owner rather than a placeholder when the thread has none', async () => {
        const {
            service,
            findThreadForDistill,
            findThreadOwnership,
            upsertSourceThreadMemory,
            distillCall,
        } = build();
        const activity = new Date('2026-07-22T05:00:00.000Z');
        findThreadForDistill.mockResolvedValue({
            threadUuid: 'thread-enabled',
            organizationUuid: 'org-enabled',
            projectUuid: 'project-enabled',
            agentUuid: 'agent-1',
            title: null,
            createdFrom: 'slack',
            projectType: ProjectType.DEFAULT,
            latestActivity: activity,
            distilledUpTo: null,
            turns: [
                {
                    promptUuid: 'prompt-1',
                    createdAt: activity,
                    userText: 'Anonymous ask',
                    assistantText: 'Answer',
                    errorMessage: null,
                    respondedAt: activity,
                    interrupted: false,
                    feedback: null,
                    steers: [],
                    tools: [],
                },
            ],
        });
        findThreadOwnership.mockResolvedValue(undefined);
        distillCall.mockResolvedValue({
            result: {
                type: 'memory',
                thread_summary: 'A convention.',
                slug: 'net-revenue',
                title: 'Net revenue convention',
                raw_memory: 'Use net revenue.',
                terms: [],
                objects: [],
                scope: 'user',
            },
        });

        await expect(
            service.distillThread({
                organizationUuid: 'org-enabled',
                projectUuid: 'project-enabled',
                userUuid: 'system',
                threadUuid: 'thread-enabled',
                sweptUpdatedAt: activity.toISOString(),
            }),
        ).resolves.toBe('memory');
        expect(upsertSourceThreadMemory).toHaveBeenCalledWith(
            expect.objectContaining({ userUuid: null }),
        );
    });

    it('persists a project label without loosening ownership, and reports it', async () => {
        const {
            service,
            findThreadForDistill,
            upsertSourceThreadMemory,
            distillCall,
            track,
        } = build();
        const activity = new Date('2026-07-22T05:00:00.000Z');
        findThreadForDistill.mockResolvedValue(distillableThread(activity));
        distillCall.mockResolvedValue({
            result: {
                type: 'memory',
                thread_summary: 'The user corrected the revenue definition.',
                slug: 'net-revenue',
                title: 'Net revenue convention',
                raw_memory: 'Use net revenue.',
                terms: [],
                objects: [],
                scope: 'project',
            },
        });

        await expect(
            service.distillThread({
                organizationUuid: 'org-enabled',
                projectUuid: 'project-enabled',
                userUuid: 'system',
                threadUuid: 'thread-enabled',
                sweptUpdatedAt: activity.toISOString(),
            }),
        ).resolves.toBe('memory');

        // A `project` label is a promotion nomination, never a broadcast: the
        // row stays owned by the thread owner exactly as a `user` one does.
        expect(upsertSourceThreadMemory).toHaveBeenCalledWith(
            expect.objectContaining({
                scope: 'project',
                userUuid: 'source-user',
            }),
        );
        expect(track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'ai_agent_memory.generated',
                properties: expect.objectContaining({ scope: 'project' }),
            }),
        );
    });

    it('reports the memory-generated event without any memory content', async () => {
        const { service, findThreadForDistill, distillCall, track } = build();
        const activity = new Date('2026-07-22T05:00:00.000Z');
        findThreadForDistill.mockResolvedValue(distillableThread(activity));
        distillCall.mockResolvedValue({
            result: {
                type: 'memory',
                thread_summary: 'The user corrected the revenue definition.',
                slug: 'net-revenue',
                title: 'Net revenue convention',
                raw_memory: 'Use net revenue.',
                terms: ['net revenue'],
                objects: [{ type: 'explore', name: 'orders' }],
                scope: 'project',
            },
        });

        await service.distillThread({
            organizationUuid: 'org-enabled',
            projectUuid: 'project-enabled',
            userUuid: 'system',
            threadUuid: 'thread-enabled',
            sweptUpdatedAt: activity.toISOString(),
        });

        const generated = track.mock.calls
            .map(([call]) => call)
            .find((call) => call.event === 'ai_agent_memory.generated');
        expect(Object.keys(generated.properties).sort()).toEqual([
            'agentId',
            'channel',
            'isRedistill',
            'memoryId',
            'objectCount',
            'organizationId',
            'projectId',
            'scope',
            'unresolvedObjectCount',
        ]);
    });

    it('skips a thread whose memory is no longer active without an LLM call', async () => {
        const activity = new Date('2026-07-22T05:00:00.000Z');
        const payload = {
            organizationUuid: 'org-enabled',
            projectUuid: 'project-enabled',
            userUuid: 'system',
            threadUuid: 'thread-enabled',
            sweptUpdatedAt: activity.toISOString(),
        };

        const {
            service,
            findThreadForDistill,
            resolveSourceThreadMemoryState,
            upsertThreadDistill,
            distillCall,
        } = build();
        findThreadForDistill.mockResolvedValue(distillableThread(activity));
        resolveSourceThreadMemoryState.mockResolvedValue('inactive');

        await expect(service.distillThread(payload)).resolves.toBe('skipped');

        expect(distillCall).not.toHaveBeenCalled();
        expect(upsertThreadDistill).toHaveBeenCalledExactlyOnceWith({
            aiThreadUuid: 'thread-enabled',
            outcome: 'skipped',
            distillPromptHash: null,
            distilledUpTo: activity,
        });
    });

    it('distills a thread whose memory is still active or absent', async () => {
        const activity = new Date('2026-07-22T05:00:00.000Z');
        const payload = {
            organizationUuid: 'org-enabled',
            projectUuid: 'project-enabled',
            userUuid: 'system',
            threadUuid: 'thread-enabled',
            sweptUpdatedAt: activity.toISOString(),
        };
        const distillOutput = {
            result: {
                type: 'no_op',
                reason: 'no_positive_evidence',
            },
        };

        const active = build();
        active.findThreadForDistill.mockResolvedValue(
            distillableThread(activity, { distilledUpTo: null }),
        );
        active.resolveSourceThreadMemoryState.mockResolvedValue('active');
        active.distillCall.mockResolvedValue(distillOutput);
        await expect(active.service.distillThread(payload)).resolves.toBe(
            'no_op',
        );
        expect(active.distillCall).toHaveBeenCalledOnce();

        const none = build();
        none.findThreadForDistill.mockResolvedValue(
            distillableThread(activity, { distilledUpTo: null }),
        );
        none.resolveSourceThreadMemoryState.mockResolvedValue('none');
        none.distillCall.mockResolvedValue(distillOutput);
        await expect(none.service.distillThread(payload)).resolves.toBe(
            'no_op',
        );
        expect(none.distillCall).toHaveBeenCalledOnce();
    });

    it('skips without writing when the memory stops being active mid-distill', async () => {
        const activity = new Date('2026-07-22T05:00:00.000Z');
        const {
            service,
            findThreadForDistill,
            resolveSourceThreadMemoryState,
            upsertSourceThreadMemory,
            upsertThreadDistill,
            distillCall,
        } = build();
        findThreadForDistill.mockResolvedValue(
            distillableThread(activity, { distilledUpTo: null }),
        );
        resolveSourceThreadMemoryState
            .mockResolvedValueOnce('active')
            .mockResolvedValueOnce('inactive');
        distillCall.mockResolvedValue({
            result: {
                type: 'memory',
                thread_summary: 'The users agreed a convention.',
                slug: 'net-revenue',
                title: 'Net revenue convention',
                raw_memory: 'Use net revenue.',
                terms: ['net revenue'],
                objects: [],
                scope: 'user',
            },
        });

        await expect(
            service.distillThread({
                organizationUuid: 'org-enabled',
                projectUuid: 'project-enabled',
                userUuid: 'system',
                threadUuid: 'thread-enabled',
                sweptUpdatedAt: activity.toISOString(),
            }),
        ).resolves.toBe('skipped');

        expect(upsertSourceThreadMemory).not.toHaveBeenCalled();
        expect(upsertThreadDistill).toHaveBeenCalledExactlyOnceWith({
            aiThreadUuid: 'thread-enabled',
            outcome: 'skipped',
            distillPromptHash: null,
            distilledUpTo: activity,
        });
    });

    const consolidationCandidate = {
        organizationUuid: 'org-enabled',
        projectUuid: 'project-enabled',
        ownerUserUuid: 'owner-1',
        activeCount: 30,
    };

    const partitionPayload = {
        organizationUuid: 'org-enabled',
        projectUuid: 'project-enabled',
        userUuid: 'system',
        ownerUserUuid: 'owner-1',
    };

    const activeMemory = (
        overrides: Record<string, unknown> = {},
    ): Record<string, unknown> => ({
        ai_agent_memory_uuid: 'memory-1',
        slug: 'net-revenue-ab12cd34',
        title: 'Net revenue convention',
        raw_memory: 'Use net revenue.',
        thread_summary: 'Summary the curator must never see.',
        terms: [],
        objects: [],
        scope: 'user',
        generated_at: new Date('2026-07-20T10:00:00Z'),
        cited_count: 4,
        ...overrides,
    });

    /** A partition at the row floor, so the child's recheck lets it through. */
    const activeMemories = (
        overrides: Record<string, unknown> = {},
    ): Record<string, unknown>[] =>
        Array.from({ length: 30 }, (_, index) =>
            activeMemory({
                ai_agent_memory_uuid: `uuid-${index}`,
                slug: `net-revenue-${index}`,
                ...overrides,
            }),
        );

    // An empty catalog is treated as an unreadable one, so a partition that is
    // meant to be consolidated needs a catalog with something in it.
    const buildConsolidation = (options?: { enabledOrganization: string }) => {
        const context = build(options);
        context.findExploresFromCache.mockResolvedValue({
            orders: { name: 'orders', tables: {}, joinedTables: [] },
        });
        context.findActiveForProject.mockResolvedValue(activeMemories());
        return context;
    };

    it('asks only for partitions at or above the row floor', async () => {
        const {
            service,
            findConsolidationCandidates,
            aiAgentMemoryConsolidatePartition,
        } = build();

        await expect(service.sweepConsolidationPartitions()).resolves.toBe(0);

        expect(findConsolidationCandidates).toHaveBeenCalledExactlyOnceWith(30);
        expect(aiAgentMemoryConsolidatePartition).not.toHaveBeenCalled();
    });

    it('enqueues one partition job per eligible partition', async () => {
        const {
            service,
            findConsolidationCandidates,
            aiAgentMemoryConsolidatePartition,
        } = build();
        findConsolidationCandidates.mockResolvedValue([
            consolidationCandidate,
            { ...consolidationCandidate, ownerUserUuid: 'owner-2' },
        ]);

        await expect(service.sweepConsolidationPartitions()).resolves.toBe(2);

        expect(aiAgentMemoryConsolidatePartition).toHaveBeenCalledTimes(2);
        expect(aiAgentMemoryConsolidatePartition).toHaveBeenCalledWith(
            partitionPayload,
        );
        expect(aiAgentMemoryConsolidatePartition).toHaveBeenCalledWith({
            ...partitionPayload,
            ownerUserUuid: 'owner-2',
        });
    });

    it('enqueues nothing for an organization whose flag is off', async () => {
        const {
            service,
            findConsolidationCandidates,
            aiAgentMemoryConsolidatePartition,
            findActiveForProject,
        } = build({ enabledOrganization: 'none' });
        findConsolidationCandidates.mockResolvedValue([consolidationCandidate]);

        await expect(service.sweepConsolidationPartitions()).resolves.toBe(0);

        expect(aiAgentMemoryConsolidatePartition).not.toHaveBeenCalled();
        expect(findActiveForProject).not.toHaveBeenCalled();
    });

    it('skips the partition job quietly when the flag turned off after the sweep', async () => {
        const {
            service,
            findActiveForProject,
            consolidateCall,
            applyConsolidation,
            recordConsolidationRun,
        } = buildConsolidation({ enabledOrganization: 'none' });

        await expect(
            service.consolidateScheduledPartition(partitionPayload),
        ).resolves.toBe('skipped');

        expect(findActiveForProject).not.toHaveBeenCalled();
        expect(consolidateCall).not.toHaveBeenCalled();
        expect(applyConsolidation).not.toHaveBeenCalled();
        expect(recordConsolidationRun).not.toHaveBeenCalled();
    });

    it('skips a partition that fell below the row floor before the job ran', async () => {
        const {
            service,
            findActiveForProject,
            findLatestConsolidationRun,
            consolidateCall,
            recordConsolidationRun,
        } = buildConsolidation();
        findActiveForProject.mockResolvedValue([activeMemory()]);

        await expect(
            service.consolidateScheduledPartition(partitionPayload),
        ).resolves.toBe('skipped');

        expect(findLatestConsolidationRun).not.toHaveBeenCalled();
        expect(consolidateCall).not.toHaveBeenCalled();
        expect(recordConsolidationRun).not.toHaveBeenCalled();
    });

    it('skips a project whose catalog cannot be read', async () => {
        const {
            service,
            findExploresFromCache,
            consolidateCall,
            recordConsolidationRun,
        } = buildConsolidation();
        findExploresFromCache.mockRejectedValue(new Error('catalog gone'));

        await expect(
            service.consolidateScheduledPartition(partitionPayload),
        ).resolves.toBe('skipped');

        // Every object would read as unresolved, which is exactly the evidence
        // the retire licence rests on.
        expect(consolidateCall).not.toHaveBeenCalled();
        expect(recordConsolidationRun).not.toHaveBeenCalled();
    });

    it('skips a project whose catalog is empty', async () => {
        const {
            service,
            findActiveForProject,
            consolidateCall,
            recordConsolidationRun,
        } = build();
        findActiveForProject.mockResolvedValue(activeMemories());

        await expect(
            service.consolidateScheduledPartition(partitionPayload),
        ).resolves.toBe('skipped');

        expect(consolidateCall).not.toHaveBeenCalled();
        expect(recordConsolidationRun).not.toHaveBeenCalled();
    });

    it('skips a partition in which nothing resolves at all', async () => {
        const {
            service,
            findActiveForProject,
            consolidateCall,
            recordConsolidationRun,
        } = buildConsolidation();
        findActiveForProject.mockResolvedValue(
            activeMemories({
                objects: [{ type: 'explore', name: 'no_such_explore' }],
            }),
        );

        await expect(
            service.consolidateScheduledPartition(partitionPayload),
        ).resolves.toBe('skipped');

        expect(consolidateCall).not.toHaveBeenCalled();
        expect(recordConsolidationRun).not.toHaveBeenCalled();
    });

    it('records no run for a partition the job was aborted out of', async () => {
        const { service, consolidateCall, recordConsolidationRun } =
            buildConsolidation();
        const controller = new AbortController();
        consolidateCall.mockImplementation(async () => {
            controller.abort(new Error('Job timed out'));
            throw new Error('Job timed out');
        });

        await expect(
            service.consolidateScheduledPartition(
                partitionPayload,
                controller.signal,
            ),
        ).resolves.toBe('aborted');

        // A partition that never really attempted anything must not be stamped
        // with a hash that would suppress it until its corpus changes.
        expect(consolidateCall).toHaveBeenCalledOnce();
        expect(recordConsolidationRun).not.toHaveBeenCalled();
    });

    it('returns failed without a run row when a read throws before the attempt', async () => {
        const { service, findActiveForProject, recordConsolidationRun } =
            buildConsolidation();
        findActiveForProject.mockRejectedValue(new Error('database gone'));

        await expect(
            service.consolidateScheduledPartition(partitionPayload),
        ).resolves.toBe('failed');

        expect(recordConsolidationRun).not.toHaveBeenCalled();
    });

    it('keeps the rejection audit on a run that fails during apply', async () => {
        const {
            service,
            consolidateCall,
            applyConsolidation,
            recordConsolidationRun,
        } = buildConsolidation();
        consolidateCall.mockResolvedValue({
            operations: [
                {
                    type: 'retire',
                    slug: 'never-seen',
                    reason: 'Its explore no longer resolves.',
                },
                {
                    type: 'retire',
                    slug: 'net-revenue-0',
                    reason: 'Its explore no longer resolves.',
                },
            ],
        });
        applyConsolidation.mockRejectedValue(new Error('database exploded'));

        await expect(
            service.consolidateScheduledPartition(partitionPayload),
        ).resolves.toBe('failed');

        expect(recordConsolidationRun).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                status: 'failed',
                errorMessage: 'database exploded',
                rejectedOperations: [
                    {
                        operation: expect.objectContaining({
                            slug: 'never-seen',
                        }),
                        reason: 'unknown_slug',
                    },
                ],
            }),
        );
    });

    it('skips a partition whose corpus has not changed since the last run', async () => {
        const { service, findLatestConsolidationRun, applyConsolidation } =
            buildConsolidation();

        await expect(
            service.consolidateScheduledPartition(partitionPayload),
        ).resolves.toBe('consolidated');
        const { inputHash } = applyConsolidation.mock.calls[0][0].run;
        expect(findLatestConsolidationRun).toHaveBeenCalledWith({
            projectUuid: 'project-enabled',
            ownerUserUuid: 'owner-1',
        });

        const second = buildConsolidation();
        second.findLatestConsolidationRun.mockResolvedValue({
            input_hash: inputHash,
            status: 'failed',
        });

        await expect(
            second.service.consolidateScheduledPartition(partitionPayload),
        ).resolves.toBe('skipped');
        expect(second.consolidateCall).not.toHaveBeenCalled();
        expect(second.applyConsolidation).not.toHaveBeenCalled();
        // The catalog is read only for a partition that will be attempted.
        expect(second.findExploresFromCache).not.toHaveBeenCalled();
    });

    it('records a failed run carrying the input hash when the call throws', async () => {
        const {
            service,
            consolidateCall,
            applyConsolidation,
            recordConsolidationRun,
        } = buildConsolidation();
        consolidateCall.mockRejectedValue(new Error('model exploded'));

        await expect(
            service.consolidateScheduledPartition(partitionPayload),
        ).resolves.toBe('failed');

        expect(applyConsolidation).not.toHaveBeenCalled();
        expect(recordConsolidationRun).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                status: 'failed',
                errorMessage: 'model exploded',
                inputHash: expect.any(String),
                appliedOperations: [],
                rejectedOperations: [],
            }),
        );
    });

    it('never shows the curator a thread summary or a database uuid', async () => {
        const { service, consolidateCall } = buildConsolidation();

        await service.consolidateScheduledPartition(partitionPayload);

        const [{ input, partition }] = consolidateCall.mock.calls[0];
        expect(partition).toEqual({
            organizationUuid: 'org-enabled',
            projectUuid: 'project-enabled',
            ownerUserUuid: 'owner-1',
        });
        expect(JSON.stringify(input)).not.toContain('Summary the curator');
        expect(JSON.stringify(input)).not.toContain('uuid-');
    });

    it('returns not found without reading rows when the flag is off', async () => {
        const { service, findByProjectAndSlug } = build({
            enabledOrganization: 'none',
        });
        const user = buildUser(true);

        await expect(
            service.getMemory(user, 'project-enabled', 'net-revenue'),
        ).rejects.toThrow('Memory not found: net-revenue');
        expect(findByProjectAndSlug).not.toHaveBeenCalled();
    });

    it('rejects users who cannot view the project before checking flags', async () => {
        const { service, getFlag } = build();
        const user = buildUser(false);

        await expect(
            service.getMemory(user, 'project-enabled', 'net-revenue'),
        ).rejects.toThrow('Cannot view project');
        expect(getFlag).not.toHaveBeenCalled();
    });

    it('rejects an organization member for a project in another organization', async () => {
        const { service, getFlag, findByProjectAndSlug } = build();
        const user = buildUser(true);

        await expect(
            service.getMemory(user, 'project-other', 'net-revenue'),
        ).rejects.toThrow('Cannot view project');
        expect(getFlag).not.toHaveBeenCalled();
        expect(findByProjectAndSlug).not.toHaveBeenCalled();
    });

    // status scoping is a model predicate, covered in AiAgentMemoryModel.integration.test.ts
    it('scopes the memory list to the session user and the requested project', async () => {
        const { service, findUserMemoriesPaginated } = build();
        const user = buildUser(true);
        findUserMemoriesPaginated.mockResolvedValue({
            data: { memories: [{ uuid: 'memory-1', slug: 'net-revenue' }] },
            pagination: {
                page: 1,
                pageSize: 50,
                totalPageCount: 1,
                totalResults: 1,
            },
        });

        const result = await service.listMyMemories(user, 'project-enabled', {
            page: 1,
            pageSize: 50,
        });

        expect(findUserMemoriesPaginated).toHaveBeenCalledWith({
            organizationUuid: 'org-enabled',
            projectUuid: 'project-enabled',
            userUuid: 'current-user',
            paginateArgs: { page: 1, pageSize: 50 },
        });
        expect(result.data.memories).toEqual([
            { uuid: 'memory-1', slug: 'net-revenue' },
        ]);
    });

    it('returns not found for the memory list when the flag is off', async () => {
        const { service, findUserMemoriesPaginated } = build({
            enabledOrganization: 'none',
        });
        const user = buildUser(true);

        await expect(
            service.listMyMemories(user, 'project-enabled', {
                page: 1,
                pageSize: 50,
            }),
        ).rejects.toThrow('Memories not found for project: project-enabled');
        expect(findUserMemoriesPaginated).not.toHaveBeenCalled();
    });

    it('rejects a memory list request from a non project member', async () => {
        const { service, getFlag, findUserMemoriesPaginated } = build();
        const user = buildUser(false);

        await expect(
            service.listMyMemories(user, 'project-enabled', {
                page: 1,
                pageSize: 50,
            }),
        ).rejects.toThrow('Cannot view project');
        expect(getFlag).not.toHaveBeenCalled();
        expect(findUserMemoriesPaginated).not.toHaveBeenCalled();
    });
});
