import {
    AgentActorSurface,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    InvalidUser,
} from '@lightdash/common';
import { defaultSessionUser } from '../../auth/account/account.mock';
import {
    assertAgentWorkAllowed,
    assertAgentWorkUserActive,
    createAgentDeliveryGuard,
    parseAgentWorkMarker,
} from './agentWorkAuthority';

const marker = {
    userUuid: defaultSessionUser.userUuid,
    organizationUuid: defaultSessionUser.organizationUuid!,
    projectUuid: 'project',
};
const work = { ...marker, surface: AgentActorSurface.SLACK_AGENT };
const setup = () => ({
    userModel: {
        findSessionUserAndOrgByUuid: vi
            .fn()
            .mockResolvedValue(defaultSessionUser),
        findServiceAccountByUserUuid: vi.fn().mockResolvedValue(undefined),
    },
    agentPermissionService: {
        loadRequest: vi.fn().mockResolvedValue({}),
        assertOperationWithRequest: vi.fn().mockResolvedValue(undefined),
    },
    agentActionLogModel: { insert: vi.fn().mockResolvedValue(undefined) },
});

describe('parseAgentWorkMarker', () => {
    it.each([{}, { agentWork: undefined }])(
        'recognizes absent markers: %j',
        (payload) => {
            expect(parseAgentWorkMarker(payload)).toEqual({ status: 'absent' });
        },
    );
    it('accepts a marker that matches its payload', () => {
        expect(parseAgentWorkMarker({ ...marker, agentWork: marker })).toEqual({
            status: 'valid',
            marker,
        });
    });
    it.each([
        null,
        'marker',
        [],
        {
            userUuid: marker.userUuid,
            organizationUuid: marker.organizationUuid,
        },
        { ...marker, userUuid: '' },
        { ...marker, userUuid: '  ' },
        { ...marker, userUuid: 'other' },
        { ...marker, organizationUuid: 'other' },
        { ...marker, projectUuid: 'other' },
    ])('rejects malformed markers: %j', (agentWork) => {
        expect(parseAgentWorkMarker({ ...marker, agentWork })).toEqual({
            status: 'malformed',
        });
    });
});

describe('assertAgentWorkAllowed', () => {
    it('returns the fresh active user and checks admission against fresh policy', async () => {
        const deps = setup();
        expect(await assertAgentWorkAllowed(deps, work)).toBe(
            defaultSessionUser,
        );
        expect(
            deps.userModel.findSessionUserAndOrgByUuid,
        ).toHaveBeenCalledExactlyOnceWith(
            marker.userUuid,
            marker.organizationUuid,
        );
        expect(
            deps.userModel.findServiceAccountByUserUuid,
        ).not.toHaveBeenCalled();
        expect(
            deps.agentPermissionService.loadRequest,
        ).toHaveBeenCalledExactlyOnceWith(marker.organizationUuid);
        expect(
            deps.agentPermissionService.assertOperationWithRequest,
        ).toHaveBeenCalledWith({
            request: {},
            operation: expect.objectContaining({
                kind: 'agent_turn',
                key: 'agent_turn',
                surface: work.surface,
                organizationUuid: marker.organizationUuid,
                projectUuid: marker.projectUuid,
                account: expect.objectContaining({
                    user: expect.objectContaining({ id: marker.userUuid }),
                }),
            }),
        });
    });
    it('refuses an inactive human and records the admission refusal', async () => {
        const deps = setup();
        deps.userModel.findSessionUserAndOrgByUuid.mockResolvedValue({
            ...defaultSessionUser,
            isActive: false,
        });
        await expect(assertAgentWorkAllowed(deps, work)).rejects.toMatchObject({
            refusal: {
                reason: AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
                operation: 'agent_turn',
                policyLayer: 'organization_setting',
            },
        });
        expect(
            deps.userModel.findServiceAccountByUserUuid,
        ).toHaveBeenCalledExactlyOnceWith(marker.userUuid);
        expect(deps.agentActionLogModel.insert).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                object_type: 'agent_operation',
                object_id: 'agent_turn',
                action: 'agent_turn',
                outcome: 'denied',
                reason_code: AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
                organization_uuid: marker.organizationUuid,
                project_uuid: marker.projectUuid,
            }),
        );
    });
    it('allows an inactive service-account principal', async () => {
        const deps = setup();
        const user = { ...defaultSessionUser, isActive: false };
        deps.userModel.findSessionUserAndOrgByUuid.mockResolvedValue(user);
        deps.userModel.findServiceAccountByUserUuid.mockResolvedValue({
            organizationUuid: marker.organizationUuid,
        });
        expect(await assertAgentWorkAllowed(deps, work)).toBe(user);
    });
    it('records a refusal for someone who is no longer in the organization', async () => {
        const deps = setup();
        deps.userModel.findSessionUserAndOrgByUuid.mockRejectedValue(
            new InvalidUser('No membership'),
        );
        await expect(assertAgentWorkAllowed(deps, work)).rejects.toBeInstanceOf(
            AiAccessRefusedError,
        );
        expect(deps.agentActionLogModel.insert).toHaveBeenCalledExactlyOnceWith(
            {
                organization_uuid: marker.organizationUuid,
                project_uuid: marker.projectUuid,
                agent_identity: expect.objectContaining({
                    subject: { type: 'user', uuid: marker.userUuid },
                    act: expect.objectContaining({
                        surface: work.surface,
                        client_id: null,
                        agent_uuid: null,
                    }),
                }),
                object_type: 'agent_operation',
                object_uuid: null,
                object_id: 'agent_turn',
                version_uuid: null,
                action: 'agent_turn',
                outcome: 'denied',
                policy_layer: 'organization_setting',
                reason_code: AiAccessRefusalReason.AGENT_USER_NOT_ALLOWED,
                capability: null,
            },
        );
    });
    it('propagates the policy refusal unchanged', async () => {
        const deps = setup();
        const refusal = new AiAccessRefusedError(
            AiAccessRefusalReason.AGENT_PROJECT_DENIED,
        );
        deps.agentPermissionService.assertOperationWithRequest.mockRejectedValue(
            refusal,
        );
        await expect(assertAgentWorkAllowed(deps, work)).rejects.toBe(refusal);
    });
    it('does not cache a policy request between checks', async () => {
        const deps = setup();
        await assertAgentWorkAllowed(deps, work);
        await assertAgentWorkAllowed(deps, work);
        expect(deps.agentPermissionService.loadRequest).toHaveBeenCalledTimes(
            2,
        );
    });
});

