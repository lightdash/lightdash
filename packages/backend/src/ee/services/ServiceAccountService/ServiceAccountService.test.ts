import { Ability, AbilityBuilder } from '@casl/ability';
import {
    AlreadyExistsError,
    AnyType,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    ProjectMemberRole,
    ServiceAccountScope,
    type MemberAbility,
    type SessionUser,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../../config/parseConfig';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { CommercialFeatureFlagModel } from '../../models/CommercialFeatureFlagModel';
import { ServiceAccountModel } from '../../models/ServiceAccountModel';
import { ServiceAccountService } from './ServiceAccountService';

const ORG = 'org-1';
const PROJ_A = 'proj-a';
const PROJ_B = 'proj-b';
const CUSTOM_ROLE = 'custom-role-1';

const adminUser = (): SessionUser => {
    const { build, can } = new AbilityBuilder<MemberAbility>(Ability);
    can('manage', 'Organization', { organizationUuid: ORG });
    return {
        userUuid: 'admin-user',
        organizationUuid: ORG,
        ability: build(),
    } as AnyType;
};

type Mocks = {
    serviceAccountModel: jest.Mocked<ServiceAccountModel>;
    projectModel: jest.Mocked<ProjectModel>;
    analytics: jest.Mocked<LightdashAnalytics>;
    commercialFeatureFlagModel: jest.Mocked<CommercialFeatureFlagModel>;
    lightdashConfig: LightdashConfig;
};

const buildMocks = (): Mocks => ({
    serviceAccountModel: {
        create: jest.fn(),
        delete: jest.fn().mockResolvedValue(undefined),
        getTokenbyUuid: jest.fn(),
        update: jest.fn(),
    } as AnyType,
    projectModel: {
        createServiceAccountProjectAccess: jest.fn(),
        findInvalidCustomRoleUuids: jest.fn().mockResolvedValue([]),
        getProjectAccessCountsByServiceAccountUserUuids: jest
            .fn()
            .mockResolvedValue(new Map<string, number>()),
        setServiceAccountProjectAccess: jest.fn().mockResolvedValue(undefined),
    } as AnyType,
    analytics: { track: jest.fn() } as AnyType,
    commercialFeatureFlagModel: {} as AnyType,
    lightdashConfig: { license: { licenseKey: 'test' } } as AnyType,
});

const buildService = (mocks: Mocks) =>
    new ServiceAccountService({
        analytics: mocks.analytics,
        commercialFeatureFlagModel: mocks.commercialFeatureFlagModel,
        lightdashConfig: mocks.lightdashConfig,
        projectModel: mocks.projectModel,
        serviceAccountModel: mocks.serviceAccountModel,
    });

const baseCreateArgs = (overrides: AnyType = {}) => ({
    user: adminUser(),
    tokenDetails: {
        organizationUuid: ORG,
        expiresAt: null,
        description: 'test',
        scopes: [ServiceAccountScope.SYSTEM_MEMBER],
        ...overrides,
    },
});

describe('ServiceAccountService.create with projectAccess', () => {
    describe('validation (no SA insert)', () => {
        it.each([
            [
                'non-member scope',
                {
                    scopes: [ServiceAccountScope.ORG_ADMIN],
                    projectAccess: [
                        { projectUuid: PROJ_A, role: ProjectMemberRole.VIEWER },
                    ],
                },
            ],
            [
                'mixed scopes including member',
                {
                    scopes: [
                        ServiceAccountScope.SYSTEM_MEMBER,
                        ServiceAccountScope.SCIM_MANAGE,
                    ],
                    projectAccess: [
                        { projectUuid: PROJ_A, role: ProjectMemberRole.VIEWER },
                    ],
                },
            ],
        ])('rejects projectAccess with %s', async (_label, overrides) => {
            const mocks = buildMocks();
            const service = buildService(mocks);
            await expect(
                service.create(baseCreateArgs(overrides)),
            ).rejects.toBeInstanceOf(ParameterError);
            // Critical invariant: invalid request never touches the model.
            expect(mocks.serviceAccountModel.create).not.toHaveBeenCalled();
            expect(
                mocks.projectModel.createServiceAccountProjectAccess,
            ).not.toHaveBeenCalled();
        });

        it.each([
            [
                'both role and roleUuid',
                {
                    projectUuid: PROJ_A,
                    role: ProjectMemberRole.VIEWER,
                    roleUuid: CUSTOM_ROLE,
                },
            ],
            ['neither role nor roleUuid', { projectUuid: PROJ_A }],
        ])('rejects grant with %s', async (_label, grant) => {
            const mocks = buildMocks();
            const service = buildService(mocks);
            await expect(
                service.create(
                    baseCreateArgs({ projectAccess: [grant as AnyType] }),
                ),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(mocks.serviceAccountModel.create).not.toHaveBeenCalled();
        });

        it('bulk-validates custom roleUuids before SA insert', async () => {
            const mocks = buildMocks();
            mocks.projectModel.findInvalidCustomRoleUuids.mockResolvedValue([
                CUSTOM_ROLE,
            ]);
            const service = buildService(mocks);
            await expect(
                service.create(
                    baseCreateArgs({
                        projectAccess: [
                            { projectUuid: PROJ_A, roleUuid: CUSTOM_ROLE },
                        ],
                    }),
                ),
            ).rejects.toThrow(/Unknown role uuid.*custom-role-1/);
            // One bulk query for the whole batch, not per-grant.
            expect(
                mocks.projectModel.findInvalidCustomRoleUuids,
            ).toHaveBeenCalledTimes(1);
            expect(
                mocks.projectModel.findInvalidCustomRoleUuids,
            ).toHaveBeenCalledWith([CUSTOM_ROLE], ORG);
            expect(mocks.serviceAccountModel.create).not.toHaveBeenCalled();
        });
    });

    describe('happy path', () => {
        it('creates SA, then inserts every grant, then tracks analytics', async () => {
            const mocks = buildMocks();
            mocks.serviceAccountModel.create.mockResolvedValue({
                uuid: 'sa-new',
            } as AnyType);
            const service = buildService(mocks);
            await service.create(
                baseCreateArgs({
                    projectAccess: [
                        { projectUuid: PROJ_A, role: ProjectMemberRole.VIEWER },
                        { projectUuid: PROJ_B, roleUuid: CUSTOM_ROLE },
                    ],
                }),
            );
            expect(mocks.serviceAccountModel.create).toHaveBeenCalledTimes(1);
            expect(
                mocks.projectModel.createServiceAccountProjectAccess,
            ).toHaveBeenCalledTimes(2);
            expect(
                mocks.projectModel.createServiceAccountProjectAccess.mock
                    .calls[0],
            ).toEqual([
                PROJ_A,
                'sa-new',
                { role: ProjectMemberRole.VIEWER, roleUuid: undefined },
            ]);
            expect(
                mocks.projectModel.createServiceAccountProjectAccess.mock
                    .calls[1],
            ).toEqual([
                PROJ_B,
                'sa-new',
                { role: undefined, roleUuid: CUSTOM_ROLE },
            ]);
            expect(mocks.serviceAccountModel.delete).not.toHaveBeenCalled();
            expect(mocks.analytics.track).toHaveBeenCalledTimes(1);
        });
    });

    describe('compensating rollback', () => {
        it('deletes SA + rethrows original error when a grant insert fails mid-loop', async () => {
            const mocks = buildMocks();
            mocks.serviceAccountModel.create.mockResolvedValue({
                uuid: 'sa-new',
            } as AnyType);
            const failure = new NotFoundError('project not found');
            mocks.projectModel.createServiceAccountProjectAccess
                .mockResolvedValueOnce(undefined) // first grant ok
                .mockRejectedValueOnce(failure); // second grant fails

            const service = buildService(mocks);

            await expect(
                service.create(
                    baseCreateArgs({
                        projectAccess: [
                            {
                                projectUuid: PROJ_A,
                                role: ProjectMemberRole.VIEWER,
                            },
                            {
                                projectUuid: PROJ_B,
                                role: ProjectMemberRole.EDITOR,
                            },
                        ],
                    }),
                ),
            ).rejects.toBe(failure); // exact reference, not a rewrapped 500.

            // SA was created, then cleaned up.
            expect(mocks.serviceAccountModel.create).toHaveBeenCalledTimes(1);
            expect(mocks.serviceAccountModel.delete).toHaveBeenCalledWith(
                'sa-new',
            );
            // No analytics event for failed creates.
            expect(mocks.analytics.track).not.toHaveBeenCalled();
        });

        it('logs orphan when cleanup itself fails but still rejects with the grant error', async () => {
            const mocks = buildMocks();
            mocks.serviceAccountModel.create.mockResolvedValue({
                uuid: 'sa-orphan',
            } as AnyType);
            const grantError = new AlreadyExistsError('dup grant');
            mocks.projectModel.createServiceAccountProjectAccess.mockRejectedValue(
                grantError,
            );
            const cleanupError = new Error('db gone');
            mocks.serviceAccountModel.delete.mockRejectedValue(cleanupError);

            const service = buildService(mocks);
            const loggerError = jest.fn();
            (service as AnyType).logger = {
                error: loggerError,
                info: jest.fn(),
                warn: jest.fn(),
                debug: jest.fn(),
            };

            await expect(
                service.create(
                    baseCreateArgs({
                        projectAccess: [
                            {
                                projectUuid: PROJ_A,
                                role: ProjectMemberRole.VIEWER,
                            },
                        ],
                    }),
                ),
            ).rejects.toBe(grantError);

            expect(mocks.serviceAccountModel.delete).toHaveBeenCalledWith(
                'sa-orphan',
            );
            expect(loggerError).toHaveBeenCalledWith(
                expect.stringMatching(/orphan/i),
                expect.objectContaining({
                    serviceAccountUuid: 'sa-orphan',
                    grantError,
                    cleanupError,
                }),
            );
        });
    });

    describe('permission gate', () => {
        it('rejects non-org-admin before any model call', async () => {
            const mocks = buildMocks();
            const builder = new AbilityBuilder<MemberAbility>(Ability);
            // Note: no `can(...)` — caller has no abilities at all.
            const nobody = {
                userUuid: 'nobody',
                organizationUuid: ORG,
                ability: builder.build(),
            } as AnyType;
            const service = buildService(mocks);
            await expect(
                service.create({
                    user: nobody,
                    tokenDetails: {
                        organizationUuid: ORG,
                        expiresAt: null,
                        description: 'nope',
                        scopes: [ServiceAccountScope.SYSTEM_MEMBER],
                    },
                }),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(mocks.serviceAccountModel.create).not.toHaveBeenCalled();
        });
    });
});

describe('ServiceAccountService.update', () => {
    const nobodyUser = (): SessionUser => {
        const builder = new AbilityBuilder<MemberAbility>(Ability);
        return {
            userUuid: 'nobody',
            organizationUuid: ORG,
            ability: builder.build(),
        } as AnyType;
    };

    it('rejects non-org-admin before any model call', async () => {
        const mocks = buildMocks();
        const service = buildService(mocks);
        await expect(
            service.update({
                user: nobodyUser(),
                tokenUuid: 'sa-1',
                update: { description: 'new name' },
            }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(mocks.serviceAccountModel.getTokenbyUuid).not.toHaveBeenCalled();
        expect(mocks.serviceAccountModel.update).not.toHaveBeenCalled();
    });

    it.each([
        ['empty', ''],
        ['whitespace', '   '],
    ])(
        'rejects %s description before touching the model',
        async (_label, description) => {
            const mocks = buildMocks();
            const service = buildService(mocks);
            await expect(
                service.update({
                    user: adminUser(),
                    tokenUuid: 'sa-1',
                    update: { description },
                }),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(mocks.serviceAccountModel.update).not.toHaveBeenCalled();
        },
    );

    it('throws NotFound when the SA does not exist', async () => {
        const mocks = buildMocks();
        mocks.serviceAccountModel.getTokenbyUuid.mockResolvedValue(undefined);
        const service = buildService(mocks);
        await expect(
            service.update({
                user: adminUser(),
                tokenUuid: 'sa-missing',
                update: { description: 'new name' },
            }),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(mocks.serviceAccountModel.update).not.toHaveBeenCalled();
    });

    it('throws Forbidden when the SA belongs to another org', async () => {
        const mocks = buildMocks();
        mocks.serviceAccountModel.getTokenbyUuid.mockResolvedValue({
            uuid: 'sa-1',
            organizationUuid: 'other-org',
        } as AnyType);
        const service = buildService(mocks);
        await expect(
            service.update({
                user: adminUser(),
                tokenUuid: 'sa-1',
                update: { description: 'new name' },
            }),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(mocks.serviceAccountModel.update).not.toHaveBeenCalled();
    });

    // An org-scoped SA carries a non-member scope; a project-scoped SA carries
    // system:member. The two helpers build the matching getTokenbyUuid mock.
    const orgScopedToken = (overrides: AnyType = {}) => ({
        uuid: 'sa-1',
        organizationUuid: ORG,
        userUuid: 'sa-user-1',
        scopes: [ServiceAccountScope.SYSTEM_VIEWER],
        ...overrides,
    });
    const projectScopedToken = (overrides: AnyType = {}) => ({
        uuid: 'sa-1',
        organizationUuid: ORG,
        userUuid: 'sa-user-1',
        scopes: [ServiceAccountScope.SYSTEM_MEMBER],
        ...overrides,
    });

    it('updates an org-scoped SA then tracks analytics without sensitive values', async () => {
        const mocks = buildMocks();
        mocks.serviceAccountModel.getTokenbyUuid.mockResolvedValue(
            orgScopedToken() as AnyType,
        );
        mocks.serviceAccountModel.update.mockResolvedValue({
            uuid: 'sa-1',
            description: 'new name',
        } as AnyType);
        const service = buildService(mocks);

        const result = await service.update({
            user: adminUser(),
            tokenUuid: 'sa-1',
            update: {
                description: 'new name',
                scopes: [ServiceAccountScope.SYSTEM_ADMIN],
            },
        });

        expect(result).toEqual({ uuid: 'sa-1', description: 'new name' });
        expect(mocks.serviceAccountModel.update).toHaveBeenCalledWith({
            serviceAccountUuid: 'sa-1',
            data: {
                description: 'new name',
                scopes: [ServiceAccountScope.SYSTEM_ADMIN],
                roleUuid: undefined,
            },
        });
        expect(
            mocks.projectModel.setServiceAccountProjectAccess,
        ).not.toHaveBeenCalled();
        expect(mocks.analytics.track).toHaveBeenCalledTimes(1);
        const tracked = mocks.analytics.track.mock.calls[0][0];
        expect(tracked.event).toBe('scim_access_token.updated');
        expect(tracked.properties).toEqual({ organizationId: ORG });
    });

    it('rejects projectAccess on an org-scoped SA', async () => {
        const mocks = buildMocks();
        mocks.serviceAccountModel.getTokenbyUuid.mockResolvedValue(
            orgScopedToken() as AnyType,
        );
        const service = buildService(mocks);

        await expect(
            service.update({
                user: adminUser(),
                tokenUuid: 'sa-1',
                update: {
                    description: 'name',
                    projectAccess: [
                        { projectUuid: PROJ_A, role: ProjectMemberRole.VIEWER },
                    ],
                },
            }),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(mocks.serviceAccountModel.update).not.toHaveBeenCalled();
    });

    it('rejects setting system:member on an org-scoped SA', async () => {
        const mocks = buildMocks();
        mocks.serviceAccountModel.getTokenbyUuid.mockResolvedValue(
            orgScopedToken() as AnyType,
        );
        const service = buildService(mocks);

        await expect(
            service.update({
                user: adminUser(),
                tokenUuid: 'sa-1',
                update: {
                    description: 'name',
                    scopes: [ServiceAccountScope.SYSTEM_MEMBER],
                },
            }),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(mocks.serviceAccountModel.update).not.toHaveBeenCalled();
    });

    it('replaces project grants on a project-scoped SA', async () => {
        const mocks = buildMocks();
        mocks.serviceAccountModel.getTokenbyUuid.mockResolvedValue(
            projectScopedToken() as AnyType,
        );
        mocks.serviceAccountModel.update.mockResolvedValue({
            uuid: 'sa-1',
            description: 'renamed',
        } as AnyType);
        const service = buildService(mocks);

        await service.update({
            user: adminUser(),
            tokenUuid: 'sa-1',
            update: {
                description: 'renamed',
                scopes: [ServiceAccountScope.SYSTEM_MEMBER],
                projectAccess: [
                    { projectUuid: PROJ_A, role: ProjectMemberRole.EDITOR },
                    { projectUuid: PROJ_B, roleUuid: CUSTOM_ROLE },
                ],
            },
        });

        // Name updated via the SA model (scopes left as system:member),
        // grants replaced wholesale via the project model.
        expect(mocks.serviceAccountModel.update).toHaveBeenCalledWith({
            serviceAccountUuid: 'sa-1',
            data: { description: 'renamed' },
        });
        expect(
            mocks.projectModel.setServiceAccountProjectAccess,
        ).toHaveBeenCalledWith('sa-1', [
            { projectUuid: PROJ_A, role: ProjectMemberRole.EDITOR },
            { projectUuid: PROJ_B, roleUuid: CUSTOM_ROLE },
        ]);
        expect(mocks.analytics.track).toHaveBeenCalledTimes(1);
    });

    it('rejects emptying all project access on a project-scoped SA', async () => {
        const mocks = buildMocks();
        mocks.serviceAccountModel.getTokenbyUuid.mockResolvedValue(
            projectScopedToken() as AnyType,
        );
        const service = buildService(mocks);

        await expect(
            service.update({
                user: adminUser(),
                tokenUuid: 'sa-1',
                update: { description: 'name', projectAccess: [] },
            }),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(
            mocks.projectModel.setServiceAccountProjectAccess,
        ).not.toHaveBeenCalled();
    });

    it('rejects assigning an org role to a project-scoped SA', async () => {
        const mocks = buildMocks();
        mocks.serviceAccountModel.getTokenbyUuid.mockResolvedValue(
            projectScopedToken() as AnyType,
        );
        const service = buildService(mocks);

        await expect(
            service.update({
                user: adminUser(),
                tokenUuid: 'sa-1',
                update: {
                    description: 'name',
                    scopes: [ServiceAccountScope.SYSTEM_ADMIN],
                },
            }),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(mocks.serviceAccountModel.update).not.toHaveBeenCalled();
    });

    it('allows a rename-only edit of a project-scoped SA (grants untouched)', async () => {
        const mocks = buildMocks();
        mocks.serviceAccountModel.getTokenbyUuid.mockResolvedValue(
            projectScopedToken() as AnyType,
        );
        mocks.serviceAccountModel.update.mockResolvedValue({
            uuid: 'sa-1',
            description: 'renamed',
        } as AnyType);
        const service = buildService(mocks);

        await service.update({
            user: adminUser(),
            tokenUuid: 'sa-1',
            update: { description: 'renamed' },
        });

        expect(mocks.serviceAccountModel.update).toHaveBeenCalledWith({
            serviceAccountUuid: 'sa-1',
            data: { description: 'renamed' },
        });
        // No projectAccess in the payload → grants left as-is.
        expect(
            mocks.projectModel.setServiceAccountProjectAccess,
        ).not.toHaveBeenCalled();
    });
});
