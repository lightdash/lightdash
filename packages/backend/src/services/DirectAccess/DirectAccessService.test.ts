import { SpaceMemberRole, type RegisteredAccount } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { type DirectAccessModel } from '../../models/directAccessModelUtils';
import {
    DirectAccessService,
    type DirectAccessModels,
    type DirectAccessResourceType,
} from './DirectAccessService';

const account = {
    authentication: {
        type: 'service-account',
        source: 'test',
        serviceAccountUuid: 'audit-service-account-uuid',
        serviceAccountDescription: 'Test service account',
    },
    organization: { organizationUuid: 'organization-uuid' },
    user: {
        userUuid: 'persisted-user-uuid',
        role: 'admin',
    },
    requestContext: { requestId: 'request-id' },
    isAnonymousUser: () => false,
    isServiceAccount: () => true,
} as unknown as RegisteredAccount;

const mutationResult = {
    organizationId: 1,
    organizationUuid: 'organization-uuid',
    projectId: 2,
    projectUuid: 'project-uuid',
    beforeRole: null,
    afterRole: SpaceMemberRole.VIEWER,
};

const resetResult = {
    organizationId: 1,
    organizationUuid: 'organization-uuid',
    projectId: 2,
    projectUuid: 'project-uuid',
    revokedUsers: 1,
    revokedGroups: 1,
};

const createModel = (): DirectAccessModel =>
    ({
        getUserAccess: vi.fn(),
        upsertUserAccess: vi.fn().mockResolvedValue(mutationResult),
        upsertGroupAccess: vi.fn().mockResolvedValue(mutationResult),
        revokeUserAccess: vi.fn().mockResolvedValue(mutationResult),
        revokeGroupAccess: vi.fn().mockResolvedValue(mutationResult),
        resetAccess: vi.fn().mockResolvedValue(resetResult),
    }) as unknown as DirectAccessModel;

const createModels = (): DirectAccessModels => ({
    dashboard: createModel(),
    savedChart: createModel(),
    savedSql: createModel(),
    app: createModel(),
});

const createActorRoleResolver = () =>
    vi.fn().mockResolvedValue(SpaceMemberRole.ADMIN);

