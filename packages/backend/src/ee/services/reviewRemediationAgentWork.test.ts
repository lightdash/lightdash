import { InvalidUser } from '@lightdash/common';
import { defaultSessionUser } from '../../auth/account/account.mock';
import {
    WRITEBACK_AGENT_ACCESS_CHECK_FAILED_MESSAGE,
    WRITEBACK_AGENT_ACCESS_REFUSED_MESSAGE,
} from './AiWritebackService/errors';
import { createReviewRemediationAgentWorkGuard } from './reviewRemediationAgentWork';

const marker = {
    userUuid: 'person',
    organizationUuid: 'org',
    projectUuid: 'project',
};
const user = {
    ...defaultSessionUser,
    userUuid: marker.userUuid,
    organizationUuid: marker.organizationUuid,
    isActive: true,
};
const dependencies = () => ({
    userModel: {
        findSessionUserAndOrgByUuid: vi.fn().mockResolvedValue(user),
        findServiceAccountByUserUuid: vi.fn().mockResolvedValue(undefined),
    },
    agentActionLogModel: { insert: vi.fn() },
});

it('creates no guard for unmarked work', () => {
    const deps = dependencies();
    expect(createReviewRemediationAgentWorkGuard(deps, marker)).toBeNull();
    expect(deps.userModel.findSessionUserAndOrgByUuid).not.toHaveBeenCalled();
    expect(deps.userModel.findServiceAccountByUserUuid).not.toHaveBeenCalled();
    expect(deps.agentActionLogModel.insert).not.toHaveBeenCalled();
});

it('uses the supplied start person only once and reloads at every forced check', async () => {
    const deps = dependencies();
    const guard = createReviewRemediationAgentWorkGuard(deps, {
        ...marker,
        agentWork: marker,
    })!;
    await guard.assertUser(user);
    expect(deps.userModel.findSessionUserAndOrgByUuid).not.toHaveBeenCalled();
    await guard.assert();
    await guard.assert();
    expect(deps.userModel.findSessionUserAndOrgByUuid.mock.calls).toEqual([
        ['person', 'org'],
        ['person', 'org'],
    ]);
});

it.each(['start refusal', 'missing membership', 'load error'] as const)(
    'keeps its first %s after access recovers',
    async (failure) => {
        const deps = dependencies();
        const guard = createReviewRemediationAgentWorkGuard(deps, {
            ...marker,
            agentWork: marker,
        })!;
        if (failure === 'missing membership')
            deps.userModel.findSessionUserAndOrgByUuid.mockRejectedValueOnce(
                new InvalidUser('private membership'),
            );
        if (failure === 'load error')
            deps.userModel.findSessionUserAndOrgByUuid.mockRejectedValueOnce(
                new Error('private error'),
            );
        const first =
            failure === 'start refusal'
                ? guard.assertUser({ ...user, isActive: false })
                : guard.assert();
        await expect(first).rejects.toThrow(
            failure === 'load error'
                ? WRITEBACK_AGENT_ACCESS_CHECK_FAILED_MESSAGE
                : WRITEBACK_AGENT_ACCESS_REFUSED_MESSAGE,
        );
        const { error } = guard.getFailure()!;
        await expect(guard.assertUser(user)).rejects.toBe(error);
        await expect(guard.assert()).rejects.toBe(error);
        expect(
            deps.userModel.findSessionUserAndOrgByUuid,
        ).toHaveBeenCalledTimes(failure === 'start refusal' ? 0 : 1);
    },
);

it('loads the person for a forced check that overlaps the start check', async () => {
    const deps = dependencies();
    let releaseServiceAccount: () => void = () => undefined;
    deps.userModel.findServiceAccountByUserUuid.mockReturnValue(
        new Promise((resolve) => {
            releaseServiceAccount = () => resolve({ uuid: 'service-account' });
        }),
    );
    const guard = createReviewRemediationAgentWorkGuard(deps, {
        ...marker,
        agentWork: marker,
    })!;
    const start = guard.assertUser({ ...user, isActive: false });
    const forced = guard.assert();
    releaseServiceAccount();
    await Promise.all([start, forced]);
    expect(deps.userModel.findSessionUserAndOrgByUuid.mock.calls).toEqual([
        ['person', 'org'],
    ]);
});
