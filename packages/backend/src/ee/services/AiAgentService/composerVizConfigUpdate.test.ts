import {
    ChartKind,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    VizAggregationOptions,
    VizIndexType,
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
    schemaVersion: 1,
    queries: [],
    terminalNodeId: 'n1',
    lastQueryUuid: 'query-uuid',
    vizConfig: null,
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

const barConfig = {
    type: ChartKind.VERTICAL_BAR,
    metadata: { version: 1 },
    fieldConfig: {
        x: { reference: 'month', type: VizIndexType.TIME },
        y: [{ reference: 'revenue', aggregation: VizAggregationOptions.SUM }],
    },
};

const args = {
    projectUuid: 'project-uuid',
    agentUuid: 'agent-uuid',
    artifactUuid: 'artifact-uuid',
    versionUuid: 'version-uuid',
    vizConfig: barConfig,
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

describe('AiAgentService.updateComposerArtifactVizConfig', () => {
    it('thread owner writes the merged chart config', async () => {
        const { service, aiAgentModel } = buildService();

        await service.updateComposerArtifactVizConfig(owner, args);

        expect(
            aiAgentModel.updateArtifactVersionChartConfig,
        ).toHaveBeenCalledWith('version-uuid', {
            ...composerChartConfig,
            vizConfig: {
                type: ChartKind.VERTICAL_BAR,
                metadata: { version: 1 },
                fieldConfig: { ...barConfig.fieldConfig, groupBy: [] },
                display: undefined,
            },
        });
    });

    it('normalises the config before writing it', async () => {
        const { service, aiAgentModel } = buildService();

        await service.updateComposerArtifactVizConfig(owner, {
            ...args,
            vizConfig: {
                type: ChartKind.BIG_NUMBER,
                metadata: { version: 1 },
                fieldConfig: {
                    x: undefined,
                    y: [
                        {
                            reference: 'revenue',
                            aggregation: VizAggregationOptions.ANY,
                        },
                    ],
                    groupBy: undefined,
                },
            },
        });

        const written = aiAgentModel.updateArtifactVersionChartConfig.mock
            .calls[0][1] as { vizConfig: { fieldConfig: unknown } };
        expect(written.vizConfig.fieldConfig).toEqual({
            x: undefined,
            y: [
                {
                    reference: 'revenue',
                    aggregation: VizAggregationOptions.ANY,
                },
            ],
            groupBy: [],
        });
    });

    it('forbids another user in the org without manage on the agent', async () => {
        const { service, aiAgentModel } = buildService();

        await expect(
            service.updateComposerArtifactVizConfig(
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

        await service.updateComposerArtifactVizConfig(
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
            service.updateComposerArtifactVizConfig(owner, args),
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
            service.updateComposerArtifactVizConfig(owner, args),
        ).rejects.toThrow(ForbiddenError);
    });

    it('rejects a version that belongs to a different artifact', async () => {
        const { service, aiAgentModel } = buildService({
            artifact: { ...artifact, artifactUuid: 'other-artifact-uuid' },
        });

        await expect(
            service.updateComposerArtifactVizConfig(owner, args),
        ).rejects.toThrow(NotFoundError);
        expect(
            aiAgentModel.updateArtifactVersionChartConfig,
        ).not.toHaveBeenCalled();
    });

    it('rejects an invalid body without writing', async () => {
        const { service, aiAgentModel } = buildService();

        await expect(
            service.updateComposerArtifactVizConfig(owner, {
                ...args,
                vizConfig: {
                    type: ChartKind.SCATTER,
                    metadata: { version: 1 },
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
            service.updateComposerArtifactVizConfig(owner, args),
        ).rejects.toThrow(ParameterError);
        expect(
            aiAgentModel.updateArtifactVersionChartConfig,
        ).not.toHaveBeenCalled();
    });
});
