import { Ability } from '@casl/ability';
import {
    AnyType,
    ManagedAgentRunStatus,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import { getModel } from '../ai/models';
import { runAutopilotAgent } from './AutopilotAgentRunner';
import { ManagedAgentService } from './ManagedAgentService';

vi.mock('../ai/models', () => ({ getModel: vi.fn() }));
vi.mock('./AutopilotAgentRunner', () => ({ runAutopilotAgent: vi.fn() }));

const ORGANIZATION_UUID = 'organization-uuid';
const PROJECT_UUID = 'project-uuid';
const RUN_UUID = 'run-uuid';
const USER_UUID = 'user-uuid';

const settings = {
    projectUuid: PROJECT_UUID,
    enabled: true,
    schedule: 'daily',
    enabledByUserUuid: USER_UUID,
    slackChannelId: null,
    toolSettings: {},
    createdAt: new Date('2026-08-03T00:00:00.000Z'),
    updatedAt: new Date('2026-08-03T00:00:00.000Z'),
};

const abilityRules = [
    {
        action: 'update',
        subject: 'Project',
        conditions: {
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: PROJECT_UUID,
        },
    },
    {
        action: 'view',
        subject: 'Project',
        conditions: {
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: PROJECT_UUID,
        },
    },
] as const;

const user = {
    userUuid: USER_UUID,
    organizationUuid: ORGANIZATION_UUID,
    ability: new Ability<PossibleAbilities>([...abilityRules]),
    abilityRules,
} as AnyType as SessionUser;

const buildService = ({
    suggestionsSpaces = [],
}: {
    suggestionsSpaces?: Array<{
        uuid: string;
        inheritParentPermissions: boolean;
    }>;
} = {}) => {
    const managedAgentModel = {
        getSettings: vi.fn().mockResolvedValue(settings),
        upsertSettings: vi.fn().mockResolvedValue(settings),
        getRun: vi.fn().mockResolvedValue({
            triggeredBy: 'cron',
            startedAt: new Date('2026-09-11T00:00:00.000Z'),
        }),
        setRunSessionId: vi.fn().mockResolvedValue(undefined),
        finishRun: vi.fn().mockResolvedValue(undefined),
        getActionCountsByTypeForRun: vi.fn().mockResolvedValue({}),
    };
    const projectModel = {
        getSummary: vi.fn().mockResolvedValue({
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: PROJECT_UUID,
            name: 'Jaffle shop',
        }),
    };
    const schedulerClient = {
        scheduleManagedAgentHeartbeat: vi.fn().mockResolvedValue(undefined),
        cancelManagedAgentHeartbeat: vi.fn().mockResolvedValue(undefined),
    };
    const orgAiCopilotConfigResolver = {
        getCopilotConfig: vi.fn().mockResolvedValue({
            telemetryEnabled: false,
        }),
    };
    const aiAgentToolsService = {
        createRuntime: vi.fn().mockReturnValue({
            listExplores: vi.fn().mockResolvedValue([]),
            getProjectParameterDefinitions: vi.fn().mockResolvedValue({}),
            getVerifiedFieldUsage: vi.fn().mockResolvedValue(new Map()),
            findExplores: vi.fn(),
            findContent: vi.fn(),
            getDashboardCharts: vi.fn(),
            runAsyncQuery: vi.fn(),
            searchFieldValues: vi.fn(),
            getExplore: vi.fn(),
            loadSkill: vi.fn(),
        }),
    };
    const service = new ManagedAgentService({
        lightdashConfig: {
            siteUrl: 'https://lightdash.example.com',
            managedAgent: {
                schedule: '0 0 * * *',
                sessionTimeoutMs: 600_000,
                maxSteps: 120,
            },
            preAggregates: { enabled: false },
            ai: {
                copilot: {
                    maxQueryLimit: 500,
                    toolDescriptionMaxChars: 600,
                    telemetryEnabled: false,
                },
            },
        },
        analytics: { track: vi.fn() },
        managedAgentModel,
        analyticsModel: {},
        projectModel,
        validationModel: {},
        savedChartModel: {},
        dashboardModel: {},
        spaceModel: {
            find: vi.fn().mockResolvedValue(suggestionsSpaces),
        },
        spacePermissionService: {},
        userModel: {
            findSessionUserAndOrgByUuid: vi.fn().mockResolvedValue(user),
        },
        featureFlagModel: {},
        schedulerClient,
        slackClient: {},
        orgAiCopilotConfigResolver,
        aiAgentToolsService,
    } as AnyType);

    return {
        managedAgentModel,
        projectModel,
        schedulerClient,
        service,
    };
};

describe('ManagedAgentService.updateSettings', () => {
    it('schedules the first heartbeat when Autopilot is enabled', async () => {
        const { schedulerClient, service } = buildService();

        await service.updateSettings(user, PROJECT_UUID, USER_UUID, {
            enabled: true,
        });

        expect(
            schedulerClient.scheduleManagedAgentHeartbeat,
        ).toHaveBeenCalledWith('0 0 * * *', PROJECT_UUID);
    });

    it('cancels the pending heartbeat when Autopilot is disabled', async () => {
        const { schedulerClient, service } = buildService();

        await service.updateSettings(user, PROJECT_UUID, USER_UUID, {
            enabled: false,
        });

        expect(
            schedulerClient.cancelManagedAgentHeartbeat,
        ).toHaveBeenCalledWith(PROJECT_UUID);
    });
});

describe('ManagedAgentService.runHeartbeat', () => {
    beforeEach(() => {
        vi.mocked(getModel).mockReturnValue({
            model: { modelId: 'mock-model', provider: 'anthropic' },
            callOptions: {},
            providerOptions: undefined,
            keyManagement: 'lightdash-managed',
        } as AnyType);
    });

    it('runs the agent as the enabling user with the project policy and records the outcome', async () => {
        vi.mocked(runAutopilotAgent).mockResolvedValue({
            slackSummary: 'Flagged 2 stale charts.',
            stepCount: 7,
            stopReason: 'end_turn',
        });
        const { managedAgentModel, service } = buildService({
            suggestionsSpaces: [
                { uuid: 'space-uuid', inheritParentPermissions: false },
            ],
        });

        await service.runHeartbeat(PROJECT_UUID, RUN_UUID);

        expect(managedAgentModel.setRunSessionId).toHaveBeenCalledWith(
            RUN_UUID,
            RUN_UUID,
        );
        expect(runAutopilotAgent).toHaveBeenCalledWith(
            expect.objectContaining({
                projectName: 'Jaffle shop',
                maxSteps: 120,
                timeoutMs: 600_000,
                agent: expect.objectContaining({
                    system: expect.stringContaining('admin-only'),
                }),
            }),
        );
        expect(managedAgentModel.finishRun).toHaveBeenCalledWith(RUN_UUID, {
            status: ManagedAgentRunStatus.COMPLETED,
            actionCount: 0,
            summary: 'Flagged 2 stale charts.',
            error: null,
        });
    });

    it('marks a run that hit the step cap as an error but keeps its summary', async () => {
        vi.mocked(runAutopilotAgent).mockResolvedValue({
            slackSummary: 'Partial.',
            stepCount: 120,
            stopReason: 'step_cap',
        });
        const { managedAgentModel, service } = buildService();

        await service.runHeartbeat(PROJECT_UUID, RUN_UUID);

        expect(managedAgentModel.finishRun).toHaveBeenCalledWith(
            RUN_UUID,
            expect.objectContaining({
                status: ManagedAgentRunStatus.ERROR,
                summary: 'Partial.',
                error: expect.stringContaining('stopped after 120 steps'),
            }),
        );
    });

    it('records a provider failure on the run', async () => {
        vi.mocked(runAutopilotAgent).mockRejectedValue(
            new Error('invalid api key'),
        );
        const { managedAgentModel, service } = buildService();

        await service.runHeartbeat(PROJECT_UUID, RUN_UUID);

        expect(managedAgentModel.finishRun).toHaveBeenCalledWith(
            RUN_UUID,
            expect.objectContaining({
                status: ManagedAgentRunStatus.ERROR,
                error: 'invalid api key',
            }),
        );
    });
});
