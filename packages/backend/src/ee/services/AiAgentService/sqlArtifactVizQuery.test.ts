import {
    AiResultType,
    QueryExecutionContext,
    QuerySurface,
    type SessionUser,
} from '@lightdash/common';
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
        can: vi.fn(() => true),
        cannot: vi.fn(() => false),
        relevantRuleFor: vi.fn(() => ({ inverted: false })),
        rules: [],
    },
    abilityRules: [],
} as unknown as SessionUser;

describe('AiAgentService SQL artifact visualization query', () => {
    it.each([
        ['api', QuerySurface.API],
        ['web_app', QuerySurface.APP],
        ['slack', QuerySurface.SLACK],
    ] as const)(
        'executes a %s SQL artifact for the viewer with surface %s',
        async (threadCreatedFrom, querySurface) => {
            const query = {
                queryUuid: 'fresh-query-uuid',
                cacheMetadata: { cacheHit: false },
                parameterReferences: [],
                usedParametersValues: {},
                resolvedTimezone: null,
            };
            const asyncQueryService = {
                executeAsyncSqlQuery: vi.fn().mockResolvedValue(query),
            };
            const analytics = { track: vi.fn() };
            const aiAgentModel = {
                findSlackPrompt: vi
                    .fn()
                    .mockResolvedValue(
                        threadCreatedFrom === 'slack'
                            ? { threadCreatedFrom, slackUserId: 'U1' }
                            : undefined,
                    ),
                findWebAppPrompt: vi
                    .fn()
                    .mockResolvedValue({ threadCreatedFrom }),
                getAgent: vi.fn().mockResolvedValue({
                    uuid: 'agent-uuid',
                    name: 'Agent',
                    projectUuid: 'project-uuid',
                }),
            };
            const service = new AiAgentService({
                aiAgentModel,
                featureFlagService: {
                    get: vi.fn().mockResolvedValue({ enabled: false }),
                },
                asyncQueryService,
                analytics,
                lightdashConfig: { ai: { copilot: { maxQueryLimit: 5000 } } },
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any);

            vi.spyOn(
                service as unknown as {
                    getIsCopilotEnabled: () => Promise<boolean>;
                },
                'getIsCopilotEnabled',
            ).mockResolvedValue(true);
            vi.spyOn(service, 'getAgent').mockResolvedValue({
                uuid: 'agent-uuid',
                name: 'Agent',
                projectUuid: 'project-uuid',
            } as never);
            vi.spyOn(service, 'getArtifact').mockResolvedValue({
                artifactUuid: 'artifact-uuid',
                threadUuid: 'thread-uuid',
                artifactType: 'chart',
                savedQueryUuid: null,
                savedSqlUuid: null,
                savedDashboardUuid: null,
                createdAt: new Date(),
                versionNumber: 1,
                versionUuid: 'version-uuid',
                title: 'SQL results',
                description: null,
                chartConfig: {
                    source: 'sql',
                    sql: 'select 1',
                    limit: 500,
                },
                dashboardConfig: null,
                promptUuid: 'prompt-uuid',
                versionCreatedAt: new Date(),
                verifiedByUserUuid: null,
                verifiedAt: null,
            });

            const result = await service.getArtifactVizQuery(user, {
                projectUuid: 'project-uuid',
                agentUuid: 'agent-uuid',
                artifactUuid: 'artifact-uuid',
                versionUuid: 'version-uuid',
            });

            expect(
                asyncQueryService.executeAsyncSqlQuery.mock.calls[0][0],
            ).not.toHaveProperty('agentActor');
            expect(asyncQueryService.executeAsyncSqlQuery).toHaveBeenCalledWith(
                expect.objectContaining({
                    projectUuid: 'project-uuid',
                    sql: 'select 1',
                    limit: 500,
                    context: QueryExecutionContext.AI,
                    querySurface,
                }),
            );
            expect(result).toEqual({
                source: 'sql',
                type: AiResultType.TABLE_RESULT,
                query,
                sql: 'select 1',
                limit: 500,
                metadata: {
                    title: 'SQL results',
                    description: null,
                },
            });
            expect(analytics.track).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'ai_agent.artifact_viz_query',
                    properties: expect.objectContaining({
                        vizType: AiResultType.TABLE_RESULT,
                        source: 'sql',
                        // Ties the render round-trip to the turn that produced
                        // the artifact, and to query_events for warehouse timings.
                        promptId: 'prompt-uuid',
                        queryId: 'fresh-query-uuid',
                        durationMs: expect.any(Number),
                    }),
                }),
            );
        },
    );

    it('rejects SQL artifact execution in embed context', async () => {
        const asyncQueryService = {
            executeAsyncSqlQuery: vi.fn(),
        };
        const aiAgentModel = {
            getAgent: vi.fn().mockResolvedValue({
                uuid: 'agent-uuid',
                name: 'Agent',
                projectUuid: 'project-uuid',
            }),
        };
        const service = new AiAgentService({
            aiAgentModel,
            asyncQueryService,
            analytics: { track: vi.fn() },
            lightdashConfig: { ai: { copilot: { maxQueryLimit: 5000 } } },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

        vi.spyOn(
            service as unknown as {
                getIsCopilotEnabled: () => Promise<boolean>;
            },
            'getIsCopilotEnabled',
        ).mockResolvedValue(true);
        vi.spyOn(service, 'getAgent').mockResolvedValue({
            uuid: 'agent-uuid',
            name: 'Agent',
            projectUuid: 'project-uuid',
        } as never);
        vi.spyOn(service, 'getArtifact').mockResolvedValue({
            artifactUuid: 'artifact-uuid',
            threadUuid: 'thread-uuid',
            artifactType: 'chart',
            savedQueryUuid: null,
            savedSqlUuid: null,
            savedDashboardUuid: null,
            createdAt: new Date(),
            versionNumber: 1,
            versionUuid: 'version-uuid',
            title: 'SQL results',
            description: null,
            chartConfig: {
                source: 'sql',
                sql: 'select 1',
                limit: 500,
            },
            dashboardConfig: null,
            promptUuid: 'prompt-uuid',
            versionCreatedAt: new Date(),
            verifiedByUserUuid: null,
            verifiedAt: null,
        });
        vi.spyOn(
            service as unknown as {
                assertEmbedThreadInSpace: () => Promise<void>;
            },
            'assertEmbedThreadInSpace',
        ).mockResolvedValue(undefined);

        await expect(
            service.getArtifactVizQuery(user, {
                projectUuid: 'project-uuid',
                agentUuid: 'agent-uuid',
                artifactUuid: 'artifact-uuid',
                versionUuid: 'version-uuid',
                runtimeOptions: {
                    embedSpaceUuid: 'space-uuid',
                    externalUserId: null,
                    spaceAccess: ['space-uuid'],
                    userAttributeOverrides: {},
                },
            }),
        ).rejects.toThrow('SQL artifacts are not available in embedded');
        expect(asyncQueryService.executeAsyncSqlQuery).not.toHaveBeenCalled();
    });

    it('links a saved SQL chart to the exact artifact version', async () => {
        const aiAgentModel = {
            getAgent: vi.fn().mockResolvedValue({
                uuid: 'agent-uuid',
                projectUuid: 'project-uuid',
            }),
            getArtifact: vi.fn().mockResolvedValue({
                threadUuid: 'thread-uuid',
            }),
            getThread: vi.fn().mockResolvedValue({
                user: { uuid: 'owner-uuid' },
            }),
            isSavedSqlInProject: vi.fn().mockResolvedValue(true),
            updateArtifactVersion: vi.fn().mockResolvedValue(undefined),
        };
        const service = new AiAgentService({
            aiAgentModel,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

        vi.spyOn(
            service as unknown as {
                getIsCopilotEnabled: () => Promise<boolean>;
            },
            'getIsCopilotEnabled',
        ).mockResolvedValue(true);
        vi.spyOn(
            service as unknown as {
                checkAgentThreadAccess: () => Promise<boolean>;
            },
            'checkAgentThreadAccess',
        ).mockResolvedValue(true);

        await service.updateArtifactVersion(user, {
            agentUuid: 'agent-uuid',
            artifactUuid: 'artifact-uuid',
            versionUuid: 'version-uuid',
            savedSqlUuid: 'saved-sql-uuid',
        });

        expect(aiAgentModel.isSavedSqlInProject).toHaveBeenCalledWith(
            'saved-sql-uuid',
            'project-uuid',
        );
        expect(aiAgentModel.updateArtifactVersion).toHaveBeenCalledWith(
            'version-uuid',
            { savedSqlUuid: 'saved-sql-uuid' },
        );
    });

    it('rejects linking a saved SQL chart from another project', async () => {
        const aiAgentModel = {
            getAgent: vi.fn().mockResolvedValue({
                uuid: 'agent-uuid',
                projectUuid: 'project-uuid',
            }),
            getArtifact: vi.fn().mockResolvedValue({
                threadUuid: 'thread-uuid',
            }),
            getThread: vi.fn().mockResolvedValue({
                user: { uuid: 'owner-uuid' },
            }),
            isSavedSqlInProject: vi.fn().mockResolvedValue(false),
            updateArtifactVersion: vi.fn().mockResolvedValue(undefined),
        };
        const service = new AiAgentService({
            aiAgentModel,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

        vi.spyOn(
            service as unknown as {
                getIsCopilotEnabled: () => Promise<boolean>;
            },
            'getIsCopilotEnabled',
        ).mockResolvedValue(true);
        vi.spyOn(
            service as unknown as {
                checkAgentThreadAccess: () => Promise<boolean>;
            },
            'checkAgentThreadAccess',
        ).mockResolvedValue(true);

        await expect(
            service.updateArtifactVersion(user, {
                agentUuid: 'agent-uuid',
                artifactUuid: 'artifact-uuid',
                versionUuid: 'version-uuid',
                savedSqlUuid: 'other-project-saved-sql-uuid',
            }),
        ).rejects.toThrow('Saved SQL chart not found in project');
        expect(aiAgentModel.updateArtifactVersion).not.toHaveBeenCalled();
    });
});
