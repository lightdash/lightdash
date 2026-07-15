import { ParameterError, SpaceMemberRole } from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { EmailTableName } from '../database/entities/emails';
import {
    FeatureFlagOverridesTableName,
    FeatureFlagsTableName,
} from '../database/entities/featureFlags';
import { GroupMembershipTableName } from '../database/entities/groupMemberships';
import { GroupTableName } from '../database/entities/groups';
import { OrganizationMembershipsTableName } from '../database/entities/organizationMemberships';
import { ProjectGroupAccessTableName } from '../database/entities/projectGroupAccess';
import { ProjectMembershipsTableName } from '../database/entities/projectMemberships';
import { ProjectTableName } from '../database/entities/projects';
import { ScopedRolesTableName } from '../database/entities/roles';
import {
    SpaceGroupAccessTableName,
    SpaceTableName,
    SpaceUserAccessTableName,
} from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';
import { SpaceModel } from './SpaceModel';

describe('SpaceModel space access as code', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new SpaceModel({ database });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    beforeEach(() => {
        tracker.on.select('pg_advisory_xact_lock').response({});
    });

    afterEach(() => {
        tracker.reset();
    });

    const projectRow = {
        projectId: 1,
        organizationId: 2,
        organizationUuid: 'organization-uuid',
    };

    const spaceRow = {
        organizationUuid: 'organization-uuid',
        projectUuid: 'project-uuid',
        uuid: 'space-uuid',
        name: 'Finance',
        slug: 'finance',
        path: 'finance',
        parentSpaceUuid: null,
        inheritParentPermissions: false,
        projectMemberAccessRole: null,
        isDefaultUserSpace: false,
    };

    const applyInput = {
        projectUuid: 'project-uuid',
        userId: 1,
        actorUserUuid: 'actor-user-uuid',
        actorServiceAccountUuid: null,
        spaceUuid: 'space-uuid',
        name: 'Finance',
        path: 'finance',
        parentSpaceUuid: null,
        inheritParentPermissionsOnCreate: false,
    };

    const mockProject = () => {
        tracker.on
            .select(({ sql }) => sql.includes(`from "${ProjectTableName}"`))
            .responseOnce(projectRow);
    };

    type MockAuthorizationSourcesOptions = {
        organizationRoleUuid?: string | null;
        projectRoleUuid?: string | null;
        groupUuids?: string[];
        projectGroupRoles?: Array<{
            groupUuid: string;
            roleUuid: string | null;
        }>;
        directUsers?: Array<{
            userUuid: string;
            userId: number;
            isInternal?: boolean;
            hasOrganizationMembership?: boolean;
            primaryEmail?: string | null;
        }>;
        desiredUsers?: Array<{
            userUuid: string;
            userId: number;
            email: string;
            isInternal?: boolean;
            hasOrganizationMembership?: boolean;
        }>;
        directGroups?: Array<{
            groupUuid: string;
            organizationId: number;
            name?: string;
        }>;
        desiredGroups?: Array<{
            groupUuid: string;
            organizationId: number;
            name: string;
        }>;
        queriedDirectGroupUuids?: string[];
        isActive?: boolean;
        isInternal?: boolean;
        serviceAccountExists?: boolean;
    };

    const mockAuthorizationSources = ({
        organizationRoleUuid = null,
        projectRoleUuid = null,
        groupUuids = [],
        projectGroupRoles = [],
        directUsers = [],
        desiredUsers = [],
        directGroups = [],
        desiredGroups = [],
        queriedDirectGroupUuids = [],
        isActive = true,
        isInternal = false,
        serviceAccountExists = true,
    }: MockAuthorizationSourcesOptions = {}) => {
        const identityUsers = [
            ...directUsers.map((directUser) => ({
                ...directUser,
                primaryEmail:
                    directUser.primaryEmail === undefined
                        ? `${directUser.userUuid}@example.com`
                        : directUser.primaryEmail,
            })),
            ...desiredUsers.map((desiredUser) => ({
                ...desiredUser,
                primaryEmail: desiredUser.email,
            })),
        ];
        tracker.on
            .select(
                ({ sql }) =>
                    sql.includes(`from "${UserTableName}"`) &&
                    sql.includes('"is_active" as "isActive"') &&
                    sql.includes('for share'),
            )
            .responseOnce([
                {
                    userId: 1,
                    userUuid: 'actor-user-uuid',
                    isActive,
                    isInternal,
                },
                ...identityUsers.map((identityUser) => ({
                    userId: identityUser.userId,
                    userUuid: identityUser.userUuid,
                    isActive: true,
                    isInternal: identityUser.isInternal ?? false,
                })),
            ]);
        tracker.on
            .select(
                ({ sql }) =>
                    sql.includes(
                        `from "${OrganizationMembershipsTableName}"`,
                    ) && sql.includes('for share'),
            )
            .responseOnce([
                { userId: 1, roleUuid: organizationRoleUuid },
                ...identityUsers
                    .filter(
                        ({ hasOrganizationMembership = true }) =>
                            hasOrganizationMembership,
                    )
                    .map(({ userId }) => ({ userId, roleUuid: null })),
            ]);
        if (identityUsers.length > 0) {
            tracker.on
                .select(
                    ({ sql }) =>
                        sql.includes(`from "${EmailTableName}"`) &&
                        sql.includes('for share'),
                )
                .responseOnce(
                    identityUsers.flatMap((identityUser) =>
                        identityUser.primaryEmail === null
                            ? []
                            : [
                                  {
                                      userId: identityUser.userId,
                                      email: identityUser.primaryEmail,
                                  },
                              ],
                    ),
                );
        }
        if (isInternal) {
            tracker.on
                .select(
                    ({ sql }) =>
                        sql.includes('from "service_accounts"') &&
                        sql.includes('for share'),
                )
                .responseOnce(
                    serviceAccountExists
                        ? { service_account_uuid: 'service-account-uuid' }
                        : undefined,
                );
        }
        tracker.on
            .select(
                ({ sql }) =>
                    sql.includes(`from "${GroupMembershipTableName}"`) &&
                    !sql.includes('for share'),
            )
            .responseOnce(groupUuids.map((groupUuid) => ({ groupUuid })));
        if (
            groupUuids.length > 0 ||
            directGroups.length > 0 ||
            desiredGroups.length > 0 ||
            queriedDirectGroupUuids.length > 0
        ) {
            tracker.on
                .select(
                    ({ sql }) =>
                        sql.includes(`from "${GroupTableName}"`) &&
                        sql.includes('for share'),
                )
                .responseOnce([
                    ...groupUuids.map((groupUuid) => ({
                        groupUuid,
                        organizationId: 2,
                        name: groupUuid,
                    })),
                    ...directGroups,
                    ...desiredGroups,
                ]);
        }
        tracker.on
            .select(
                ({ sql }) =>
                    sql.includes(`from "${GroupMembershipTableName}"`) &&
                    sql.includes('for share'),
            )
            .responseOnce(groupUuids.map((groupUuid) => ({ groupUuid })));
        tracker.on
            .select(
                ({ sql }) =>
                    sql.includes(`from "${ProjectMembershipsTableName}"`) &&
                    sql.includes('for share'),
            )
            .responseOnce(
                projectRoleUuid === null
                    ? undefined
                    : { roleUuid: projectRoleUuid },
            );
        if (groupUuids.length > 0) {
            tracker.on
                .select(
                    ({ sql }) =>
                        sql.includes(`from "${ProjectGroupAccessTableName}"`) &&
                        sql.includes('for share'),
                )
                .responseOnce(projectGroupRoles);
        }
        if (
            organizationRoleUuid !== null ||
            projectRoleUuid !== null ||
            projectGroupRoles.some(({ roleUuid }) => roleUuid !== null)
        ) {
            tracker.on
                .select(
                    ({ sql }) =>
                        sql.includes(`from "${ScopedRolesTableName}"`) &&
                        sql.includes('for share'),
                )
                .responseOnce([]);
        }
        tracker.on
            .select(
                ({ sql }) =>
                    sql.includes(`from "${FeatureFlagsTableName}"`) &&
                    sql.includes('for share'),
            )
            .responseOnce({ flag_id: 'custom-roles' });
        tracker.on
            .select(
                ({ sql }) =>
                    sql.includes(`from "${FeatureFlagOverridesTableName}"`) &&
                    sql.includes('for share'),
            )
            .responseOnce([]);
    };

    const mockExistingSpace = (
        rows = [
            {
                spaceUuid: 'space-uuid',
                parentSpaceUuid: null,
                isDefaultUserSpace: false,
            },
        ],
        accessChainRow: { parentSpaceUuid: string | null } | undefined = {
            parentSpaceUuid: null,
        },
        {
            directUserUuids = [],
            directGroupUuids = [],
            authorizationSources = {},
        }: {
            directUserUuids?: string[];
            directGroupUuids?: string[];
            authorizationSources?: MockAuthorizationSourcesOptions;
        } = {},
    ) => {
        tracker.on
            .select(
                ({ sql }) =>
                    sql.includes(`from "${SpaceTableName}"`) &&
                    sql.includes('for share'),
            )
            .responseOnce(accessChainRow);
        tracker.on
            .select(
                ({ sql }) =>
                    sql.includes(`from "${SpaceTableName}"`) &&
                    sql.includes('"path" =') &&
                    sql.includes('for update'),
            )
            .responseOnce(rows);
        tracker.on
            .select(
                ({ sql }) =>
                    sql.includes(`from "${SpaceUserAccessTableName}"`) &&
                    !sql.includes('join') &&
                    !sql.includes('for update'),
            )
            .responseOnce(directUserUuids.map((userUuid) => ({ userUuid })));
        tracker.on
            .select(
                ({ sql }) =>
                    sql.includes(`from "${SpaceGroupAccessTableName}"`) &&
                    !sql.includes('join') &&
                    !sql.includes('for update'),
            )
            .responseOnce(directGroupUuids.map((groupUuid) => ({ groupUuid })));
        tracker.on
            .select(
                ({ sql }) =>
                    sql.includes(`from "${SpaceUserAccessTableName}"`) &&
                    sql.includes('for update'),
            )
            .responseOnce(directUserUuids.map((userUuid) => ({ userUuid })));
        tracker.on
            .select(
                ({ sql }) =>
                    sql.includes(`from "${SpaceGroupAccessTableName}"`) &&
                    sql.includes('for update'),
            )
            .responseOnce(directGroupUuids.map((groupUuid) => ({ groupUuid })));
        mockAuthorizationSources({
            ...authorizationSources,
            queriedDirectGroupUuids: directGroupUuids,
        });
    };

    const mockReturnedSpace = () => {
        tracker.on
            .select(
                ({ sql }) =>
                    sql.includes(`from "${SpaceTableName}"`) &&
                    sql.includes(`join "${ProjectTableName}"`),
            )
            .responseOnce([spaceRow]);
    };

    it('returns every active project space, including default spaces for the caller to filter', async () => {
        mockReturnedSpace();

        const result = await model.getSpacesByProjectUuid('project-uuid');

        expect(result).toEqual([spaceRow]);
        expect(tracker.history.select[0].sql).toContain(
            `"${SpaceTableName}"."deleted_at" is null`,
        );
        expect(tracker.history.select[0].sql).not.toContain(
            `"${SpaceTableName}"."is_default_user_space" =`,
        );
    });

    it('resolves principals before replacing exact access', async () => {
        mockProject();
        tracker.on
            .select(({ sql }) =>
                sql.includes(`join "${OrganizationMembershipsTableName}"`),
            )
            .responseOnce([
                {
                    userUuid: 'user-uuid',
                    email: 'owner@example.com',
                    isInternal: false,
                },
            ]);
        tracker.on
            .select(GroupTableName)
            .responseOnce([{ groupUuid: 'group-uuid', name: 'Finance team' }]);
        mockExistingSpace(undefined, undefined, {
            authorizationSources: {
                desiredUsers: [
                    {
                        userUuid: 'user-uuid',
                        userId: 2,
                        email: 'owner@example.com',
                    },
                ],
                desiredGroups: [
                    {
                        groupUuid: 'group-uuid',
                        organizationId: 2,
                        name: 'Finance team',
                    },
                ],
            },
        });
        tracker.on
            .select(({ sql }) =>
                sql.includes(`from "${SpaceUserAccessTableName}"`),
            )
            .responseOnce([]);
        tracker.on.update(SpaceTableName).responseOnce(1);
        tracker.on.delete(SpaceUserAccessTableName).responseOnce(1);
        tracker.on.delete(SpaceGroupAccessTableName).responseOnce(1);
        tracker.on.insert(SpaceUserAccessTableName).responseOnce(1);
        tracker.on.insert(SpaceGroupAccessTableName).responseOnce(1);
        mockReturnedSpace();
        const beforeMutation = vi.fn(async () => undefined);

        await model.applySpaceAsCode(
            {
                ...applyInput,
                access: {
                    inheritParentPermissions: false,
                    projectMemberAccessRole: SpaceMemberRole.VIEWER,
                    users: [
                        {
                            email: 'OWNER@example.com',
                            role: SpaceMemberRole.ADMIN,
                        },
                    ],
                    groups: [
                        {
                            name: 'Finance team',
                            role: SpaceMemberRole.EDITOR,
                        },
                    ],
                },
            },
            { trx: database, beforeMutation },
        );

        expect(beforeMutation).toHaveBeenCalledWith(database, {
            userAccess: [
                {
                    userUuid: 'user-uuid',
                    role: SpaceMemberRole.ADMIN,
                },
            ],
        });
        expect(tracker.history.update).toHaveLength(1);
        expect(tracker.history.delete).toHaveLength(2);
        expect(tracker.history.insert).toHaveLength(2);
        expect(tracker.history.insert[0].bindings).toEqual([
            SpaceMemberRole.ADMIN,
            'space-uuid',
            'user-uuid',
        ]);
        expect(tracker.history.insert[1].bindings).toEqual([
            'group-uuid',
            SpaceMemberRole.EDITOR,
            'space-uuid',
        ]);
    });

    it('fails unresolved users before mutating the space', async () => {
        mockProject();
        mockExistingSpace();
        tracker.on
            .select(({ sql }) =>
                sql.includes(`join "${OrganizationMembershipsTableName}"`),
            )
            .responseOnce([]);

        await expect(
            model.applySpaceAsCode(
                {
                    ...applyInput,
                    access: {
                        inheritParentPermissions: false,
                        projectMemberAccessRole: null,
                        users: [
                            {
                                email: 'missing@example.com',
                                role: SpaceMemberRole.ADMIN,
                            },
                        ],
                        groups: [],
                    },
                },
                { trx: database },
            ),
        ).rejects.toThrow(ParameterError);

        expect(tracker.history.update).toHaveLength(0);
        expect(tracker.history.delete).toHaveLength(0);
        expect(tracker.history.insert).toHaveLength(0);
    });

    it('rejects a requested user whose portable identity changed before locking', async () => {
        mockProject();
        tracker.on
            .select(({ sql }) =>
                sql.includes(`join "${OrganizationMembershipsTableName}"`),
            )
            .responseOnce([
                {
                    userUuid: 'user-uuid',
                    email: 'owner@example.com',
                    isInternal: false,
                },
            ]);
        mockExistingSpace(undefined, undefined, {
            authorizationSources: {
                desiredUsers: [
                    {
                        userUuid: 'user-uuid',
                        userId: 2,
                        email: 'renamed@example.com',
                    },
                ],
            },
        });
        const beforeMutation = vi.fn(async () => undefined);

        await expect(
            model.applySpaceAsCode(
                {
                    ...applyInput,
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
                },
                { trx: database, beforeMutation },
            ),
        ).rejects.toThrow('requested space user identity changed');

        expect(beforeMutation).not.toHaveBeenCalled();
        expect(tracker.history.update).toHaveLength(0);
        expect(tracker.history.delete).toHaveLength(0);
    });

    it('removes unsupported existing direct users when access is replaced', async () => {
        mockProject();
        mockExistingSpace(undefined, undefined, {
            directUserUuids: ['service-account-uuid'],
            authorizationSources: {
                directUsers: [
                    {
                        userUuid: 'service-account-uuid',
                        userId: 2,
                        isInternal: true,
                    },
                ],
            },
        });
        tracker.on
            .select(({ sql }) =>
                sql.includes(`from "${SpaceUserAccessTableName}"`),
            )
            .responseOnce([]);
        tracker.on.update(SpaceTableName).responseOnce(1);
        tracker.on.delete(SpaceUserAccessTableName).responseOnce(1);
        tracker.on.delete(SpaceGroupAccessTableName).responseOnce(1);
        mockReturnedSpace();

        await model.applySpaceAsCode(
            {
                ...applyInput,
                access: {
                    inheritParentPermissions: false,
                    projectMemberAccessRole: null,
                    users: [],
                    groups: [],
                },
            },
            { trx: database },
        );

        expect(tracker.history.update).toHaveLength(1);
        expect(tracker.history.delete).toHaveLength(2);
    });

    it('runs the final lockout guard after locking access and before mutation', async () => {
        mockProject();
        mockExistingSpace();
        const beforeMutation = vi.fn(async () => {
            throw new ParameterError('policy changed concurrently');
        });

        await expect(
            model.applySpaceAsCode(
                {
                    ...applyInput,
                    access: {
                        inheritParentPermissions: false,
                        projectMemberAccessRole: null,
                        users: [],
                        groups: [],
                    },
                },
                { trx: database, beforeMutation },
            ),
        ).rejects.toThrow('policy changed concurrently');

        expect(beforeMutation).toHaveBeenCalledWith(database, {
            userAccess: [],
        });
        expect(tracker.history.update).toHaveLength(0);
        expect(tracker.history.delete).toHaveLength(0);
    });

    it('locks authorization sources in a deadlock-safe order before the final check', async () => {
        mockProject();
        tracker.on
            .select(
                ({ sql }) =>
                    sql.includes(`from "${SpaceTableName}"`) &&
                    sql.includes('for share'),
            )
            .responseOnce({ parentSpaceUuid: null });
        tracker.on
            .select(
                ({ sql }) =>
                    sql.includes(`from "${SpaceTableName}"`) &&
                    sql.includes('"path" =') &&
                    sql.includes('for update'),
            )
            .responseOnce([
                {
                    spaceUuid: 'space-uuid',
                    parentSpaceUuid: null,
                    isDefaultUserSpace: false,
                },
            ]);
        mockAuthorizationSources({
            organizationRoleUuid: 'organization-role-uuid',
            projectRoleUuid: 'project-role-uuid',
            groupUuids: ['group-b', 'group-a'],
            projectGroupRoles: [
                {
                    groupUuid: 'group-a',
                    roleUuid: 'group-role-uuid',
                },
            ],
            isInternal: true,
        });
        const beforeMutation = vi.fn(async () => {
            throw new ParameterError('stop before mutation');
        });

        await expect(
            model.applySpaceAsCode(
                {
                    ...applyInput,
                    actorServiceAccountUuid: 'service-account-uuid',
                },
                { trx: database, beforeMutation },
            ),
        ).rejects.toThrow('stop before mutation');

        const shareLocks = tracker.history.select
            .filter(({ sql }) => sql.includes('for share'))
            .map(({ sql }) => {
                if (sql.includes(`from "${SpaceTableName}"`)) return 'space';
                if (sql.includes(`from "${UserTableName}"`)) return 'user';
                if (sql.includes(`from "${OrganizationMembershipsTableName}"`))
                    return 'organizationMembership';
                if (sql.includes('from "service_accounts"'))
                    return 'serviceAccount';
                if (sql.includes(`from "${GroupTableName}"`)) return 'group';
                if (sql.includes(`from "${GroupMembershipTableName}"`))
                    return 'groupMembership';
                if (sql.includes(`from "${ProjectMembershipsTableName}"`))
                    return 'projectMembership';
                if (sql.includes(`from "${ProjectGroupAccessTableName}"`))
                    return 'projectGroupAccess';
                if (sql.includes(`from "${ScopedRolesTableName}"`))
                    return 'scopedRole';
                if (sql.includes(`from "${FeatureFlagsTableName}"`))
                    return 'featureFlag';
                if (sql.includes(`from "${FeatureFlagOverridesTableName}"`))
                    return 'featureFlagOverride';
                return 'unexpected';
            });
        expect(shareLocks).toEqual([
            'space',
            'user',
            'organizationMembership',
            'serviceAccount',
            'group',
            'groupMembership',
            'projectMembership',
            'projectGroupAccess',
            'scopedRole',
            'featureFlag',
            'featureFlagOverride',
        ]);
        const groupLock = tracker.history.select.find(
            ({ sql }) =>
                sql.includes(`from "${GroupTableName}"`) &&
                sql.includes('for share'),
        );
        expect(groupLock?.sql).toContain('order by "group_uuid" asc');
        expect(beforeMutation).toHaveBeenCalledOnce();
    });

    it('rejects an inactive actor before the authorization callback', async () => {
        mockProject();
        tracker.on
            .select(
                ({ sql }) =>
                    sql.includes(`from "${SpaceTableName}"`) &&
                    sql.includes('for share'),
            )
            .responseOnce({ parentSpaceUuid: null });
        mockAuthorizationSources({ isActive: false });
        const beforeMutation = vi.fn(async () => undefined);

        await expect(
            model.applySpaceAsCode(applyInput, {
                trx: database,
                beforeMutation,
            }),
        ).rejects.toThrow('no longer active');
        expect(beforeMutation).not.toHaveBeenCalled();
        expect(tracker.history.update).toHaveLength(0);
    });

    it('requires the exact authenticated service account to remain live', async () => {
        mockProject();
        tracker.on
            .select(
                ({ sql }) =>
                    sql.includes(`from "${SpaceTableName}"`) &&
                    sql.includes('for share'),
            )
            .responseOnce({ parentSpaceUuid: null });
        mockAuthorizationSources({
            isInternal: true,
            serviceAccountExists: false,
        });
        const beforeMutation = vi.fn(async () => undefined);

        await expect(
            model.applySpaceAsCode(
                {
                    ...applyInput,
                    actorServiceAccountUuid: 'service-account-uuid',
                },
                { trx: database, beforeMutation },
            ),
        ).rejects.toThrow('service account no longer exists');
        expect(beforeMutation).not.toHaveBeenCalled();
        expect(tracker.history.update).toHaveLength(0);
    });

    it('serializes interactive direct access writes with as-code replacement', async () => {
        tracker.on.insert(SpaceUserAccessTableName).responseOnce(1);

        await model.addSpaceAccess(
            'space-uuid',
            'user-uuid',
            SpaceMemberRole.EDITOR,
        );

        expect(
            tracker.history.select.some(
                ({ sql, bindings }) =>
                    sql.includes('pg_advisory_xact_lock') &&
                    bindings.includes('space-uuid'),
            ),
        ).toBe(true);
        expect(tracker.history.insert).toHaveLength(1);
    });

    it('updates only the name when access is omitted', async () => {
        mockProject();
        mockExistingSpace();
        tracker.on.update(SpaceTableName).responseOnce(1);
        mockReturnedSpace();
        const beforeMutation = vi.fn(async () => undefined);

        await model.applySpaceAsCode(
            { ...applyInput, name: 'Finance renamed' },
            { trx: database, beforeMutation },
        );

        expect(beforeMutation).toHaveBeenCalledWith(database, {
            userAccess: [],
        });
        expect(tracker.history.update).toHaveLength(1);
        expect(tracker.history.update[0].sql).toContain('set "name" = $1');
        expect(tracker.history.update[0].sql).not.toContain(
            'inherit_parent_permissions',
        );
        expect(tracker.history.delete).toHaveLength(0);
        expect(tracker.history.insert).toHaveLength(0);
    });

    it('rechecks path identity inside the write transaction', async () => {
        mockProject();
        mockExistingSpace([]);

        await expect(
            model.applySpaceAsCode(applyInput, { trx: database }),
        ).rejects.toThrow('changed or became ambiguous');

        expect(tracker.history.update).toHaveLength(0);
        expect(tracker.history.delete).toHaveLength(0);
        expect(tracker.history.insert).toHaveLength(0);
        expect(
            tracker.history.select.some(({ sql }) =>
                sql.includes('pg_advisory_xact_lock'),
            ),
        ).toBe(true);
    });

    it('locks the full access chain before taking the target row update lock', async () => {
        mockProject();
        let chainQueryCount = 0;
        tracker.on
            .select(
                ({ sql }) =>
                    sql.includes(`from "${SpaceTableName}"`) &&
                    sql.includes('for share'),
            )
            .response(() => {
                chainQueryCount += 1;
                return chainQueryCount === 1
                    ? { parentSpaceUuid: 'parent-space-uuid' }
                    : { parentSpaceUuid: null };
            });
        tracker.on
            .select(
                ({ sql }) =>
                    sql.includes(`from "${SpaceTableName}"`) &&
                    sql.includes('"path" =') &&
                    sql.includes('for update'),
            )
            .responseOnce([
                {
                    spaceUuid: 'space-uuid',
                    parentSpaceUuid: 'parent-space-uuid',
                    isDefaultUserSpace: false,
                },
            ]);
        mockAuthorizationSources();
        const beforeMutation = vi.fn(async () => {
            throw new ParameterError('stop before mutation');
        });

        await expect(
            model.applySpaceAsCode(
                { ...applyInput, parentSpaceUuid: 'parent-space-uuid' },
                { trx: database, beforeMutation },
            ),
        ).rejects.toThrow('stop before mutation');

        const advisoryLockBindings = tracker.history.select
            .filter(({ sql }) => sql.includes('pg_advisory_xact_lock'))
            .map(({ bindings }) => bindings);
        expect(advisoryLockBindings).toEqual([
            [2, 'project-uuid:space:finance'],
            [3, 'space-uuid'],
            [3, 'parent-space-uuid'],
        ]);
        const lastShareLockIndex = tracker.history.select.findLastIndex(
            ({ sql }) => sql.includes('for share'),
        );
        const updateLockIndex = tracker.history.select.findIndex(({ sql }) =>
            sql.includes('for update'),
        );
        expect(updateLockIndex).toBeGreaterThan(lastShareLockIndex);
    });

    it('copies parent direct access for legacy non-inheriting child creation', async () => {
        tracker.on
            .select(
                ({ sql }) =>
                    sql.includes(`from "${ProjectTableName}"`) &&
                    sql.includes('join "organizations"'),
            )
            .responseOnce(projectRow);
        tracker.on
            .select(
                ({ sql }) =>
                    sql.includes(`from "${SpaceTableName}"`) &&
                    sql.includes('for share'),
            )
            .responseOnce({ parentSpaceUuid: null });
        mockAuthorizationSources();
        tracker.on
            .select(
                ({ sql }) =>
                    sql.includes(`from "${SpaceTableName}"`) &&
                    sql.includes('"path" =') &&
                    sql.includes('for update'),
            )
            .responseOnce([]);
        tracker.on
            .select(
                ({ sql }) =>
                    sql.includes(`from "${SpaceTableName}"`) &&
                    sql.includes('"space_uuid" =') &&
                    sql.includes('"project_id" ='),
            )
            .responseOnce({
                path: 'parent',
                isDefaultUserSpace: false,
            });
        tracker.on
            .select(
                ({ sql }) =>
                    sql.includes(`from "${ProjectTableName}"`) &&
                    !sql.includes('join "organizations"'),
            )
            .responseOnce([{ project_id: 1 }]);
        tracker.on
            .select(
                ({ sql }) =>
                    sql.includes(`from "${SpaceTableName}"`) &&
                    sql.includes('"slug" ='),
            )
            .responseOnce(undefined);
        tracker.on.insert(SpaceTableName).responseOnce([
            {
                space_uuid: 'child-space-uuid',
                name: 'Child',
                slug: 'child',
                path: 'parent.child',
                parent_space_uuid: 'parent-space-uuid',
                inherit_parent_permissions: false,
                project_member_access_role: null,
                color_palette_uuid: null,
            },
        ]);
        tracker.on.select(SpaceUserAccessTableName).responseOnce([
            {
                user_uuid: 'legacy-user-uuid',
                space_role: SpaceMemberRole.ADMIN,
            },
        ]);
        tracker.on.select(SpaceGroupAccessTableName).responseOnce([
            {
                group_uuid: 'legacy-group-uuid',
                space_role: SpaceMemberRole.EDITOR,
            },
        ]);
        tracker.on.insert(SpaceUserAccessTableName).responseOnce(1);
        tracker.on.insert(SpaceGroupAccessTableName).responseOnce(1);
        tracker.on
            .select(
                ({ sql }) =>
                    sql.includes(`from "${SpaceTableName}"`) &&
                    sql.includes(`join "${ProjectTableName}"`),
            )
            .responseOnce([
                {
                    ...spaceRow,
                    uuid: 'child-space-uuid',
                    name: 'Child',
                    slug: 'child',
                    path: 'parent.child',
                    parentSpaceUuid: 'parent-space-uuid',
                },
            ]);

        await model.applySpaceAsCode(
            {
                projectUuid: 'project-uuid',
                userId: 1,
                actorUserUuid: 'actor-user-uuid',
                actorServiceAccountUuid: null,
                spaceUuid: null,
                name: 'Child',
                path: 'parent.child',
                parentSpaceUuid: 'parent-space-uuid',
                inheritParentPermissionsOnCreate: false,
                copyParentAccessOnLegacyCreate: true,
            },
            { trx: database },
        );

        const userCopy = tracker.history.insert.find(({ sql }) =>
            sql.includes(`"${SpaceUserAccessTableName}"`),
        );
        const groupCopy = tracker.history.insert.find(({ sql }) =>
            sql.includes(`"${SpaceGroupAccessTableName}"`),
        );
        expect(userCopy?.bindings).toContain('child-space-uuid');
        expect(userCopy?.bindings).toContain('legacy-user-uuid');
        expect(groupCopy?.bindings).toContain('child-space-uuid');
        expect(groupCopy?.bindings).toContain('legacy-group-uuid');
        const actorUserLocks = tracker.history.select.filter(
            ({ sql }) =>
                sql.includes(`from "${UserTableName}"`) &&
                sql.includes('for share'),
        );
        expect(actorUserLocks).toHaveLength(1);
        expect(actorUserLocks[0].bindings).toContain('actor-user-uuid');
    });
});
