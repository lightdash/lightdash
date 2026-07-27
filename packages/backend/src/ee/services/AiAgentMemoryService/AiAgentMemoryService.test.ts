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
        const findThreadsDueForDistill = vi.fn();
        const findThreadForDistill = vi.fn();
        const upsertSourceThreadMemory = vi.fn().mockResolvedValue({
            ai_agent_memory_uuid: 'memory-1',
        });
        const upsertThreadDistill = vi.fn();
        const findActiveForProject = vi.fn().mockResolvedValue([]);
        const aiAgentMemoryDistill = vi.fn();
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
        const track = vi.fn();
        const service = new AiAgentMemoryService({
            analytics: { track } as AnyType,
            aiAgentMemoryModel: {
                findByProjectAndSlug,
                findThreadsDueForDistill,
                findThreadForDistill,
                upsertSourceThreadMemory,
                upsertThreadDistill,
                findActiveForProject,
            } as AnyType,
            aiAgentModel: { getAgent, findThreadOwnership } as AnyType,
            groupsModel: { findUserInGroups } as AnyType,
            projectModel: {
                getSummary: getProjectSummary,
                findExploresFromCache: vi.fn().mockResolvedValue({}),
            } as AnyType,
            featureFlagService: { get: getFlag } as AnyType,
            schedulerClient: { aiAgentMemoryDistill },
            distillCall,
        });
        return {
            service,
            getFlag,
            findByProjectAndSlug,
            findThreadsDueForDistill,
            findThreadForDistill,
            upsertSourceThreadMemory,
            upsertThreadDistill,
            findActiveForProject,
            aiAgentMemoryDistill,
            getAgent,
            findThreadOwnership,
            distillCall,
            track,
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
});
