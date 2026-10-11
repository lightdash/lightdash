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
    it('refuses someone who is no longer in the organization', async () => {
        const deps = setup();
        deps.userModel.findSessionUserAndOrgByUuid.mockRejectedValue(
            new InvalidUser('No membership'),
        );
        await expect(assertAgentWorkAllowed(deps, work)).rejects.toBeInstanceOf(
            AiAccessRefusedError,
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
    it('never checks while disabled', async () => {
        const check = vi.fn();
        const guard = createAgentDeliveryGuard({
            enabled: false,
            check,
            now: () => 60_000,
        });
        await guard.assert();
        await guard.assertIfStale();
        expect(check).not.toHaveBeenCalled();
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
        check.mockRejectedValueOnce(new Error('refused'));
        await expect(guard.assertIfStale()).rejects.toThrow('refused');
        await guard.assertIfStale();
        expect(check).toHaveBeenCalledTimes(3);
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
