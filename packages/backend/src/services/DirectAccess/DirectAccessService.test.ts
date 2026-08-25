import { SpaceMemberRole, type RegisteredAccount } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import { type DirectAccessModel } from '../../models/directAccessModelUtils';
import { type DirectAccessFeatureGate } from './DirectAccessFeatureGate';
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

const user = {
    userUuid: 'persisted-user-uuid',
    organizationUuid: 'organization-uuid',
    role: 'admin',
    serviceAccount: {
        uuid: 'audit-service-account-uuid',
        description: 'Test service account',
    },
    requestContext: { requestId: 'request-id' },
} as unknown as Parameters<DirectAccessService['assertEnabled']>[0];

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

const resourceTypes: DirectAccessResourceType[] = [
    'dashboard',
    'savedChart',
    'savedSql',
    'app',
];

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

const createFeatureGate = (isEnabled: boolean): DirectAccessFeatureGate =>
    ({
        isEnabled: vi.fn().mockResolvedValue(isEnabled),
        isEnabledForUser: vi.fn().mockResolvedValue(isEnabled),
        assertEnabled: isEnabled
            ? vi.fn().mockResolvedValue(undefined)
            : vi.fn().mockRejectedValue(new Error('Direct access unavailable')),
    }) as unknown as DirectAccessFeatureGate;

