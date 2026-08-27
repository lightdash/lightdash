import { Ability } from '@casl/ability';
import {
    DirectAccessOrigin,
    NotFoundError,
    OrganizationMemberRole,
    SpaceMemberRole,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import { vi } from 'vitest';
import type { DirectAccessListRow } from '../../models/directAccessAdminModelUtils';
import type { DirectAccessMutationResult } from '../../models/directAccessModelUtils';
import type { AccessContextForCasl } from '../SpaceService/SpacePermissionService';
import {
    BaseResourceAccessHandler,
    type DirectAccessResourceAdapter,
    type DirectAccessTarget,
} from './BaseResourceAccessHandler';
import {
    runResourceAccessHandlerConformance,
    type ResourceAccessHandlerConformanceHarness,
} from './ResourceAccessHandler.conformance';

const ORGANIZATION_UUID = '00000000-0000-4000-8000-000000000001';
const PROJECT_UUID = '00000000-0000-4000-8000-000000000002';
const SPACE_UUID = '00000000-0000-4000-8000-000000000003';
const RESOURCE_UUID = '00000000-0000-4000-8000-000000000004';
const ACTOR_UUID = '00000000-0000-4000-8000-000000000005';

const createUser = (): SessionUser =>
    ({
        userUuid: ACTOR_UUID,
        userId: 1,
        email: 'editor@example.com',
        firstName: 'Ed',
        lastName: 'Itor',
        organizationUuid: ORGANIZATION_UUID,
        organizationName: 'Lightdash',
        organizationCreatedAt: new Date('2026-08-27T00:00:00Z'),
        role: OrganizationMemberRole.MEMBER,
        isTrackingAnonymized: false,
        isMarketingOptedIn: false,
        isSetupComplete: true,
        isActive: true,
        createdAt: new Date('2026-08-27T00:00:00Z'),
        updatedAt: new Date('2026-08-27T00:00:00Z'),
        timezone: null,
        avatarUrl: null,
        avatarGradient: null,
        ability: new Ability<PossibleAbilities>([]),
        abilityRules: [],
    }) as SessionUser;

const mutationResult = (
    beforeRole: SpaceMemberRole | null,
    afterRole: SpaceMemberRole | null,
): DirectAccessMutationResult => ({
    organizationId: 1,
    organizationUuid: ORGANIZATION_UUID,
    projectId: 1,
    projectUuid: PROJECT_UUID,
    beforeRole,
    afterRole,
});

const createHarness = (): ResourceAccessHandlerConformanceHarness => {
    const user = createUser();
    let actorRole: SpaceMemberRole | undefined = SpaceMemberRole.EDITOR;
    let enabled = true;
    let eligible = true;
    let targetError: Error | undefined;
    let rows: DirectAccessListRow[] = [];

    const target: DirectAccessTarget = {
        resourceUuid: RESOURCE_UUID,
        organizationUuid: ORGANIZATION_UUID,
        projectUuid: PROJECT_UUID,
        spaceUuid: SPACE_UUID,
        accessTarget: {
            type: 'dashboard',
            dashboardUuid: RESOURCE_UUID,
            spaceUuid: SPACE_UUID,
        },
        canReceiveDirectAccess: true,
    };
    const getTarget = vi.fn(async () => {
        if (targetError) throw targetError;
        return { ...target, canReceiveDirectAccess: eligible };
    });
    const upsertUserAccess = vi.fn(
        async (
            _target: DirectAccessTarget,
            input: {
                userUuid: string;
                role: SpaceMemberRole;
                actor: SessionUser;
            },
        ) => {
            const existing = rows.find(
                (row) =>
                    row.origin === DirectAccessOrigin.USER &&
                    row.principalUuid === input.userUuid,
            );
            rows = rows.filter(
                (row) =>
                    row.origin !== DirectAccessOrigin.USER ||
                    row.principalUuid !== input.userUuid,
            );
            rows.push({
                origin: DirectAccessOrigin.USER,
                principalUuid: input.userUuid,
                firstName: 'Test',
                lastName: 'User',
                email: 'test@example.com',
                isInternal: false,
                directRole: input.role,
            });
            return mutationResult(existing?.directRole ?? null, input.role);
        },
    );
    const upsertGroupAccess = vi.fn(
        async (
            _target: DirectAccessTarget,
            input: { groupUuid: string; role: SpaceMemberRole },
        ) => {
            const existing = rows.find(
                (row) =>
                    row.origin === DirectAccessOrigin.GROUP &&
                    row.principalUuid === input.groupUuid,
            );
            rows = rows.filter(
                (row) =>
                    row.origin !== DirectAccessOrigin.GROUP ||
                    row.principalUuid !== input.groupUuid,
            );
            rows.push({
                origin: DirectAccessOrigin.GROUP,
                principalUuid: input.groupUuid,
                name: 'Test group',
                directRole: input.role,
            });
            return mutationResult(existing?.directRole ?? null, input.role);
        },
    );
    const revokeUserAccess = vi.fn(
        async (_target: DirectAccessTarget, input: { userUuid: string }) => {
            const existing = rows.find(
                (row) =>
                    row.origin === DirectAccessOrigin.USER &&
                    row.principalUuid === input.userUuid,
            );
            rows = rows.filter(
                (row) =>
                    row.origin !== DirectAccessOrigin.USER ||
                    row.principalUuid !== input.userUuid,
            );
            return mutationResult(existing?.directRole ?? null, null);
        },
    );
    const resetAccess = vi.fn(async () => {
        const revokedUsers = rows.filter(
            ({ origin }) => origin === DirectAccessOrigin.USER,
        ).length;
        const revokedGroups = rows.length - revokedUsers;
        rows = [];
        return {
            organizationId: 1,
            organizationUuid: ORGANIZATION_UUID,
            projectId: 1,
            projectUuid: PROJECT_UUID,
            revokedUsers,
            revokedGroups,
        };
    });
    const adapter: DirectAccessResourceAdapter = {
        auditResourceType: 'Dashboard',
        getTarget,
        getDirectAccessList: vi.fn(async (_target, options) => ({
            data: rows.filter(
                (row) =>
                    !options.principal ||
                    (row.origin === options.principal.origin &&
                        row.principalUuid === options.principal.uuid),
            ),
            ...(options.paginateArgs
                ? {
                      pagination: {
                          ...options.paginateArgs,
                          totalPageCount: rows.length > 0 ? 1 : 0,
                          totalResults: rows.length,
                      },
                  }
                : {}),
        })),
        getGroupRolesForUsers: vi.fn(async () => ({})),
        upsertUserAccess,
        upsertGroupAccess,
        revokeUserAccess,
        revokeGroupAccess: vi.fn(
            async (_target, input: { groupUuid: string }) => {
                const existing = rows.find(
                    (row) =>
                        row.origin === DirectAccessOrigin.GROUP &&
                        row.principalUuid === input.groupUuid,
                );
                rows = rows.filter(
                    (row) =>
                        row.origin !== DirectAccessOrigin.GROUP ||
                        row.principalUuid !== input.groupUuid,
                );
                return mutationResult(existing?.directRole ?? null, null);
            },
        ),
        resetAccess,
    };
    const context = (): AccessContextForCasl => ({
        organizationUuid: ORGANIZATION_UUID,
        projectUuid: PROJECT_UUID,
        inheritsFromOrgOrProject: false,
        directOnly: true,
        admins: [],
        access: actorRole
            ? [
                  {
                      userUuid: ACTOR_UUID,
                      role: actorRole,
                      hasDirectAccess: true,
                      projectRole: undefined,
                      inheritedRole: undefined,
                      inheritedFrom: undefined,
                  },
              ]
            : [],
    });
    const handler = new BaseResourceAccessHandler(
        adapter,
        {
            resolveAccess: vi.fn(async () => context()),
            getSpaceAccessContextForUsers: vi.fn(async () => ({
                ...context(),
                access: [],
            })),
            mergeAdminAccess: vi.fn((accessContext) => accessContext.access),
        },
        { isEnabledForUser: vi.fn(async () => enabled) },
        vi.fn(),
    );

    return {
        handler,
        input: {
            user,
            projectUuid: PROJECT_UUID,
            resourceUuid: RESOURCE_UUID,
        },
        setActorRole: (role) => {
            actorRole = role;
        },
        setEnabled: (value) => {
            enabled = value;
        },
        setEligible: (value) => {
            eligible = value;
        },
        setTargetError: (error) => {
            targetError = error;
        },
        seedUserGrant: (userUuid, role) => {
            rows.push({
                origin: DirectAccessOrigin.USER,
                principalUuid: userUuid,
                firstName: 'Test',
                lastName: 'User',
                email: 'test@example.com',
                isInternal: false,
                directRole: role,
            });
        },
        seedGroupGrant: (groupUuid, role) => {
            rows.push({
                origin: DirectAccessOrigin.GROUP,
                principalUuid: groupUuid,
                name: 'Test group',
                directRole: role,
            });
        },
        calls: {
            getTarget: () => getTarget.mock.calls.length,
            upsertUser: () => upsertUserAccess.mock.calls.length,
            revokeUser: () => revokeUserAccess.mock.calls.length,
            reset: () => resetAccess.mock.calls.length,
        },
    };
};

runResourceAccessHandlerConformance('BaseResourceAccessHandler', createHarness);

test('preserves unknown implementation failures', async () => {
    const harness = createHarness();
    harness.setTargetError(new Error('database unavailable'));

    await expect(harness.handler.listAccess(harness.input)).rejects.toThrow(
        'database unavailable',
    );
});

test('normalizes missing resources', async () => {
    const harness = createHarness();
    harness.setTargetError(new NotFoundError('dashboard missing'));

    await expect(
        harness.handler.listAccess(harness.input),
    ).rejects.toMatchObject({ message: 'Access target not found' });
});
