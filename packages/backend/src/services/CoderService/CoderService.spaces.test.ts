import { Ability, type RawRuleOf } from '@casl/ability';
import {
    Account,
    AnyType,
    ContentAsCodeType,
    ForbiddenError,
    OrganizationMemberRole,
    ParameterError,
    PossibleAbilities,
    ProjectType,
    SessionUser,
    SpaceAsCode,
    SpaceAsCodeAction,
    SpaceMemberRole,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { fromSession } from '../../auth/account';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { CoderService } from './CoderService';

const PROJECT_UUID = 'project-uuid';
const ORGANIZATION_UUID = 'organization-uuid';
const USER_UUID = 'user-uuid';
const SPACE_UUID = 'space-uuid';

const project = {
    projectUuid: PROJECT_UUID,
    organizationUuid: ORGANIZATION_UUID,
    upstreamProjectUuid: null,
    type: ProjectType.DEFAULT,
    createdByUserUuid: USER_UUID,
};

const makeSessionUser = (
    rules: RawRuleOf<Ability<PossibleAbilities>>[] = [
        {
            subject: 'ContentAsCode',
            action: ['view', 'create'],
            conditions: { projectUuid: PROJECT_UUID },
        },
        {
            subject: 'Space',
            action: ['create', 'manage'],
            conditions: { projectUuid: PROJECT_UUID },
        },
    ],
    email: string | undefined = 'owner@example.com',
    isActive = true,
): SessionUser =>
    ({
        userUuid: USER_UUID,
        userId: 1,
        email,
        firstName: 'Space',
        lastName: 'Owner',
        organizationUuid: ORGANIZATION_UUID,
        role: OrganizationMemberRole.MEMBER,
        isActive,
        ability: new Ability<PossibleAbilities>(rules),
        abilityRules: [],
    }) as unknown as SessionUser;

const makeUser = (
    rules?: RawRuleOf<Ability<PossibleAbilities>>[],
    email?: string,
): Account => fromSession(makeSessionUser(rules, email));

const rootSpace = {
    organizationUuid: ORGANIZATION_UUID,
    projectUuid: PROJECT_UUID,
    uuid: SPACE_UUID,
    name: 'Finance',
    slug: 'finance',
    path: 'finance',
    parentSpaceUuid: null,
    inheritParentPermissions: false,
    projectMemberAccessRole: null,
    isDefaultUserSpace: false,
};

const spaceAsCode = (overrides: Partial<SpaceAsCode> = {}): SpaceAsCode => ({
    contentType: ContentAsCodeType.SPACE,
    version: 1,
    spaceName: 'Finance',
    slug: 'finance',
    access: {
        inheritParentPermissions: false,
        projectMemberAccessRole: null,
        users: [
            {
                email: 'owner@example.com',
                role: SpaceMemberRole.ADMIN,
            },
        ],
        groups: [],
    },
    ...overrides,
});

const buildService = ({
    spaces = [rootSpace],
    accessibleSpaceUuids = [SPACE_UUID],
    rawAccess = {
        [SPACE_UUID]: {
            users: [
                {
                    userUuid: USER_UUID,
                    email: 'owner@example.com',
                    isInternal: false,
                    role: SpaceMemberRole.ADMIN,
                },
            ],
            groups: [],
        },
    },
    groups = [],
    canManage = true,
    canResults,
    hasProjectMembership = false,
    resolvedUserAccess,
    refreshedUser = makeSessionUser(),
}: {
    spaces?: AnyType[];
    accessibleSpaceUuids?: string[];
    rawAccess?: Record<string, AnyType>;
    groups?: AnyType[];
    canManage?: boolean;
    canResults?: boolean[];
    hasProjectMembership?: boolean;
    resolvedUserAccess?: Array<{
        userUuid: string;
        role: SpaceMemberRole;
    }>;
    refreshedUser?: SessionUser;
} = {}) => {
    const mutableSpaces = [...spaces];
    const transaction = {} as AnyType;
    const projectModel = {
        get: vi.fn(async () => project),
        getSummary: vi.fn(async () => project),
        hasProjectMembership: vi.fn(async () => hasProjectMembership),
    };
    const spaceModel = {
        getSpacesByProjectUuid: vi.fn(async () => mutableSpaces),
        findByProjectAndPath: vi.fn(
            async (_projectUuid: string, path: string) =>
                mutableSpaces.filter((space) => space.path === path),
        ),
        applySpaceAsCode: vi.fn(async (input, options) => {
            const transactionallyResolvedUserAccess =
                resolvedUserAccess ??
                input.access?.users.map(
                    ({ role }: { role: SpaceMemberRole }) => ({
                        userUuid: USER_UUID,
                        role,
                    }),
                ) ??
                [];
            await options?.beforeMutation?.(transaction, {
                userAccess: transactionallyResolvedUserAccess,
            });
            if (input.spaceUuid !== null) return rootSpace;

            const createdSpace = {
                ...rootSpace,
                uuid: `created-${input.path}`,
                name: input.name,
                slug: input.path.slice(input.path.lastIndexOf('.') + 1),
                path: input.path,
                parentSpaceUuid: input.parentSpaceUuid,
                inheritParentPermissions:
                    input.access?.inheritParentPermissions ??
                    input.inheritParentPermissionsOnCreate,
            };
            mutableSpaces.push(createdSpace);
            return createdSpace;
        }),
    };
    const spacePermissionService = {
        getAccessibleSpaceUuids: vi.fn(async () => accessibleSpaceUuids),
        getRawDirectAccess: vi.fn(async () => rawAccess),
        can: vi.fn(async () => canResults?.shift() ?? canManage),
        getSpaceAccessContext: vi.fn(async () => ({
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: PROJECT_UUID,
            inheritsFromOrgOrProject: false,
            access: [],
            admins: [],
        })),
    };
    const userModel = {
        findSessionUserAndOrgByUuid: vi.fn(async () => refreshedUser),
    };
    const service = new CoderService({
        lightdashConfig: lightdashConfigMock,
        analytics: analyticsMock,
        projectModel: projectModel as AnyType,
        savedChartModel: {} as AnyType,
        savedSqlModel: {} as AnyType,
        dashboardModel: {} as AnyType,
        spaceModel: spaceModel as AnyType,
        schedulerModel: {} as AnyType,
        schedulerService: {} as AnyType,
        savedChartService: {} as AnyType,
        dashboardService: {} as AnyType,
        schedulerClient: {} as AnyType,
        promoteService: {} as AnyType,
        spacePermissionService: spacePermissionService as AnyType,
        contentVerificationModel: {} as AnyType,
        groupsModel: {
            find: vi.fn(async ({ name }) => ({
                data: groups.filter((group) => group.name === name),
                pagination: {},
            })),
            findUserInGroups: vi.fn(async () => []),
        } as AnyType,
        organizationMemberProfileModel: {
            findOrganizationMembersByEmails: vi.fn(async () => [
                {
                    userUuid: USER_UUID,
                    email: 'owner@example.com',
                },
            ]),
        } as AnyType,
        userModel: userModel as AnyType,
    });
    return {
        service,
        projectModel,
        spaceModel,
        spacePermissionService,
        userModel,
        transaction,
    };
};

describe('CoderService spaces as code', () => {
    test('exports accessible empty spaces with deterministic direct access', async () => {
        const { service } = buildService();

        await expect(
            service.getSpaces(makeUser(), PROJECT_UUID),
        ).resolves.toEqual({
            spaces: [spaceAsCode()],
            skipped: [],
        });
    });

    test('excludes personal spaces and reports children with inaccessible ancestors', async () => {
        const child = {
            ...rootSpace,
            uuid: 'child-uuid',
            name: 'Child',
            slug: 'child',
            path: 'private_parent.child',
            parentSpaceUuid: 'private-parent-uuid',
        };
        const privateParent = {
            ...rootSpace,
            uuid: 'private-parent-uuid',
            path: 'private_parent',
        };
        const personal = {
            ...rootSpace,
            uuid: 'personal-uuid',
            path: 'personal',
            isDefaultUserSpace: true,
        };
        const { service } = buildService({
            spaces: [privateParent, child, personal],
            accessibleSpaceUuids: [child.uuid, personal.uuid],
            rawAccess: {},
        });

        await expect(
            service.getSpaces(makeUser(), PROJECT_UUID),
        ).resolves.toEqual({
            spaces: [],
            skipped: [
                {
                    slug: 'private-parent/child',
                    reason: 'An ancestor space is not accessible for portable export',
                },
            ],
        });
    });

    test('exports metadata-only spaces with nonportable access and keeps descendants', async () => {
        const child = {
            ...rootSpace,
            uuid: 'child-uuid',
            name: 'Child',
            path: 'finance.child',
            parentSpaceUuid: SPACE_UUID,
        };
        const { service, spaceModel } = buildService({
            spaces: [rootSpace, child],
            accessibleSpaceUuids: [SPACE_UUID, child.uuid],
            rawAccess: {
                [SPACE_UUID]: {
                    users: [
                        {
                            userUuid: 'service-account-uuid',
                            email: null,
                            isInternal: true,
                            role: SpaceMemberRole.ADMIN,
                        },
                    ],
                    groups: [],
                },
                [child.uuid]: { users: [], groups: [] },
            },
        });

        const result = await service.getSpaces(makeUser(), PROJECT_UUID);
        expect(result).toEqual({
            spaces: [
                {
                    contentType: ContentAsCodeType.SPACE,
                    spaceName: 'Finance',
                    slug: 'finance',
                },
                {
                    contentType: ContentAsCodeType.SPACE,
                    version: 1,
                    spaceName: 'Child',
                    slug: 'finance/child',
                    access: {
                        inheritParentPermissions: false,
                        projectMemberAccessRole: null,
                        users: [],
                        groups: [],
                    },
                },
            ],
            skipped: [
                {
                    slug: 'finance',
                    reason: 'Direct access contains a user without a portable organization identity',
                },
            ],
        });
        await expect(
            service.upsertSpace(makeUser(), PROJECT_UUID, result.spaces[0]),
        ).resolves.toEqual({ action: SpaceAsCodeAction.NO_CHANGES });
        expect(spaceModel.applySpaceAsCode).not.toHaveBeenCalled();
    });

    test('returns no changes without writing when normalized direct state matches', async () => {
        const { service, spaceModel } = buildService();

        await expect(
            service.upsertSpace(makeUser(), PROJECT_UUID, spaceAsCode()),
        ).resolves.toEqual({ action: SpaceAsCodeAction.NO_CHANGES });
        expect(spaceModel.applySpaceAsCode).not.toHaveBeenCalled();
    });

    test('legacy metadata-only files update names without replacing access', async () => {
        const { service, spaceModel } = buildService();
        const legacy: SpaceAsCode = {
            contentType: ContentAsCodeType.SPACE,
            spaceName: 'Renamed finance',
            slug: 'finance',
        };

        await expect(
            service.upsertSpace(makeUser(), PROJECT_UUID, legacy),
        ).resolves.toEqual({ action: SpaceAsCodeAction.UPDATE });
        expect(spaceModel.applySpaceAsCode).toHaveBeenCalledWith(
            expect.not.objectContaining({ access: expect.anything() }),
            { beforeMutation: expect.any(Function) },
        );
    });

    test('rejects access without version and unknown properties before lookup', async () => {
        const { service, spaceModel } = buildService();
        const withoutVersion = {
            ...spaceAsCode(),
            version: undefined,
        } as SpaceAsCode;
        await expect(
            service.upsertSpace(makeUser(), PROJECT_UUID, withoutVersion),
        ).rejects.toThrow('Space access requires space schema version 1');

        await expect(
            service.upsertSpace(makeUser(), PROJECT_UUID, {
                ...spaceAsCode(),
                unexpected: true,
            } as SpaceAsCode),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(spaceModel.findByProjectAndPath).not.toHaveBeenCalled();
    });

    test('rejects duplicate database paths and unauthorized existing spaces', async () => {
        const duplicate = { ...rootSpace, uuid: 'duplicate-uuid' };
        const duplicateService = buildService({
            spaces: [rootSpace, duplicate],
        }).service;
        await expect(
            duplicateService.upsertSpace(
                makeUser(),
                PROJECT_UUID,
                spaceAsCode(),
            ),
        ).rejects.toThrow('Multiple spaces use hierarchy path');

        const unauthorized = buildService({ canManage: false });
        await expect(
            unauthorized.service.upsertSpace(
                makeUser(),
                PROJECT_UUID,
                spaceAsCode({ spaceName: 'Renamed' }),
            ),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(unauthorized.spaceModel.applySpaceAsCode).not.toHaveBeenCalled();
    });

    test('manage ContentAsCode does not bypass manage Space on an existing restricted space', async () => {
        const contentManager = makeUser([
            { subject: 'ContentAsCode', action: 'manage' },
        ]);
        const { service, spaceModel } = buildService({ canManage: false });

        await expect(
            service.upsertSpace(
                contentManager,
                PROJECT_UUID,
                spaceAsCode({ spaceName: 'Renamed finance' }),
            ),
        ).rejects.toThrow(
            'You don\'t have permission to manage space "finance"',
        );
        expect(spaceModel.applySpaceAsCode).not.toHaveBeenCalled();
    });

    test('manage ContentAsCode does not bypass create Space for a missing space', async () => {
        const contentManager = makeUser([
            { subject: 'ContentAsCode', action: 'manage' },
        ]);
        const { service, spaceModel } = buildService({ spaces: [] });

        await expect(
            service.upsertSpace(
                contentManager,
                PROJECT_UUID,
                spaceAsCode({ slug: 'new-space' }),
            ),
        ).rejects.toThrow(
            'You don\'t have permission to create space "new-space"',
        );
        expect(spaceModel.applySpaceAsCode).not.toHaveBeenCalled();
    });

    test('never adopts a generated personal space', async () => {
        const personal = {
            ...rootSpace,
            isDefaultUserSpace: true,
        };
        const { service, spaceModel } = buildService({ spaces: [personal] });

        await expect(
            service.upsertSpace(makeUser(), PROJECT_UUID, spaceAsCode()),
        ).rejects.toThrow(
            'Generated personal space "finance" cannot be managed as code',
        );
        expect(spaceModel.applySpaceAsCode).not.toHaveBeenCalled();
    });

    test('rejects uploader lockout before exact access replacement', async () => {
        const assignedOnlySessionUser = makeSessionUser([
            { subject: 'ContentAsCode', action: 'create' },
            {
                subject: 'Space',
                action: 'manage',
                conditions: {
                    projectUuid: PROJECT_UUID,
                    access: {
                        $elemMatch: {
                            userUuid: USER_UUID,
                            role: SpaceMemberRole.ADMIN,
                        },
                    },
                },
            },
        ]);
        const assignedOnlyUser = fromSession(assignedOnlySessionUser);
        const { service, spaceModel } = buildService({
            refreshedUser: assignedOnlySessionUser,
        });

        await expect(
            service.upsertSpace(
                assignedOnlyUser,
                PROJECT_UUID,
                spaceAsCode({
                    spaceName: 'Renamed',
                    access: {
                        inheritParentPermissions: false,
                        projectMemberAccessRole: null,
                        users: [],
                        groups: [],
                    },
                }),
            ),
        ).rejects.toThrow(
            'Space access would remove your permission to manage the space',
        );
        expect(spaceModel.applySpaceAsCode).toHaveBeenCalledTimes(1);
    });

    test('project-member access only protects an uploader with project membership', async () => {
        const rules: RawRuleOf<Ability<PossibleAbilities>>[] = [
            { subject: 'ContentAsCode', action: 'create' },
            {
                subject: 'Space',
                action: 'manage',
                conditions: {
                    projectUuid: PROJECT_UUID,
                    access: {
                        $elemMatch: {
                            userUuid: USER_UUID,
                            role: SpaceMemberRole.ADMIN,
                        },
                    },
                },
            },
        ];
        const assignedOnlySessionUser = makeSessionUser(rules);
        const assignedOnlyUser = fromSession(assignedOnlySessionUser);
        const desired = spaceAsCode({
            spaceName: 'Renamed',
            access: {
                inheritParentPermissions: false,
                projectMemberAccessRole: SpaceMemberRole.ADMIN,
                users: [],
                groups: [],
            },
        });

        await expect(
            buildService({
                refreshedUser: assignedOnlySessionUser,
            }).service.upsertSpace(assignedOnlyUser, PROJECT_UUID, desired),
        ).rejects.toThrow(
            'Space access would remove your permission to manage the space',
        );

        await expect(
            buildService({
                hasProjectMembership: true,
                refreshedUser: assignedOnlySessionUser,
            }).service.upsertSpace(assignedOnlyUser, PROJECT_UUID, desired),
        ).resolves.toEqual({ action: SpaceAsCodeAction.UPDATE });

        const serviceAccountSessionUser = makeSessionUser(rules, undefined);
        const serviceAccountUser = fromSession(serviceAccountSessionUser);
        await expect(
            buildService({
                hasProjectMembership: true,
                refreshedUser: serviceAccountSessionUser,
            }).service.upsertSpace(serviceAccountUser, PROJECT_UUID, desired),
        ).resolves.toEqual({ action: SpaceAsCodeAction.UPDATE });
    });

    test('uses transactionally resolved users for final uploader retention', async () => {
        const assignedOnlySessionUser = makeSessionUser([
            { subject: 'ContentAsCode', action: 'create' },
            {
                subject: 'Space',
                action: 'manage',
                conditions: {
                    projectUuid: PROJECT_UUID,
                    access: {
                        $elemMatch: {
                            userUuid: USER_UUID,
                            role: SpaceMemberRole.ADMIN,
                        },
                    },
                },
            },
        ]);
        const assignedOnlyUser = fromSession(assignedOnlySessionUser);
        const { service, spaceModel } = buildService({
            refreshedUser: assignedOnlySessionUser,
            resolvedUserAccess: [
                {
                    userUuid: 'different-user-uuid',
                    role: SpaceMemberRole.ADMIN,
                },
            ],
        });

        await expect(
            service.upsertSpace(
                assignedOnlyUser,
                PROJECT_UUID,
                spaceAsCode({
                    spaceName: 'Renamed',
                    access: {
                        inheritParentPermissions: false,
                        projectMemberAccessRole: null,
                        users: [
                            {
                                email: 'owner@example.com',
                                role: SpaceMemberRole.ADMIN,
                            },
                        ],
                        groups: [],
                    },
                }),
            ),
        ).rejects.toThrow(
            'Space access would remove your permission to manage the space',
        );
        expect(spaceModel.applySpaceAsCode).toHaveBeenCalledTimes(1);
    });

    test('rejects an access replacement when current manage access is revoked after preflight', async () => {
        const refreshedUser = makeSessionUser();
        const {
            service,
            spaceModel,
            spacePermissionService,
            userModel,
            transaction,
        } = buildService({
            canResults: [true, false],
            refreshedUser,
        });

        await expect(
            service.upsertSpace(
                makeUser(),
                PROJECT_UUID,
                spaceAsCode({ spaceName: 'Renamed finance' }),
            ),
        ).rejects.toThrow(
            'You don\'t have permission to manage space "finance"',
        );
        expect(spaceModel.applySpaceAsCode).toHaveBeenCalledTimes(1);
        expect(userModel.findSessionUserAndOrgByUuid).toHaveBeenCalledWith(
            USER_UUID,
            ORGANIZATION_UUID,
            { trx: transaction },
        );
        expect(spacePermissionService.can).toHaveBeenLastCalledWith(
            'manage',
            expect.objectContaining({ ability: refreshedUser.ability }),
            SPACE_UUID,
            { trx: transaction },
        );
    });

    test('allows a view-only identical legacy metadata file to remain unchanged', async () => {
        const { service, spaceModel, spacePermissionService } = buildService({
            canManage: false,
            canResults: [true],
        });

        await expect(
            service.upsertSpace(makeUser(), PROJECT_UUID, {
                contentType: ContentAsCodeType.SPACE,
                spaceName: 'Finance',
                slug: 'finance',
            }),
        ).resolves.toEqual({ action: SpaceAsCodeAction.NO_CHANGES });
        expect(spacePermissionService.can).toHaveBeenCalledTimes(1);
        expect(spacePermissionService.can).toHaveBeenCalledWith(
            'view',
            expect.anything(),
            SPACE_UUID,
        );
        expect(spaceModel.applySpaceAsCode).not.toHaveBeenCalled();
    });

    test('recursively creates missing ancestors for a legacy metadata-only leaf', async () => {
        const { service, spaceModel } = buildService({ spaces: [] });

        await expect(
            service.upsertSpace(makeUser(), PROJECT_UUID, {
                contentType: ContentAsCodeType.SPACE,
                spaceName: 'Quarterly reports',
                slug: 'company/finance/reports',
            }),
        ).resolves.toEqual({ action: SpaceAsCodeAction.CREATE });

        expect(
            spaceModel.applySpaceAsCode.mock.calls.map(([input]) => ({
                name: input.name,
                path: input.path,
                parentSpaceUuid: input.parentSpaceUuid,
            })),
        ).toEqual([
            {
                name: 'Company',
                path: 'company',
                parentSpaceUuid: null,
            },
            {
                name: 'Finance',
                path: 'company.finance',
                parentSpaceUuid: 'created-company',
            },
            {
                name: 'Quarterly reports',
                path: 'company.finance.reports',
                parentSpaceUuid: 'created-company.finance',
            },
        ]);
    });

    test('does not synthesize missing parents for explicit access or skip-space-create', async () => {
        const explicit = buildService({ spaces: [] });
        await expect(
            explicit.service.upsertSpace(
                makeUser(),
                PROJECT_UUID,
                spaceAsCode({ slug: 'parent/child' }),
            ),
        ).rejects.toThrow('Parent space "parent" must exist before');
        expect(explicit.spaceModel.applySpaceAsCode).not.toHaveBeenCalled();

        const skipped = buildService({ spaces: [] });
        await expect(
            skipped.service.upsertSpace(
                makeUser(),
                PROJECT_UUID,
                {
                    contentType: ContentAsCodeType.SPACE,
                    spaceName: 'Child',
                    slug: 'parent/child',
                },
                { skipSpaceCreate: true },
            ),
        ).rejects.toThrow('does not exist, skipping creation');
        expect(skipped.spaceModel.applySpaceAsCode).not.toHaveBeenCalled();
    });

    test('rejects a caller whose content-as-code ability belongs to another project', async () => {
        const otherProjectUser = makeUser([
            {
                subject: 'ContentAsCode',
                action: 'create',
                conditions: { projectUuid: 'other-project-uuid' },
            },
            {
                subject: 'Space',
                action: 'manage',
                conditions: { projectUuid: 'other-project-uuid' },
            },
        ]);
        const { service, spaceModel } = buildService();

        await expect(
            service.upsertSpace(
                otherProjectUser,
                PROJECT_UUID,
                spaceAsCode({ spaceName: 'Renamed finance' }),
            ),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(spaceModel.findByProjectAndPath).not.toHaveBeenCalled();
    });

    test('warns when replacing direct access without a portable identity', async () => {
        const { service, spaceModel } = buildService({
            rawAccess: {
                [SPACE_UUID]: {
                    users: [],
                    groups: [
                        {
                            groupUuid: 'ambiguous-group-uuid',
                            name: 'Finance team',
                            role: SpaceMemberRole.ADMIN,
                        },
                    ],
                },
            },
            groups: [
                { uuid: 'first-group-uuid', name: 'Finance team' },
                { uuid: 'second-group-uuid', name: 'Finance team' },
            ],
        });

        await expect(
            service.upsertSpace(
                makeUser(),
                PROJECT_UUID,
                spaceAsCode({ spaceName: 'Renamed finance' }),
            ),
        ).resolves.toEqual({
            action: SpaceAsCodeAction.UPDATE,
            warnings: [
                'Applying this access policy will remove direct service-account, internal-user, or unresolved user/group grants that cannot be represented as code',
            ],
        });
        expect(spaceModel.applySpaceAsCode).toHaveBeenCalledOnce();
    });
});
