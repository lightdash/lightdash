import {
    MergeJoinType,
    type AnonymousAccount,
    type SessionUser,
} from '@lightdash/common';
import {
    metricQueryMock,
    validExplore,
} from '../../../services/ProjectService/ProjectService.mock';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: vi
        .fn()
        // eslint-disable-next-line prefer-arrow-callback
        .mockImplementation(function MockAiAgentMcpRuntimeClient() {
            return {};
        }),
}));

const user = {
    userUuid: 'user-uuid',
    organizationUuid: 'org-uuid',
    userId: 1,
    ability: {
        can: () => true,
        cannot: () => false,
        relevantRuleFor: () => ({ inverted: false }),
        rules: [],
    },
    abilityRules: [],
} as unknown as SessionUser;

const account = {
    authentication: {
        data: {
            content: { type: 'aiAgent', agentUuid: 'agent-uuid' },
            writeActions: { spaceUuid: 'space-uuid' },
        },
    },
    embedWriteUser: user,
    embedWriteContext: { canUseAiAgent: true },
    embed: { projectUuid: 'project-uuid' },
    access: { controls: { userAttributes: { tenant_id: 'tenant-a' } } },
} as unknown as AnonymousAccount;

const config = {
    title: 'Orders',
    description: 'Orders by tenant',
    queryConfig: {
        exploreName: validExplore.name,
        dimensions: metricQueryMock.dimensions,
        metrics: metricQueryMock.metrics,
        sorts: [],
        limit: null,
        parameters: null,
        customMetrics: null,
        tableCalculations: null,
        filters: null,
    },
    chartConfig: null,
};

const query = { queryUuid: 'query-uuid' };

const buildService = () => {
    const aiAgentModel = {
        getAgent: vi.fn().mockResolvedValue({
            uuid: 'agent-uuid',
            name: 'Agent',
            organizationUuid: 'org-uuid',
            projectUuid: 'project-uuid',
            spaceAccess: ['space-uuid'],
        }),
        getArtifact: vi.fn().mockResolvedValue({
            threadUuid: 'thread-uuid',
            artifactType: 'chart',
            chartConfig: { source: 'semantic', config },
        }),
        findThread: vi.fn().mockResolvedValue({
            organizationUuid: 'org-uuid',
            projectUuid: 'project-uuid',
            agentUuid: 'agent-uuid',
        }),
        getThread: vi.fn().mockResolvedValue({ user: { uuid: 'user-uuid' } }),
        getWebAppThreadEmbedSpace: vi.fn().mockResolvedValue('space-uuid'),
    };
    const asyncQueryService = {
        executeAsyncMetricQuery: vi.fn().mockResolvedValue(query),
        executeAsyncMergeQuery: vi
            .fn()
            .mockResolvedValue({ outcome: 'success', query }),
    };
    const service = new AiAgentService({
        aiAgentModel,
        asyncQueryService,
        aiAgentToolsService: {
            getExplore: vi.fn().mockResolvedValue(validExplore),
        },
        featureFlagService: {
            get: vi.fn().mockResolvedValue({ enabled: true }),
        },
        analytics: { track: vi.fn() },
        lightdashConfig: { ai: { copilot: { maxQueryLimit: 5000 } } },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    return { service, aiAgentModel, asyncQueryService };
};

const artifactArgs = [
    'project-uuid',
    'agent-uuid',
    'artifact-uuid',
    'version-uuid',
] as const;

describe.each([
    { embedded: true, userAttributes: { tenant_id: 'tenant-a' } },
    { embedded: true, userAttributes: {} },
    { embedded: false, userAttributes: undefined },
])(
    'AI artifact visualization user attributes ($embedded, $userAttributes)',
    ({ embedded, userAttributes }) => {
        const viewerAccount = {
            ...account,
            access: { ...account.access, controls: { userAttributes } },
        } as AnonymousAccount;
        const options = {
            projectUuid: 'project-uuid',
            agentUuid: 'agent-uuid',
            artifactUuid: 'artifact-uuid',
            versionUuid: 'version-uuid',
        };

        it.each(['chart', 'dashboard'] as const)(
            'executes %s charts with viewer user attribute overrides',
            async (artifactType) => {
                const { service, aiAgentModel, asyncQueryService } =
                    buildService();
                if (artifactType === 'dashboard') {
                    aiAgentModel.getArtifact.mockResolvedValue({
                        threadUuid: 'thread-uuid',
                        artifactType,
                        dashboardConfig: {
                            title: 'Dashboard',
                            description: 'Orders',
                            visualizations: [config, config],
                        },
                    });
                }

                let result;
                if (artifactType === 'dashboard') {
                    result = embedded
                        ? await service.getEmbedDashboardArtifactChartVizQuery(
                              viewerAccount,
                              ...artifactArgs,
                              0,
                          )
                        : await service.getDashboardArtifactChartVizQuery(
                              user,
                              { ...options, chartIndex: 0 },
                          );
                } else {
                    result = embedded
                        ? await service.getEmbedArtifactVizQuery(
                              viewerAccount,
                              ...artifactArgs,
                          )
                        : await service.getArtifactVizQuery(user, options);
                }

                expect(result.query).toEqual(query);
                expect(
                    asyncQueryService.executeAsyncMetricQuery,
                ).toHaveBeenCalledWith(
                    expect.objectContaining({
                        userAttributeOverrides: userAttributes,
                    }),
                );
            },
        );
        it('executes merge charts with viewer user attribute overrides', async () => {
            const { service, aiAgentModel, asyncQueryService } = buildService();
            aiAgentModel.getArtifact.mockResolvedValue({
                threadUuid: 'thread-uuid',
                artifactType: 'chart',
                chartConfig: {
                    source: 'merge',
                    schemaVersion: 1,
                    config: {
                        ...config,
                        mergeConfig: {
                            primarySourceId: 'primary',
                            additionalSources: [
                                {
                                    id: 'comparison',
                                    queryConfig: config.queryConfig,
                                },
                            ],
                            joinKey: [
                                {
                                    name: 'key',
                                    fields: [
                                        {
                                            sourceId: 'primary',
                                            fieldId: 'a_dim1',
                                        },
                                        {
                                            sourceId: 'comparison',
                                            fieldId: 'a_dim1',
                                        },
                                    ],
                                },
                            ],
                            joinType: MergeJoinType.FULL,
                        },
                    },
                },
            });

            const result = embedded
                ? await service.getEmbedArtifactVizQuery(
                      viewerAccount,
                      ...artifactArgs,
                  )
                : await service.getArtifactVizQuery(user, options);

            expect(result.query).toEqual(query);
            expect(
                asyncQueryService.executeAsyncMergeQuery,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    userAttributeOverrides: userAttributes,
                }),
            );
        });
    },
);