describe('DirectAccessService', () => {
    it('uses the existing session user for mutations', async () => {
        const models = createModels();
        const actorRoleResolver = createActorRoleResolver();
        const featureGate = createFeatureGate(true);
        const service = new DirectAccessService({
            models,
            actorRoleResolver,
            featureGate,
        });

        await service.upsertUserAccess({
            user,
            resource: { type: 'dashboard', uuid: 'dashboard-uuid' },
            userUuid: 'principal-uuid',
            role: SpaceMemberRole.VIEWER,
        });

        expect(featureGate.isEnabledForUser).toHaveBeenCalledWith({
            userUuid: 'persisted-user-uuid',
            organizationUuid: 'organization-uuid',
        });
        expect(actorRoleResolver).toHaveBeenCalledWith({
            actorUserUuid: 'persisted-user-uuid',
            organizationUuid: 'organization-uuid',
            phase: 'preflight',
            resource: { type: 'dashboard', uuid: 'dashboard-uuid' },
        });
        expect(models.dashboard.upsertUserAccess).toHaveBeenCalledWith(
            expect.objectContaining({
                grantedByUserUuid: 'persisted-user-uuid',
                organizationUuid: 'organization-uuid',
            }),
        );
    });

    it('issues zero direct-model reads while the feature is unavailable', async () => {
        const models = createModels();
        const service = new DirectAccessService({
            models,
            actorRoleResolver: createActorRoleResolver(),
            featureGate: createFeatureGate(false),
        });

        const results = await Promise.all(
            resourceTypes.flatMap((resourceType) => {
                const resourceUuid = `${resourceType}-uuid`;
                return [
                    service.resolveUserAccess({
                        account,
                        resourceType,
                        resources: {
                            [resourceUuid]: {
                                logicalRole: SpaceMemberRole.EDITOR,
                                capabilityCeiling: null,
                            },
                        },
                    }),
                    service.getUserAccess({
                        account,
                        resourceType,
                        resourceUuids: [resourceUuid],
                    }),
                ];
            }),
        );

        expect(results).toEqual(
            resourceTypes.flatMap((resourceType) => [
                { [`${resourceType}-uuid`]: SpaceMemberRole.EDITOR },
                {},
            ]),
        );
        for (const model of Object.values(models)) {
            expect(model.getUserAccess).not.toHaveBeenCalled();
        }
    });

    it('dispatches enabled reads and applies additive role resolution', async () => {
        const models = createModels();
        const service = new DirectAccessService({
            models,
            actorRoleResolver: createActorRoleResolver(),
            featureGate: createFeatureGate(true),
        });

        for (const resourceType of resourceTypes) {
            const resourceUuid = `${resourceType}-uuid`;
            vi.mocked(models[resourceType].getUserAccess).mockResolvedValue({
                [resourceUuid]: {
                    organizationUuid: 'organization-uuid',
                    projectUuid: 'project-uuid',
                    userRole: SpaceMemberRole.VIEWER,
                    groupRoles: [SpaceMemberRole.ADMIN],
                },
            });
        }

        await expect(
            Promise.all(
                resourceTypes.map((resourceType) => {
                    const resourceUuid = `${resourceType}-uuid`;
                    return service.resolveUserAccess({
                        account,
                        resourceType,
                        resources: {
                            [resourceUuid]: {
                                logicalRole: SpaceMemberRole.VIEWER,
                                capabilityCeiling: SpaceMemberRole.EDITOR,
                            },
                        },
                    });
                }),
            ),
        ).resolves.toEqual(
            resourceTypes.map((resourceType) => ({
                [`${resourceType}-uuid`]: SpaceMemberRole.EDITOR,
            })),
        );

        for (const resourceType of resourceTypes) {
            expect(models[resourceType].getUserAccess).toHaveBeenCalledWith(
                [`${resourceType}-uuid`],
                'persisted-user-uuid',
                { organizationUuid: 'organization-uuid' },
            );
        }
    });

    it('applies capability ceilings only while the feature is enabled', async () => {
        const resources = {
            'dashboard-uuid': {
                logicalRole: SpaceMemberRole.EDITOR,
                capabilityCeiling: null,
            },
        };

        const disabledService = new DirectAccessService({
            models: createModels(),
            actorRoleResolver: createActorRoleResolver(),
            featureGate: createFeatureGate(false),
        });
        await expect(
            disabledService.resolveUserAccess({
                account,
                resourceType: 'dashboard',
                resources,
            }),
        ).resolves.toEqual({ 'dashboard-uuid': SpaceMemberRole.EDITOR });

        const enabledModels = createModels();
        vi.mocked(enabledModels.dashboard.getUserAccess).mockResolvedValue({});
        const enabledService = new DirectAccessService({
            models: enabledModels,
            actorRoleResolver: createActorRoleResolver(),
            featureGate: createFeatureGate(true),
        });
        await expect(
            enabledService.resolveUserAccess({
                account,
                resourceType: 'dashboard',
                resources,
            }),
        ).resolves.toEqual({ 'dashboard-uuid': undefined });
    });

    it('discards a defense-in-depth read from another organization', async () => {
        const models = createModels();
        vi.mocked(models.dashboard.getUserAccess).mockResolvedValue({
            'dashboard-uuid': {
                organizationUuid: 'other-organization-uuid',
                projectUuid: 'other-project-uuid',
                userRole: SpaceMemberRole.ADMIN,
                groupRoles: [],
            },
        });
        const service = new DirectAccessService({
            models,
            actorRoleResolver: createActorRoleResolver(),
            featureGate: createFeatureGate(true),
        });

        await expect(
            service.resolveUserAccess({
                account,
                resourceType: 'dashboard',
                resources: {
                    'dashboard-uuid': {
                        logicalRole: SpaceMemberRole.VIEWER,
                        capabilityCeiling: SpaceMemberRole.ADMIN,
                    },
                },
            }),
        ).resolves.toEqual({
            'dashboard-uuid': SpaceMemberRole.VIEWER,
        });
    });

    it('fails closed before every write model', async () => {
        const models = createModels();
        const actorRoleResolver = createActorRoleResolver();
        const service = new DirectAccessService({
            models,
            actorRoleResolver,
            featureGate: createFeatureGate(false),
        });
        const operations = resourceTypes.flatMap((type) => {
            const mutation = {
                user,
                resource: { type, uuid: `${type}-uuid` },
            };
            return [
                service.upsertUserAccess({
                    ...mutation,
                    userUuid: 'principal-uuid',
                    role: SpaceMemberRole.VIEWER,
                }),
                service.upsertGroupAccess({
                    ...mutation,
                    groupUuid: 'group-uuid',
                    role: SpaceMemberRole.VIEWER,
                }),
                service.revokeUserAccess({
                    ...mutation,
                    userUuid: 'principal-uuid',
                }),
                service.revokeGroupAccess({
                    ...mutation,
                    groupUuid: 'group-uuid',
                }),
                service.resetAccess(mutation),
            ];
        });

        const results = await Promise.allSettled(operations);
        expect(results.every((result) => result.status === 'rejected')).toBe(
            true,
        );
        for (const model of Object.values(models)) {
            expect(model.upsertUserAccess).not.toHaveBeenCalled();
            expect(model.upsertGroupAccess).not.toHaveBeenCalled();
            expect(model.revokeUserAccess).not.toHaveBeenCalled();
            expect(model.revokeGroupAccess).not.toHaveBeenCalled();
            expect(model.resetAccess).not.toHaveBeenCalled();
        }
        expect(actorRoleResolver).not.toHaveBeenCalled();
    });

    it('routes writes with organization scope and resource audit identity', async () => {
        const models = createModels();
        const auditLogger = vi.fn();
        const actorRoleResolver = createActorRoleResolver();
        const service = new DirectAccessService({
            models,
            actorRoleResolver,
            featureGate: createFeatureGate(true),
            auditLogger,
        });

        await Promise.all(
            resourceTypes.map((type) =>
                service.upsertUserAccess({
                    user,
                    resource: { type, uuid: `${type}-uuid` },
                    userUuid: 'principal-uuid',
                    role: SpaceMemberRole.VIEWER,
                }),
            ),
        );

        for (const type of resourceTypes) {
            expect(models[type].upsertUserAccess).toHaveBeenCalledWith({
                resourceUuid: `${type}-uuid`,
                userUuid: 'principal-uuid',
                role: SpaceMemberRole.VIEWER,
                actorRole: SpaceMemberRole.ADMIN,
                actorRoleResolver: expect.any(Function),
                grantedByUserUuid: 'persisted-user-uuid',
                organizationUuid: 'organization-uuid',
            });
        }
        const [{ actorRoleResolver: resolveInsideTransaction }] = vi.mocked(
            models.dashboard.upsertUserAccess,
        ).mock.calls[0];
        await resolveInsideTransaction({
            transaction: {} as never,
            context: mutationResult,
        });
        expect(actorRoleResolver).toHaveBeenCalledTimes(5);
        expect(actorRoleResolver).toHaveBeenCalledWith({
            actorUserUuid: 'persisted-user-uuid',
            organizationUuid: 'organization-uuid',
            phase: 'preflight',
            resource: { type: 'dashboard', uuid: 'dashboard-uuid' },
        });
        expect(actorRoleResolver).toHaveBeenCalledWith({
            actorUserUuid: 'persisted-user-uuid',
            organizationUuid: 'organization-uuid',
            phase: 'transaction',
            transaction: {},
            context: mutationResult,
            resource: { type: 'dashboard', uuid: 'dashboard-uuid' },
        });
        expect(auditLogger).toHaveBeenCalledTimes(4);
        for (const [event] of auditLogger.mock.calls) {
            expect(event.actor).toMatchObject({
                type: 'service-account',
                uuid: 'audit-service-account-uuid',
                organizationUuid: 'organization-uuid',
            });
            expect(event.context).toEqual({ requestId: 'request-id' });
            expect(event.action).toBe('direct_access.grant');
            expect(event.resource).toMatchObject({
                organizationUuid: 'organization-uuid',
                projectUuid: 'project-uuid',
                metadata: expect.objectContaining({
                    principalType: 'user',
                    principalUuid: 'principal-uuid',
                    beforeRole: null,
                    afterRole: SpaceMemberRole.VIEWER,
                }),
            });
        }
        expect(
            auditLogger.mock.calls.map(([event]) => [
                event.resource.type,
                event.resource.metadata?.resourceUuid,
            ]),
        ).toEqual(
            expect.arrayContaining([
                ['Dashboard', 'dashboard-uuid'],
                ['SavedChart', 'savedChart-uuid'],
                ['SavedSql', 'savedSql-uuid'],
                ['App', 'app-uuid'],
            ]),
        );
    });

    it('forwards both authorization phases for every mutation operation', async () => {
        const models = createModels();
        const actorRoleResolver = createActorRoleResolver();
        const service = new DirectAccessService({
            models,
            actorRoleResolver,
            featureGate: createFeatureGate(true),
        });
        const mutation = {
            user,
            resource: {
                type: 'dashboard' as const,
                uuid: 'dashboard-uuid',
            },
        };

        await service.upsertUserAccess({
            ...mutation,
            userUuid: 'principal-uuid',
            role: SpaceMemberRole.VIEWER,
        });
        await service.upsertGroupAccess({
            ...mutation,
            groupUuid: 'group-uuid',
            role: SpaceMemberRole.EDITOR,
        });
        await service.revokeUserAccess({
            ...mutation,
            userUuid: 'principal-uuid',
        });
        await service.revokeGroupAccess({
            ...mutation,
            groupUuid: 'group-uuid',
        });
        await service.resetAccess(mutation);

        const authorization = {
            actorRole: SpaceMemberRole.ADMIN,
            actorRoleResolver: expect.any(Function),
            organizationUuid: 'organization-uuid',
        };
        expect(models.dashboard.upsertUserAccess).toHaveBeenCalledWith({
            ...authorization,
            resourceUuid: 'dashboard-uuid',
            userUuid: 'principal-uuid',
            role: SpaceMemberRole.VIEWER,
            grantedByUserUuid: 'persisted-user-uuid',
        });
        expect(models.dashboard.upsertGroupAccess).toHaveBeenCalledWith({
            ...authorization,
            resourceUuid: 'dashboard-uuid',
            groupUuid: 'group-uuid',
            role: SpaceMemberRole.EDITOR,
            grantedByUserUuid: 'persisted-user-uuid',
        });
        expect(models.dashboard.revokeUserAccess).toHaveBeenCalledWith({
            ...authorization,
            resourceUuid: 'dashboard-uuid',
            userUuid: 'principal-uuid',
            actorUserUuid: 'persisted-user-uuid',
        });
        expect(models.dashboard.revokeGroupAccess).toHaveBeenCalledWith({
            ...authorization,
            resourceUuid: 'dashboard-uuid',
            groupUuid: 'group-uuid',
        });
        expect(models.dashboard.resetAccess).toHaveBeenCalledWith({
            ...authorization,
            resourceUuid: 'dashboard-uuid',
        });
        expect(actorRoleResolver).toHaveBeenCalledTimes(5);
    });

    it('does not emit an audit event when the model rejects the write', async () => {
        const models = createModels();
        const auditLogger = vi.fn();
        vi.mocked(models.dashboard.upsertUserAccess).mockRejectedValue(
            new Error('write failed'),
        );
        const service = new DirectAccessService({
            models,
            actorRoleResolver: createActorRoleResolver(),
            featureGate: createFeatureGate(true),
            auditLogger,
        });

        await expect(
            service.upsertUserAccess({
                user,
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

    it('rejects a missing organization before the gate, resolver, or model', async () => {
        const models = createModels();
        const actorRoleResolver = createActorRoleResolver();
        const featureGate = createFeatureGate(true);
        const service = new DirectAccessService({
            models,
            actorRoleResolver,
            featureGate,
        });
        const accountWithoutOrganization = {
            ...account,
            organization: {},
        } as RegisteredAccount;
        const userWithoutOrganization = {
            ...user,
            organizationUuid: undefined,
        } as unknown as Parameters<DirectAccessService['assertEnabled']>[0];

        await expect(
            service.getUserAccess({
                account: accountWithoutOrganization,
                resourceType: 'dashboard',
                resourceUuids: ['dashboard-uuid'],
            }),
        ).rejects.toMatchObject({ name: 'ForbiddenError' });
        await expect(
            service.resetAccess({
                user: userWithoutOrganization,
                resource: { type: 'dashboard', uuid: 'dashboard-uuid' },
            }),
        ).rejects.toMatchObject({ name: 'ForbiddenError' });
        expect(featureGate.isEnabled).not.toHaveBeenCalled();
        expect(featureGate.assertEnabled).not.toHaveBeenCalled();
        expect(actorRoleResolver).not.toHaveBeenCalled();
        expect(models.dashboard.getUserAccess).not.toHaveBeenCalled();
        expect(models.dashboard.resetAccess).not.toHaveBeenCalled();
    });
});
