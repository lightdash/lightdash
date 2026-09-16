import { Ability } from '@casl/ability';
import { SpaceMemberRole, type PossibleAbilities } from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { useCanDeleteDocument } from './useCanDeleteDocument';

const mocks = vi.hoisted(() => ({
    spaceRole: undefined as SpaceMemberRole | undefined,
    inherits: false,
    canDelete: true,
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
            data: {
                userUuid: 'user',
                ability: new Ability<PossibleAbilities>(
                    mocks.canDelete
                        ? [
                              {
                                  action: 'delete',
                                  subject: 'Document',
                                  conditions: {
                                      projectUuid: 'project',
                                      access: {
                                          $elemMatch: {
                                              userUuid: 'user',
                                              role: {
                                                  $in: ['editor', 'admin'],
                                              },
                                          },
                                      },
                                  },
                              },
                              {
                                  action: 'delete',
                                  subject: 'Document',
                                  conditions: {
                                      projectUuid: 'project',
                                      inheritsFromOrgOrProject: true,
                                  },
                              },
                          ]
                        : [],
                ),
            },
        },
    }),
}));

const target = {
    projectUuid: 'project',
    organizationUuid: 'org',
    spaceUuid: 'space',
};

describe('Document deletion affordance', () => {
    beforeEach(() => {
        mocks.spaceRole = undefined;
        mocks.inherits = false;
        mocks.canDelete = true;
    });

    it.each([
        [SpaceMemberRole.VIEWER, false],
        [SpaceMemberRole.EDITOR, false],
        [SpaceMemberRole.ADMIN, true],
    ] as const)('requires Full access for direct %s grant', (role, allowed) => {
        const { result } = renderHook(() =>
            useCanDeleteDocument({ ...target, directAccessRoles: [role] }),
        );
        expect(result.current).toBe(allowed);
    });

    it('does not let a tagged editor access entry bypass the full-access requirement', () => {
        const { result } = renderHook(() =>
            useCanDeleteDocument({
                ...target,
                access: [
                    {
                        userUuid: 'user',
                        role: SpaceMemberRole.EDITOR,
                        grantedVia: 'document',
                        hasDirectAccess: true,
                        projectRole: undefined,
                        inheritedRole: undefined,
                        inheritedFrom: undefined,
                    },
                ],
            }),
        );
        expect(result.current).toBe(false);
    });

    it('preserves inherited Space editor access', () => {
        mocks.spaceRole = SpaceMemberRole.EDITOR;
        const { result } = renderHook(() => useCanDeleteDocument(target));
        expect(result.current).toBe(true);
    });

    it('preserves project-inherited access', () => {
        mocks.inherits = true;
        const { result } = renderHook(() => useCanDeleteDocument(target));
        expect(result.current).toBe(true);
    });

    it('does not grant missing base capabilities', () => {
        mocks.canDelete = false;
        const { result } = renderHook(() =>
            useCanDeleteDocument({
                ...target,
                directAccessRoles: [SpaceMemberRole.ADMIN],
            }),
        );
        expect(result.current).toBe(false);
    });

    it('does not carry permissions across projects', () => {
        const { result } = renderHook(() =>
            useCanDeleteDocument({
                ...target,
                projectUuid: 'other',
                directAccessRoles: [SpaceMemberRole.ADMIN],
            }),
        );
        expect(result.current).toBe(false);
    });
});
