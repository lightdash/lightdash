import { EE_SCHEDULER_TASKS, InvalidUser } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { traceTask } from '../../scheduler/SchedulerTaskTracer';
import { AiAgentService } from '../services/AiAgentService/AiAgentService';
import {
    WRITEBACK_AGENT_ACCESS_CHECK_FAILED_MESSAGE,
    WRITEBACK_AGENT_ACCESS_REFUSED_MESSAGE,
} from '../services/AiWritebackService/errors';
import { CommercialSchedulerWorker } from './SchedulerWorker';

vi.mock('@sentry/node', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@sentry/node')>()),
    captureException: vi.fn(),
}));
vi.mock('../services/ai/AiAgentMcpRuntimeClient', () => ({
    AiAgentMcpRuntimeClient: class {},
}));

const payload = {
    organizationUuid: 'org',
    projectUuid: 'preview',
    userUuid: 'user',
    agentUuid: 'agent',
    threadUuid: 'thread',
    remediationUuid: 'remediation',
    fingerprint: 'finding',
};
const marker = {
    organizationUuid: 'org',
    projectUuid: 'preview',
    userUuid: 'user',
};
const activeUser = {
    ...defaultSessionUser,
    organizationUuid: 'org',
    userUuid: 'user',
    isActive: true,
};
const buildWorker = () => {
    const userModel = {
        findSessionUserAndOrgByUuid: vi.fn().mockResolvedValue(activeUser),
        findServiceAccountByUserUuid: vi.fn().mockResolvedValue(undefined),
    };
    const agentActionLogModel = { insert: vi.fn() };
    const agentPermissionService = {
        loadRequest: vi.fn(),
        assertOperationWithRequest: vi.fn(),
    };
    const featureFlagService = { get: vi.fn() };
    const updateReviewRemediationStatus = vi.fn();
    const service = new AiAgentService({
        userModel,
        agentActionLogModel,
        agentPermissionService,
        featureFlagService,
        aiAgentReviewClassifierModel: { updateReviewRemediationStatus },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    const generate = vi
        .spyOn(service, 'generateAgentThreadResponse')
        .mockResolvedValue('Verified.');
    const verified = vi.fn();
    const logSchedulerJob = vi.fn();
    const worker = new CommercialSchedulerWorker({
        lightdashConfig: { scheduler: { tasks: [] } },
        aiAgentService: service,
        aiAgentAdminService: { recordReviewRemediationVerified: verified },
        schedulerService: { logSchedulerJob },
    } as unknown as ConstructorParameters<typeof CommercialSchedulerWorker>[0]);
    const run = (marked: boolean) =>
        traceTask(
            EE_SCHEDULER_TASKS.AI_AGENT_REVIEW_REMEDIATION_RUN,
            worker['getFullTaskList']()[
                EE_SCHEDULER_TASKS.AI_AGENT_REVIEW_REMEDIATION_RUN
            ],
        )({ ...payload, ...(marked ? { agentWork: marker } : {}) }, {
            job: {
                id: 'job',
                run_at: new Date(),
                attempts: 1,
                max_attempts: 1,
            },
        } as Parameters<
            ReturnType<
                (typeof worker)['getFullTaskList']
            >[typeof EE_SCHEDULER_TASKS.AI_AGENT_REVIEW_REMEDIATION_RUN]
        >[1]);
    return {
        run,
        service,
        userModel,
        generate,
        verified,
        logSchedulerJob,
        updateReviewRemediationStatus,
        agentActionLogModel,
        agentPermissionService,
        featureFlagService,
    };
};

beforeEach(() => vi.clearAllMocks());

it('keeps the unmarked worker person load, response and completion write', async () => {
    const h = buildWorker();
    await h.run(false);
    expect(
        h.userModel.findSessionUserAndOrgByUuid,
    ).toHaveBeenCalledExactlyOnceWith('user', 'org');
    expect(h.generate).toHaveBeenCalledExactlyOnceWith(activeUser, {
        aiCreditCheck: { isEmbedViewer: false },
        agentUuid: 'agent',
        threadUuid: 'thread',
        autoApproveSql: true,
    });
    expect(h.verified).toHaveBeenCalledExactlyOnceWith(payload);
    expect(h.updateReviewRemediationStatus).not.toHaveBeenCalled();
    expect(h.featureFlagService.get).not.toHaveBeenCalled();
    expect(h.agentPermissionService.loadRequest).not.toHaveBeenCalled();
    expect(h.agentActionLogModel.insert).not.toHaveBeenCalled();
    expect(h.userModel.findServiceAccountByUserUuid).not.toHaveBeenCalled();
});

it.each(['start', 'completion'] as const)(
    'settles refusal at %s without verification or Sentry',
    async (stage) => {
        const h = buildWorker();
        if (stage === 'start')
            h.userModel.findSessionUserAndOrgByUuid.mockResolvedValue({
                ...activeUser,
                isActive: false,
            });
        else
            h.generate.mockImplementationOnce(async () => {
                h.userModel.findSessionUserAndOrgByUuid.mockResolvedValue({
                    ...activeUser,
                    isActive: false,
                });
                return 'Verified.';
            });
        await expect(h.run(true)).resolves.toBeUndefined();
        expect(h.generate).toHaveBeenCalledTimes(stage === 'start' ? 0 : 1);
        expect(h.verified).not.toHaveBeenCalled();
        expect(h.updateReviewRemediationStatus).toHaveBeenCalledExactlyOnceWith(
            {
                organizationUuid: 'org',
                remediationUuid: 'remediation',
                status: 'failed',
                errorMessage: WRITEBACK_AGENT_ACCESS_REFUSED_MESSAGE,
            },
        );
        expect(Sentry.captureException).not.toHaveBeenCalled();
        expect(h.logSchedulerJob).not.toHaveBeenCalled();
    },
);

it('uses the existing start load and one fresh completion load', async () => {
    const h = buildWorker();
    await h.run(true);
    expect(h.userModel.findSessionUserAndOrgByUuid).toHaveBeenCalledTimes(2);
    expect(h.verified).toHaveBeenCalledExactlyOnceWith({
        ...payload,
        agentWork: marker,
    });
    expect(h.agentPermissionService.loadRequest).not.toHaveBeenCalled();
    expect(h.featureFlagService.get).not.toHaveBeenCalled();
});

it.each([false, true])(
    'records a failed check and reports it once (completion=%s)',
    async (completion) => {
        const h = buildWorker();
        const error = new Error('private connection failure');
        if (completion)
            h.generate.mockImplementationOnce(async () => {
                h.userModel.findSessionUserAndOrgByUuid.mockRejectedValue(
                    error,
                );
                return 'Verified.';
            });
        else h.userModel.findSessionUserAndOrgByUuid.mockRejectedValue(error);
        await expect(h.run(true)).rejects.toThrow(
            WRITEBACK_AGENT_ACCESS_CHECK_FAILED_MESSAGE,
        );
        expect(h.updateReviewRemediationStatus).toHaveBeenCalledExactlyOnceWith(
            {
                organizationUuid: 'org',
                remediationUuid: 'remediation',
                status: 'failed',
                errorMessage: WRITEBACK_AGENT_ACCESS_CHECK_FAILED_MESSAGE,
            },
        );
        expect(h.verified).not.toHaveBeenCalled();
        expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    },
);

it('refuses a malformed verification marker without loading a person', async () => {
    const h = buildWorker();
    await h.service.executeReviewRemediationRun(
        { ...payload, agentWork: { ...marker, projectUuid: 'source' } },
        h.verified,
    );
    expect(h.userModel.findSessionUserAndOrgByUuid).not.toHaveBeenCalled();
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.verified).not.toHaveBeenCalled();
    expect(h.updateReviewRemediationStatus).toHaveBeenCalledExactlyOnceWith({
        organizationUuid: 'org',
        remediationUuid: 'remediation',
        status: 'failed',
        errorMessage: WRITEBACK_AGENT_ACCESS_REFUSED_MESSAGE,
    });
});

it('settles missing membership without a verification event', async () => {
    const h = buildWorker();
    h.userModel.findSessionUserAndOrgByUuid.mockRejectedValue(
        new InvalidUser('private error'),
    );
    await h.run(true);
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.verified).not.toHaveBeenCalled();
    expect(h.updateReviewRemediationStatus).toHaveBeenCalledExactlyOnceWith({
        organizationUuid: 'org',
        remediationUuid: 'remediation',
        status: 'failed',
        errorMessage: WRITEBACK_AGENT_ACCESS_REFUSED_MESSAGE,
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
});

it('allows an inactive verification service account', async () => {
    const h = buildWorker();
    h.userModel.findSessionUserAndOrgByUuid.mockResolvedValue({
        ...activeUser,
        isActive: false,
    });
    h.userModel.findServiceAccountByUserUuid.mockResolvedValue({
        uuid: 'service-account',
    });
    await h.run(true);
    expect(h.generate).toHaveBeenCalledTimes(1);
    expect(h.verified).toHaveBeenCalledTimes(1);
    expect(h.userModel.findServiceAccountByUserUuid).toHaveBeenCalledTimes(2);
    expect(h.updateReviewRemediationStatus).not.toHaveBeenCalled();
});

it('preserves an unmarked person-load error and reports it once', async () => {
    const h = buildWorker();
    const error = new InvalidUser('original membership error');
    h.userModel.findSessionUserAndOrgByUuid.mockRejectedValue(error);
    await expect(h.run(false)).rejects.toBe(error);
    expect(h.updateReviewRemediationStatus).not.toHaveBeenCalled();
    expect(h.verified).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledExactlyOnceWith(error);
});
