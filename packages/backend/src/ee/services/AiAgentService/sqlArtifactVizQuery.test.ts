import {
    AiResultType,
    QueryExecutionContext,
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
        relevantRuleFor: vi.fn(() => undefined),
        rules: [],
    },
    abilityRules: [],
} as unknown as SessionUser;

describe('AiAgentService SQL artifact visualization query', () => {
    it('executes persisted SQL for the current viewer and tracks it', async () => {
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
            getAgent: vi.fn().mockResolvedValue({
                uuid: 'agent-uuid',
                name: 'Agent',
                projectUuid: 'project-uuid',
            }),
        };
        const service = new AiAgentService({
            aiAgentModel,
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

        expect(asyncQueryService.executeAsyncSqlQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                projectUuid: 'project-uuid',
                sql: 'select 1',
                limit: 500,
                context: QueryExecutionContext.AI,
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
                }),
            }),
        );
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

        expect(aiAgentModel.updateArtifactVersion).toHaveBeenCalledWith(
            'version-uuid',
            { savedSqlUuid: 'saved-sql-uuid' },
        );
    });
});