describe('DirectAccessService', () => {
    it('dispatches every resource type to its concrete model', async () => {
        const models = createModels();
        const actorRoleResolver = createActorRoleResolver();
        const service = new DirectAccessService(models, actorRoleResolver);
        const resourceTypes: DirectAccessResourceType[] = [
            'dashboard',
            'savedChart',
            'savedSql',
            'app',
        ];

        await Promise.all(
            resourceTypes.map((type) =>
                service.upsertUserAccess({
                    account,
                    resource: { type, uuid: `${type}-uuid` },
                    userUuid: 'principal-uuid',
                    role: SpaceMemberRole.VIEWER,
                }),
            ),
        );

        const transactionResolutions = resourceTypes.map((type) => {
            expect(models[type].upsertUserAccess).toHaveBeenCalledWith({
                resourceUuid: `${type}-uuid`,
                userUuid: 'principal-uuid',
                role: SpaceMemberRole.VIEWER,
                actorRole: SpaceMemberRole.ADMIN,
                actorRoleResolver: expect.any(Function),
                grantedByUserUuid: 'persisted-user-uuid',
            });
            const [{ actorRoleResolver: resolveInsideTransaction }] = vi.mocked(
                models[type].upsertUserAccess,
            ).mock.calls[0];
            return resolveInsideTransaction({
                transaction: {} as never,
                context: mutationResult,
            });
        });
        await Promise.all(transactionResolutions);
        expect(actorRoleResolver).toHaveBeenCalledTimes(8);
        expect(actorRoleResolver).toHaveBeenCalledWith({
            account,
            organizationUuid: 'organization-uuid',
            phase: 'preflight',
            resource: { type: 'dashboard', uuid: 'dashboard-uuid' },
        });
        expect(actorRoleResolver).toHaveBeenCalledWith({
            account,
            organizationUuid: 'organization-uuid',
            phase: 'transaction',
            transaction: {},
            context: mutationResult,
            resource: { type: 'dashboard', uuid: 'dashboard-uuid' },
        });
    });

    it('routes every mutation through the shared service contract', async () => {
        const models = createModels();
        const auditLogger = vi.fn();
        const service = new DirectAccessService(
            models,
            createActorRoleResolver(),
            auditLogger,
        );
        const mutationActor = {
            account,
            resource: {
                type: 'dashboard' as const,
                uuid: 'dashboard-uuid',
            },
        };

        await service.upsertUserAccess({
            ...mutationActor,
            userUuid: 'principal-uuid',
            role: SpaceMemberRole.VIEWER,
        });
        await service.upsertGroupAccess({
            ...mutationActor,
            groupUuid: 'group-uuid',
            role: SpaceMemberRole.EDITOR,
        });
        await service.revokeUserAccess({
            ...mutationActor,
            userUuid: 'principal-uuid',
        });
        await service.revokeGroupAccess({
            ...mutationActor,
            groupUuid: 'group-uuid',
        });
        await service.resetAccess(mutationActor);

        expect(models.dashboard.upsertGroupAccess).toHaveBeenCalledWith({
            resourceUuid: 'dashboard-uuid',
            groupUuid: 'group-uuid',
            role: SpaceMemberRole.EDITOR,
            actorRole: SpaceMemberRole.ADMIN,
            actorRoleResolver: expect.any(Function),
            grantedByUserUuid: 'persisted-user-uuid',
        });
        expect(models.dashboard.revokeUserAccess).toHaveBeenCalledWith({
            resourceUuid: 'dashboard-uuid',
            userUuid: 'principal-uuid',
            actorRole: SpaceMemberRole.ADMIN,
            actorRoleResolver: expect.any(Function),
            actorUserUuid: 'persisted-user-uuid',
        });
        expect(models.dashboard.revokeGroupAccess).toHaveBeenCalledWith({
            resourceUuid: 'dashboard-uuid',
            groupUuid: 'group-uuid',
            actorRole: SpaceMemberRole.ADMIN,
            actorRoleResolver: expect.any(Function),
        });
        expect(models.dashboard.resetAccess).toHaveBeenCalledWith({
            resourceUuid: 'dashboard-uuid',
            actorRole: SpaceMemberRole.ADMIN,
            actorRoleResolver: expect.any(Function),
        });
        expect(auditLogger).toHaveBeenCalledTimes(5);
        expect(auditLogger).toHaveBeenCalledWith(
            expect.objectContaining({
                actor: expect.objectContaining({
                    type: 'service-account',
                    uuid: 'audit-service-account-uuid',
                }),
                context: { requestId: 'request-id' },
                resource: expect.objectContaining({
                    type: 'Dashboard',
                    organizationUuid: 'organization-uuid',
                    projectUuid: 'project-uuid',
                }),
            }),
        );
    });

    it('does not emit an audit event when the model rejects the write', async () => {
        const models = createModels();
        const auditLogger = vi.fn();
        vi.mocked(models.dashboard.upsertUserAccess).mockRejectedValue(
            new Error('write failed'),
        );
        const service = new DirectAccessService(
            models,
            createActorRoleResolver(),
            auditLogger,
        );

        await expect(
            service.upsertUserAccess({
                account,
                resource: {
                    type: 'dashboard',
                    uuid: 'dashboard-uuid',
                },
                userUuid: 'principal-uuid',
                role: SpaceMemberRole.VIEWER,
            }),
        ).rejects.toThrow('write failed');
        expect(auditLogger).not.toHaveBeenCalled();
    });

    it('rejects an account without a selected organization before authorization', async () => {
        const models = createModels();
        const actorRoleResolver = createActorRoleResolver();
        const service = new DirectAccessService(models, actorRoleResolver);
        const accountWithoutOrganization = {
            ...account,
            organization: {},
        } as RegisteredAccount;

        await expect(
            service.resetAccess({
                account: accountWithoutOrganization,
                resource: {
                    type: 'dashboard',
                    uuid: 'dashboard-uuid',
                },
            }),
        ).rejects.toMatchObject({ name: 'ForbiddenError' });
        expect(actorRoleResolver).not.toHaveBeenCalled();
        expect(models.dashboard.resetAccess).not.toHaveBeenCalled();
    });
});
