import { Ability, AbilityBuilder } from '@casl/ability';
import {
    CommercialFeatureFlags,
    DimensionType,
    FeatureFlags,
    FieldType,
    SupportedDbtAdapter,
    type AnyType,
    type Explore,
    type MemberAbility,
} from '@lightdash/common';
import { vi } from 'vitest';
import {
    AiAgentMemoryService,
    validateMemoryObjects,
} from './AiAgentMemoryService';

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
        const service = new AiAgentMemoryService({
            aiAgentMemoryModel: {
                findByProjectAndSlug,
                findThreadsDueForDistill,
            } as AnyType,
            aiAgentModel: { getAgent, findThreadOwnership } as AnyType,
            groupsModel: { findUserInGroups } as AnyType,
            projectModel: { getSummary: getProjectSummary } as AnyType,
            featureFlagService: { get: getFlag } as AnyType,
            schedulerClient: { aiAgentMemoryDistill },
            distillCall: vi.fn(),
        });
        return {
            service,
            getFlag,
            findByProjectAndSlug,
            findThreadsDueForDistill,
            aiAgentMemoryDistill,
            getAgent,
            findThreadOwnership,
        };
    };

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

    it('returns a project-visible memory with source provenance', async () => {
        const { service, findByProjectAndSlug, getAgent } = build();
        findByProjectAndSlug.mockResolvedValue({
            memory: {
                slug: 'net-revenue-ab12cd34',
                title: 'Net revenue convention',
                raw_memory: 'Use net revenue.',
                terms: ['net revenue'],
                objects: [
                    {
                        type: 'field',
                        explore: 'orders',
                        fieldId: 'orders_net_revenue',
                    },
                ],
                status: 'active',
                source_thread_uuid: 'thread-enabled',
                generated_at: new Date('2026-07-22T10:00:00Z'),
                cited_count: 3,
            },
            sources: [
                {
                    slug: 'net-revenue-ab12cd34',
                    agent_uuid: 'agent-1',
                    source_thread_uuid: 'thread-enabled',
                    thread_summary: '**The user** established the convention.',
                    thread_title: 'Revenue definitions',
                },
            ],
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
            provenance: {
                type: 'source_thread',
                source: {
                    hasThreadAccess: true,
                    agentUuid: 'agent-1',
                    threadUuid: 'thread-enabled',
                    threadTitle: 'Revenue definitions',
                },
            },
        });
    });

    it('redacts source thread details from users without thread access', async () => {
        const { service, findByProjectAndSlug } = build();
        findByProjectAndSlug.mockResolvedValue({
            memory: {
                slug: 'net-revenue-ab12cd34',
                title: 'Net revenue convention',
                raw_memory: 'Use net revenue.',
                terms: ['net revenue'],
                objects: [],
                status: 'active',
                source_thread_uuid: 'thread-enabled',
                generated_at: new Date('2026-07-22T10:00:00Z'),
                cited_count: 3,
            },
            sources: [
                {
                    slug: 'net-revenue-ab12cd34',
                    agent_uuid: 'agent-1',
                    source_thread_uuid: 'thread-enabled',
                    thread_summary: 'Private thread summary.',
                    thread_title: 'Private thread title',
                },
            ],
            replacement: null,
        });

        const memory = await service.getMemory(
            buildUser(true),
            'project-enabled',
            'net-revenue-ab12cd34',
        );

        expect(memory.provenance).toEqual({
            type: 'source_thread',
            source: {
                slug: 'net-revenue-ab12cd34',
                hasThreadAccess: false,
            },
        });
    });

    it('returns source details to the thread owner without manage access', async () => {
        const { service, findByProjectAndSlug, findThreadOwnership } = build();
        findByProjectAndSlug.mockResolvedValue({
            memory: {
                slug: 'net-revenue-ab12cd34',
                title: 'Net revenue convention',
                raw_memory: 'Use net revenue.',
                terms: [],
                objects: [],
                status: 'active',
                source_thread_uuid: 'thread-enabled',
                generated_at: new Date('2026-07-22T10:00:00Z'),
                cited_count: 3,
            },
            sources: [
                {
                    slug: 'net-revenue-ab12cd34',
                    agent_uuid: 'agent-1',
                    source_thread_uuid: 'thread-enabled',
                    thread_summary: 'Owner-visible summary.',
                    thread_title: 'Owner-visible title',
                },
            ],
            replacement: null,
        });
        findThreadOwnership.mockResolvedValue({
            threadUuid: 'thread-enabled',
            projectUuid: 'project-enabled',
            agentUuid: 'agent-1',
            ownerUserUuid: 'current-user',
        });

        const memory = await service.getMemory(
            buildUser(true),
            'project-enabled',
            'net-revenue-ab12cd34',
        );

        expect(memory.provenance).toMatchObject({
            type: 'source_thread',
            source: {
                hasThreadAccess: true,
                threadTitle: 'Owner-visible title',
            },
        });
    });

    it('redacts source details when the owner loses agent access', async () => {
        const { service, findByProjectAndSlug, findThreadOwnership, getAgent } =
            build();
        findByProjectAndSlug.mockResolvedValue({
            memory: {
                slug: 'net-revenue-ab12cd34',
                title: 'Net revenue convention',
                raw_memory: 'Use net revenue.',
                terms: [],
                objects: [],
                status: 'active',
                source_thread_uuid: 'thread-enabled',
                generated_at: new Date('2026-07-22T10:00:00Z'),
                cited_count: 3,
            },
            sources: [
                {
                    slug: 'net-revenue-ab12cd34',
                    agent_uuid: 'agent-1',
                    source_thread_uuid: 'thread-enabled',
                    thread_summary: 'Private summary.',
                    thread_title: 'Private title',
                },
            ],
            replacement: null,
        });
        findThreadOwnership.mockResolvedValue({
            threadUuid: 'thread-enabled',
            projectUuid: 'project-enabled',
            agentUuid: 'agent-1',
            ownerUserUuid: 'current-user',
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

        const memory = await service.getMemory(
            buildUser(true),
            'project-enabled',
            'net-revenue-ab12cd34',
        );

        expect(memory.provenance).toEqual({
            type: 'source_thread',
            source: {
                slug: 'net-revenue-ab12cd34',
                hasThreadAccess: false,
            },
        });
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
