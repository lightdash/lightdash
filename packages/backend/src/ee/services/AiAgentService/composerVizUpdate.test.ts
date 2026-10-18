import {
    ChartType,
    COMPOSER_TABLE_INTENT,
    COMPOSER_TABLE_VIZ,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    type AiComposerChartViz,
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

const agent = {
    uuid: 'agent-uuid',
    name: 'Agent',
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    adminOnly: false,
    userAccess: [],
    groupAccess: [],
};

const composerChartConfig = {
    source: 'composer',
    schemaVersion: 2,
    queries: [],
    terminalNodeId: 'n1',
    viz: COMPOSER_TABLE_VIZ,
};

const artifact = {
    artifactUuid: 'artifact-uuid',
    versionUuid: 'version-uuid',
    threadUuid: 'thread-uuid',
    chartConfig: composerChartConfig,
};

const artifactThread = {
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    agentUuid: 'agent-uuid',
};

const barViz: AiComposerChartViz = {
    intent: {
        ...COMPOSER_TABLE_INTENT,
        defaultVizType: 'bar',
        xAxisDimension: 'n1_month',
        yAxisMetrics: ['n1_revenue'],
        xAxisType: 'time',
    },
    chartConfig: null,
    pivotConfig: null,
};

const args = {
    projectUuid: 'project-uuid',
    agentUuid: 'agent-uuid',
    artifactUuid: 'artifact-uuid',
    versionUuid: 'version-uuid',
    viz: barViz,
};

/** Fake session user: `manage` on AiAgent only when `canManage`, `view` always. */
const makeUser = (userUuid: string, canManage: boolean) => {
    const allowed = (action: string) => action !== 'manage' || canManage;
    return {
        userUuid,
        organizationUuid: 'org-uuid',
        userId: 1,
        ability: {
            can: vi.fn(allowed),
            cannot: vi.fn((action: string) => !allowed(action)),
            relevantRuleFor: vi.fn((action: string) =>
                allowed(action) ? { inverted: false } : null,
            ),
            rules: [],
        },
        abilityRules: [],
    } as unknown as SessionUser;
};

const owner = makeUser('owner-uuid', false);

const buildService = (
    overrides: {
        artifact?: Record<string, unknown> | null;
        artifactThread?: Record<string, unknown> | null;
    } = {},
) => {
    const aiAgentModel = {
        getAgent: vi.fn().mockResolvedValue(agent),
        getArtifact: vi
            .fn()
            .mockResolvedValue(
                overrides.artifact === undefined
                    ? artifact
                    : overrides.artifact,
            ),
        findThread: vi
            .fn()
            .mockResolvedValue(
                overrides.artifactThread === undefined
                    ? artifactThread
                    : overrides.artifactThread,
            ),
        getThread: vi.fn().mockResolvedValue({ user: { uuid: 'owner-uuid' } }),
        updateArtifactVersionChartConfig: vi.fn().mockResolvedValue(undefined),
    };
    const service = new AiAgentService({
        aiAgentModel,
        groupsModel: { findUserInGroups: vi.fn().mockResolvedValue([]) },
        analytics: { track: vi.fn() },
        lightdashConfig: { ai: { copilot: { maxQueryLimit: 5000 } } },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    vi.spyOn(
        service as unknown as { getIsCopilotEnabled: () => Promise<boolean> },
        'getIsCopilotEnabled',
    ).mockResolvedValue(true);
    return { service, aiAgentModel };
};

describe('AiAgentService.updateComposerArtifactViz', () => {
    it('thread owner writes the viz onto the version', async () => {
        const { service, aiAgentModel } = buildService();

        await service.updateComposerArtifactViz(owner, args);

        expect(
            aiAgentModel.updateArtifactVersionChartConfig,
        ).toHaveBeenCalledWith('version-uuid', {
            ...composerChartConfig,
            viz: barViz,
        });
    });

    it('writes an edited explorer chart config as given', async () => {
        const { service, aiAgentModel } = buildService();
        const viz: AiComposerChartViz = {
            intent: null,
            chartConfig: {
                type: ChartType.BIG_NUMBER,
                config: { selectedField: 'n1_revenue' },
            },
            pivotConfig: { columns: ['n1_month'] },
        };

        await service.updateComposerArtifactViz(owner, { ...args, viz });

        const written = aiAgentModel.updateArtifactVersionChartConfig.mock
            .calls[0][1] as { viz: AiComposerChartViz };
        expect(written.viz).toEqual(viz);
    });

    it('forbids another user in the org without manage on the agent', async () => {
        const { service, aiAgentModel } = buildService();

        await expect(
            service.updateComposerArtifactViz(
                makeUser('other-uuid', false),
                args,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(
            aiAgentModel.updateArtifactVersionChartConfig,
        ).not.toHaveBeenCalled();
    });

    it('lets a user who manages the agent update another user thread', async () => {
        const { service, aiAgentModel } = buildService();

        await service.updateComposerArtifactViz(
            makeUser('admin-uuid', true),
            args,
        );

        expect(
            aiAgentModel.updateArtifactVersionChartConfig,
        ).toHaveBeenCalledTimes(1);
    });

    it('rejects an artifact whose thread belongs to another agent', async () => {
        const { service, aiAgentModel } = buildService({
            artifactThread: { ...artifactThread, agentUuid: 'other-agent' },
        });

        await expect(
            service.updateComposerArtifactViz(owner, args),
        ).rejects.toThrow(ForbiddenError);
        expect(
            aiAgentModel.updateArtifactVersionChartConfig,
        ).not.toHaveBeenCalled();
    });

    it('rejects an artifact whose thread belongs to another project', async () => {
        const { service } = buildService({
            artifactThread: { ...artifactThread, projectUuid: 'other-project' },
        });

        await expect(
            service.updateComposerArtifactViz(owner, args),
        ).rejects.toThrow(ForbiddenError);
    });

    it('rejects a version that belongs to a different artifact', async () => {
        const { service, aiAgentModel } = buildService({
            artifact: { ...artifact, artifactUuid: 'other-artifact-uuid' },
        });

        await expect(
            service.updateComposerArtifactViz(owner, args),
        ).rejects.toThrow(NotFoundError);
        expect(
            aiAgentModel.updateArtifactVersionChartConfig,
        ).not.toHaveBeenCalled();
    });

    it('rejects an invalid body without writing', async () => {
        const { service, aiAgentModel } = buildService();

        await expect(
            service.updateComposerArtifactViz(owner, {
                ...args,
                viz: {
                    intent: { defaultVizType: 'treemap' },
                    chartConfig: null,
                    pivotConfig: null,
                },
            }),
        ).rejects.toThrow(ParameterError);
        expect(
            aiAgentModel.updateArtifactVersionChartConfig,
        ).not.toHaveBeenCalled();
    });

    it('rejects a non-composer artifact', async () => {
        const { service, aiAgentModel } = buildService({
            artifact: {
                ...artifact,
                chartConfig: { source: 'sql', sql: 'select 1', limit: 500 },
            },
        });

        await expect(
            service.updateComposerArtifactViz(owner, args),
        ).rejects.toThrow(ParameterError);
        expect(
            aiAgentModel.updateArtifactVersionChartConfig,
        ).not.toHaveBeenCalled();
    });
});