describe('createAgentDeliveryGuard', () => {
    it('checks the first stale assertion without a prior check', async () => {
        const check = vi.fn().mockResolvedValue('allowed');
        const guard = createAgentDeliveryGuard({
            enabled: true,
            check,
            now: () => 0,
        });
        await expect(guard.assertIfStale()).resolves.toBe('allowed');
        expect(check).toHaveBeenCalledTimes(1);
    });

    it.each(['user', 'request'] as const)(
        'latches a %s load failure unchanged without retrying',
        async (stage) => {
            const deps = setup();
            const error = new Error('Database unavailable');
            const load =
                stage === 'user'
                    ? deps.userModel.findSessionUserAndOrgByUuid
                    : deps.agentPermissionService.loadRequest;
            load.mockRejectedValueOnce(error);
            const guard = createAgentDeliveryGuard({
                enabled: true,
                check: () => assertAgentWorkAllowed(deps, work),
                now: () => 0,
            });
            await expect(guard.assertIfStale()).rejects.toBe(error);
            await expect(guard.assertIfStale()).rejects.toBe(error);
            await expect(guard.assert()).rejects.toBe(error);
            expect(guard.getFailure()).toEqual({ error });
            expect(load).toHaveBeenCalledTimes(1);
        },
    );

    it.each(['failure-first', 'success-first'] as const)(
        'does not deduplicate overlapping checks or cache success across a failure: %s',
        async (order) => {
            const failure = Promise.withResolvers<void>();
            const success = Promise.withResolvers<void>();
            const error = new Error('Check failed');
            const check = vi
                .fn()
                .mockImplementationOnce(() => failure.promise)
                .mockImplementationOnce(() => success.promise)
                .mockResolvedValue(undefined);
            const guard = createAgentDeliveryGuard({
                enabled: true,
                check,
                now: () => 0,
            });
            const first = guard.assertIfStale().then(
                () => null,
                (checkError: unknown) => checkError,
            );
            const second = guard.assertIfStale().then(
                () => null,
                (checkError: unknown) => checkError,
            );
            expect(check).toHaveBeenCalledTimes(2);
            if (order === 'failure-first') {
                failure.reject(error);
                await first;
                success.resolve();
                await second;
            } else {
                success.resolve();
                await second;
                failure.reject(error);
                await first;
            }
            expect(await first).toBe(error);
            expect(await second).toBe(order === 'failure-first' ? error : null);
            await expect(guard.assertIfStale()).rejects.toBe(error);
            await expect(guard.assert()).rejects.toBe(error);
            expect(check).toHaveBeenCalledTimes(2);
        },
    );

    it.each([
        new AiAccessRefusedError(AiAccessRefusalReason.AGENT_PROJECT_DENIED),
        new Error('Database unavailable'),
        null,
        undefined,
    ])(
        'keeps the first thrown value for every later assertion: %s',
        async (error) => {
            const check = vi
                .fn()
                .mockRejectedValueOnce(error)
                .mockResolvedValue('allowed');
            const guard = createAgentDeliveryGuard({
                enabled: true,
                check,
                now: () => 0,
            });
            expect(guard.getFailure()).toBeNull();
            await expect(guard.assert()).rejects.toBe(error);
            await expect(guard.assert()).rejects.toBe(error);
            await expect(guard.assertIfStale()).rejects.toBe(error);
            expect(guard.getFailure()?.error).toBe(error);
            expect(check).toHaveBeenCalledTimes(1);
        },
    );

    it('never checks while disabled', async () => {
        const check = vi.fn().mockRejectedValue(new Error('Must not run'));
        const guard = createAgentDeliveryGuard({
            enabled: false,
            check,
            now: () => 60_000,
        });
        await guard.assert();
        await guard.assertIfStale();
        expect(check).not.toHaveBeenCalled();
        expect(guard.getFailure()).toBeNull();
    });
    it('always checks forced assertions', async () => {
        const check = vi.fn();
        const guard = createAgentDeliveryGuard({
            enabled: true,
            check,
            now: () => 0,
        });
        await guard.assert();
        await guard.assert();
        expect(check).toHaveBeenCalledTimes(2);
    });
    it('records the start check and checks again at 30 seconds', async () => {
        let time = 0;
        const check = vi.fn();
        const guard = createAgentDeliveryGuard({
            enabled: true,
            check,
            now: () => time,
        });
        await guard.assert();
        await guard.assertIfStale();
        time = 29_999;
        await guard.assertIfStale();
        expect(check).toHaveBeenCalledTimes(1);
        time = 30_000;
        await guard.assertIfStale();
        expect(check).toHaveBeenCalledTimes(2);
    });
    it('does not record failed checks as successful', async () => {
        let time = 0;
        const check = vi.fn().mockResolvedValue(undefined);
        const guard = createAgentDeliveryGuard({
            enabled: true,
            check,
            now: () => time,
        });
        await guard.assert();
        time = 30_000;
        const error = new Error('refused');
        check.mockRejectedValueOnce(error);
        await expect(guard.assertIfStale()).rejects.toThrow('refused');
        await expect(guard.assertIfStale()).rejects.toBe(error);
        expect(check).toHaveBeenCalledTimes(2);
    });
});

