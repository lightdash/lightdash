import { Ability } from '@casl/ability';
import {
    WarehouseTypes,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { type DbAgentOnboardingRun } from '../../database/entities/agentOnboarding';
import { SandboxConnectionError, SandboxTimeoutError } from '../SandboxRuntime';
import { MockSandbox } from '../SandboxRuntime/SandboxRuntime.mock';
import { pollDetachedAgentRun } from './agentStreamPoller';
import { OnboardingAgentService } from './OnboardingAgentService';
import { hasCompleteOnboardingOutput } from './utils';

vi.mock('./agentStreamPoller', () => ({ pollDetachedAgentRun: vi.fn() }));
vi.mock('./utils', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./utils')>()),
    hasCompleteOnboardingOutput: vi.fn(() => true),
}));

const RUN_UUID = 'run-uuid';
const PROJECT_UUID = 'project-uuid';
const ORGANIZATION_UUID = defaultSessionUser.organizationUuid!;
const CREATED_AT = new Date('2026-11-04T10:00:00.000Z');
const STARTED_AT = new Date('2026-11-04T10:00:05.000Z');
const COMPLETED_AT = new Date('2026-11-04T10:02:05.000Z');

const sessionUser: SessionUser = {
    ...defaultSessionUser,
    ability: new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'all' },
    ]),
};

const dbRun = (
    overrides: Partial<DbAgentOnboardingRun> = {},
): DbAgentOnboardingRun => ({
    agent_onboarding_run_uuid: RUN_UUID,
    organization_uuid: ORGANIZATION_UUID,
    project_uuid: PROJECT_UUID,
    created_by_user_uuid: sessionUser.userUuid,
    status: 'running',
    stage: 'exploring_warehouse',
    events: [],
    handoff: null,
    usage: null,
    files: [],
    pat_uuid: null,
    sandbox_uuid: null,
    error_message: null,
    cancellation_requested_at: null,
    started_at: STARTED_AT,
    completed_at: COMPLETED_AT,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    ...overrides,
});

const setup = () => {
    const analytics = { track: vi.fn() };
    const agentOnboardingRunModel = {
        create: vi.fn(async () => dbRun({ status: 'queued', stage: null })),
        claimQueuedRun: vi.fn(async () => dbRun()),
        findByUuid: vi.fn(async () => dbRun()),
        findActiveRunForProject: vi.fn(
            async (): Promise<DbAgentOnboardingRun | null> => null,
        ),
        markFailed: vi.fn(async () => true),
        markFailedIfIdle: vi.fn(async () => true),
        markCompleted: vi.fn(async () => true),
        markCancelled: vi.fn(async () => true),
        update: vi.fn(async () => undefined),
        appendEvent: vi.fn(async () => true),
        replaceFiles: vi.fn(async () => undefined),
    };
    const schedulerClient = {
        agentOnboardingRun: vi.fn(async () => undefined),
    };
    const sandboxManager = {
        acquire: vi.fn(async () => ({
            sandboxUuid: 'sandbox-uuid',
            handle: new MockSandbox('sandbox'),
        })),
        destroy: vi.fn(async () => undefined),
    };
    const service = new OnboardingAgentService({
        lightdashConfig: {
            ...lightdashConfigMock,
            appRuntime: {
                ...lightdashConfigMock.appRuntime,
                sandboxProvider: 'docker',
            },
            ai: {
                ...lightdashConfigMock.ai,
                copilot: {
                    ...lightdashConfigMock.ai.copilot,
                    providers: {
                        ...lightdashConfigMock.ai.copilot.providers,
                        anthropic: { apiKey: 'anthropic-key' },
                    },
                },
            },
        },
        analytics,
        agentOnboardingRunModel,
        projectModel: {
            getSummary: vi.fn(async () => ({
                organizationUuid: ORGANIZATION_UUID,
            })),
            getWithSensitiveFields: vi.fn(async () => ({
                warehouseConnection: {
                    type: WarehouseTypes.POSTGRES,
                    dbname: 'analytics',
                    schema: 'public',
                },
            })),
        },
        personalAccessTokenService: {
            createPersonalAccessToken: vi.fn(async () => ({
                uuid: 'pat-uuid',
                token: 'ldpat_token',
            })),
            deletePersonalAccessToken: vi.fn(async () => undefined),
        },
        promptService: { getPrompt: vi.fn(async () => 'prompt') },
        userService: {
            getSessionByUserUuidAndOrg: vi.fn(async () => sessionUser),
        },
        schedulerClient,
        sandboxManager,
        fileStore: {
            assertConfigured: vi.fn(),
            get: vi.fn(),
            put: vi.fn(),
        },
    } as unknown as ConstructorParameters<typeof OnboardingAgentService>[0]);
    return {
        service,
        analytics,
        agentOnboardingRunModel,
        sandboxManager,
        schedulerClient,
    };
};

