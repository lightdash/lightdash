import { Ability } from '@casl/ability';
import {
    defineUserAbility,
    OrganizationMemberRole,
    ProjectMemberRole,
    SpaceMemberRole,
    type Document,
    type PossibleAbilities,
} from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { useCanEditDocument } from './useCanEditDocument';

const mocks = vi.hoisted(() => ({
    spaceRole: undefined as SpaceMemberRole | undefined,
    inherits: false,
    canUpdate: true,
    hasUser: true,
    authoringEnabled: true,
    organizationRole: undefined as OrganizationMemberRole | undefined,
}));
vi.mock('../../hooks/useContentAuthoringEnabled', () => ({
    useContentAuthoringEnabled: () => mocks.authoringEnabled,
}));
vi.mock('../../hooks/useSpaces', () => ({
    useSpaceSummaries: () => ({
        data:
            mocks.spaceRole || mocks.inherits
                ? [
                      {
                          uuid: 'space',
                          inheritsFromOrgOrProject: mocks.inherits,
                          userAccess: mocks.spaceRole
                              ? { userUuid: 'user', role: mocks.spaceRole }
                              : undefined,
                      },
                  ]
                : [],
    }),
}));
vi.mock('../../providers/App/useApp', () => ({
    default: () => ({
        user: {
            data: mocks.hasUser
                ? {
                      userUuid: 'user',
                      ability: mocks.organizationRole
                          ? defineUserAbility(
                                {
                                    role: mocks.organizationRole,
                                    userUuid: 'user',
                                    organizationUuid: 'org',
                                    roleUuid: undefined,
                                },
                                [
                                    {
                                        projectUuid: 'project',
                                        userUuid: 'user',
                                        role:
                                            mocks.organizationRole ===
                                            OrganizationMemberRole.EDITOR
                                                ? ProjectMemberRole.EDITOR
                                                : ProjectMemberRole.VIEWER,
                                        roleUuid: undefined,
                                    },
                                ],
                            )
                          : new Ability<PossibleAbilities>(
                                mocks.canUpdate
                                    ? [
                                          {
                                              action: 'update',
                                              subject: 'Document',
                                              conditions: {
                                                  projectUuid: 'project',
                                                  access: {
                                                      $elemMatch: {
                                                          userUuid: 'user',
                                                          role: {
                                                              $in: [
                                                                  'editor',
                                                                  'admin',
                                                              ],
                                                          },
                                                      },
                                                  },
                                              },
                                          },
                                          {
                                              action: 'update',
                                              subject: 'Document',
                                              conditions: {
                                                  projectUuid: 'project',
                                                  inheritsFromOrgOrProject: true,
                                              },
                                          },
                                      ]
                                    : [],
                            ),
                  }
                : undefined,
        },
    }),
}));

const document: Document = {
    documentUuid: 'document',
    projectUuid: 'project',
    organizationUuid: 'org',
    spaceUuid: 'space',
    name: 'Report',
    slug: 'report',
    description: '',
    createdByUserUuid: 'user',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    version: {
        versionUuid: 'version',
        versionNumber: 1,
        schemaVersion: 1,
        content: { cells: [] },
        createdByUserUuid: 'user',
        createdAt: new Date('2026-01-01'),
    },
};

describe('Document editing affordance', () => {
    beforeEach(() => {
        mocks.spaceRole = undefined;
        mocks.inherits = false;
        mocks.canUpdate = true;
        mocks.hasUser = true;
        mocks.authoringEnabled = true;
        mocks.organizationRole = undefined;
    });

    it.each([
        [OrganizationMemberRole.VIEWER, false],
        [OrganizationMemberRole.EDITOR, true],
        [OrganizationMemberRole.ADMIN, true],
    ] as const)(
        'uses real inherited organization %s abilities',
        (role, allowed) => {
            mocks.organizationRole = role;
            mocks.inherits = true;
            mocks.spaceRole =
                role === OrganizationMemberRole.VIEWER
                    ? SpaceMemberRole.VIEWER
                    : SpaceMemberRole.EDITOR;
            const { result } = renderHook(() => useCanEditDocument(document));
            expect(result.current).toBe(allowed);
        },
    );

    it('uses real direct editor abilities for an interactive viewer', () => {
        mocks.organizationRole = OrganizationMemberRole.INTERACTIVE_VIEWER;
        const { result } = renderHook(() =>
            useCanEditDocument({
                ...document,
                directAccessRoles: [SpaceMemberRole.EDITOR],
            }),
        );
        expect(result.current).toBe(true);
    });

    it('does not grant a basic viewer missing authoring capability via direct editor access', () => {
        mocks.organizationRole = OrganizationMemberRole.VIEWER;
        const { result } = renderHook(() =>
            useCanEditDocument({
                ...document,
                directAccessRoles: [SpaceMemberRole.EDITOR],
            }),
        );
        expect(result.current).toBe(false);
    });

    it.each([
        [SpaceMemberRole.VIEWER, false],
        [SpaceMemberRole.EDITOR, true],
        [SpaceMemberRole.ADMIN, true],
    ] as const)('uses inherited Space %s access', (role, allowed) => {
        mocks.spaceRole = role;
        const { result } = renderHook(() => useCanEditDocument(document));
        expect(result.current).toBe(allowed);
    });

    it.each([
        [SpaceMemberRole.VIEWER, false],
        [SpaceMemberRole.EDITOR, true],
        [SpaceMemberRole.ADMIN, true],
    ] as const)(
        'uses direct %s grants without access to the private Space',
        (role, allowed) => {
            const { result } = renderHook(() =>
                useCanEditDocument({ ...document, directAccessRoles: [role] }),
            );
            expect(result.current).toBe(allowed);
        },
    );

    it('allows project-inherited editing capability', () => {
        mocks.inherits = true;
        const { result } = renderHook(() => useCanEditDocument(document));
        expect(result.current).toBe(true);
    });

    it('does not treat inaccessible Spaces as project-inherited', () => {
        const { result } = renderHook(() => useCanEditDocument(document));
        expect(result.current).toBe(false);
    });

    it.each(['capability', 'mobile', 'user'])(
        'denies editing without %s support',
        (restriction) => {
            mocks.canUpdate = restriction !== 'capability';
            mocks.authoringEnabled = restriction !== 'mobile';
            mocks.hasUser = restriction !== 'user';
            const { result } = renderHook(() =>
                useCanEditDocument({
                    ...document,
                    directAccessRoles: [SpaceMemberRole.ADMIN],
                }),
            );
            expect(result.current).toBe(false);
        },
    );

    it('does not carry editing capability across projects', () => {
        const { result } = renderHook(() =>
            useCanEditDocument({
                ...document,
                projectUuid: 'other',
                directAccessRoles: [SpaceMemberRole.EDITOR],
            }),
        );
        expect(result.current).toBe(false);
    });
});