describe('assertAgentWorkUserActive', () => {
    it('checks the already loaded active person without another read', async () => {
        const deps = setup();
        await assertAgentWorkUserActive(deps, work, defaultSessionUser);
        expect(
            deps.userModel.findSessionUserAndOrgByUuid,
        ).not.toHaveBeenCalled();
        expect(
            deps.userModel.findServiceAccountByUserUuid,
        ).not.toHaveBeenCalled();
        expect(deps.agentPermissionService.loadRequest).not.toHaveBeenCalled();
    });
    it('refuses the already loaded inactive person without reloading', async () => {
        const deps = setup();
        await expect(
            assertAgentWorkUserActive(deps, work, {
                ...defaultSessionUser,
                isActive: false,
            }),
        ).rejects.toBeInstanceOf(AiAccessRefusedError);
        expect(
            deps.userModel.findSessionUserAndOrgByUuid,
        ).not.toHaveBeenCalled();
        expect(deps.agentActionLogModel.insert).toHaveBeenCalledTimes(1);
    });
});

test('reuses an explicitly supplied fresh person without loading them again', async () => {
    const deps = setup();
    await expect(
        assertAgentWorkAllowed(deps, work, {
            freshlyLoadedUser: defaultSessionUser,
        }),
    ).resolves.toBe(defaultSessionUser);
    expect(deps.userModel.findSessionUserAndOrgByUuid).not.toHaveBeenCalled();
    expect(deps.agentPermissionService.loadRequest).toHaveBeenCalledOnce();
    expect(
        deps.agentPermissionService.assertOperationWithRequest,
    ).toHaveBeenCalledOnce();
});

test.each(['userUuid', 'organizationUuid'] as const)(
    'rejects a supplied person with a different %s',
    async (key) => {
        const deps = setup();
        await expect(
            assertAgentWorkAllowed(deps, work, {
                freshlyLoadedUser: { ...defaultSessionUser, [key]: 'other' },
            }),
        ).rejects.toBeInstanceOf(AiAccessRefusedError);
        expect(
            deps.agentPermissionService.assertOperationWithRequest,
        ).not.toHaveBeenCalled();
    },
);

test('validates summary organisation and project independently of the trace user', () => {
    const payload = { ...marker, userUuid: 'trace-user', agentWork: marker };
    expect(parseAgentWorkMarker(payload)).toEqual({ status: 'malformed' });
    expect(
        parseAgentWorkMarker({
            agentWork: payload.agentWork,
            organizationUuid: payload.organizationUuid,
            projectUuid: payload.projectUuid,
        }),
    ).toEqual({ status: 'valid', marker });
});