const finished = (properties: Record<string, unknown>) => ({
    event: 'onboarding_agent.run_finished',
    userId: sessionUser.userUuid,
    properties: {
        organizationId: ORGANIZATION_UUID,
        projectId: PROJECT_UUID,
        agentOnboardingRunId: RUN_UUID,
        lastStage: 'exploring_warehouse',
        durationSeconds: 120,
        numTurns: null,
        ...properties,
    },
});

describe('OnboardingAgentService run_finished analytics', () => {
    beforeEach(() => {
        vi.mocked(pollDetachedAgentRun).mockImplementation(
            async ({ onLine }) => {
                onLine(JSON.stringify({ type: 'result', num_turns: 12 }));
                return { exitCode: 0 };
            },
        );
        vi.mocked(hasCompleteOnboardingOutput).mockReturnValue(true);
    });

    test('tracks a completed run', async () => {
        const { service, analytics } = setup();
        await service.executeRun({ agentOnboardingRunUuid: RUN_UUID });
        expect(analytics.track).toHaveBeenCalledExactlyOnceWith(
            finished({
                status: 'completed',
                failureCategory: null,
                numTurns: 12,
            }),
        );
    });

    test('tracks incomplete output as a failure', async () => {
        vi.mocked(hasCompleteOnboardingOutput).mockReturnValue(false);
        const { service, analytics } = setup();
        await service.executeRun({ agentOnboardingRunUuid: RUN_UUID });
        expect(analytics.track).toHaveBeenCalledExactlyOnceWith(
            finished({
                status: 'failed',
                failureCategory: 'incomplete_output',
                numTurns: 12,
            }),
        );
    });

    test.each([
        [new SandboxConnectionError(), 'sandbox_connection'],
        [new SandboxTimeoutError(), 'timeout'],
        [new Error('boom'), 'unknown'],
    ])('tracks a run failing with %s', async (error, failureCategory) => {
        const { service, analytics, sandboxManager } = setup();
        sandboxManager.acquire.mockRejectedValueOnce(error);
        await service.executeRun({ agentOnboardingRunUuid: RUN_UUID });
        expect(analytics.track).toHaveBeenCalledExactlyOnceWith(
            finished({ status: 'failed', failureCategory }),
        );
    });

    test('tracks a cancelled run', async () => {
        const { service, analytics, agentOnboardingRunModel, sandboxManager } =
            setup();
        sandboxManager.acquire.mockRejectedValueOnce(new Error('stopped'));
        agentOnboardingRunModel.findByUuid.mockResolvedValue(
            dbRun({ cancellation_requested_at: new Date() }),
        );
        await service.executeRun({ agentOnboardingRunUuid: RUN_UUID });
        expect(analytics.track).toHaveBeenCalledExactlyOnceWith(
            finished({ status: 'cancelled', failureCategory: null }),
        );
    });

    test('does not track when another writer already settled the run', async () => {
        const { service, analytics, agentOnboardingRunModel, sandboxManager } =
            setup();
        sandboxManager.acquire.mockRejectedValueOnce(new Error('boom'));
        agentOnboardingRunModel.markFailed.mockResolvedValueOnce(false);
        await service.executeRun({ agentOnboardingRunUuid: RUN_UUID });
        expect(analytics.track).not.toHaveBeenCalled();
    });

    test('tracks a timed out run', async () => {
        const { service, analytics } = setup();
        await service.markRunTimedOut(RUN_UUID);
        expect(analytics.track).toHaveBeenCalledExactlyOnceWith(
            finished({ status: 'failed', failureCategory: 'timeout' }),
        );
    });

    test('tracks an abandoned run', async () => {
        const { service, analytics, agentOnboardingRunModel } = setup();
        agentOnboardingRunModel.findActiveRunForProject.mockResolvedValueOnce(
            dbRun({ updated_at: new Date(0) }),
        );
        await service.getActiveRun(sessionUser, PROJECT_UUID);
        expect(analytics.track).toHaveBeenCalledExactlyOnceWith(
            finished({ status: 'failed', failureCategory: 'abandoned' }),
        );
    });

    test('tracks a run that could not be scheduled', async () => {
        const { service, analytics, schedulerClient } = setup();
        const scheduleError = new Error('queue down');
        schedulerClient.agentOnboardingRun.mockRejectedValueOnce(scheduleError);
        await expect(
            service.createRun({ user: sessionUser, projectUuid: PROJECT_UUID }),
        ).rejects.toBe(scheduleError);
        expect(analytics.track).toHaveBeenCalledExactlyOnceWith(
            finished({ status: 'failed', failureCategory: 'schedule_failed' }),
        );
    });
});
