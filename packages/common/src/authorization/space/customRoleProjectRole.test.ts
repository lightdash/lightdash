import { OrganizationMemberRole } from '../../types/organizationMemberProfile';
import { ProjectMemberRole } from '../../types/projectMemberRole';
import {
    convertOrganizationRoleToProjectRole,
    convertProjectRoleToSpaceRole,
} from '../../utils/projectMemberRole';
import { PROJECT_ROLE_TO_SCOPES_MAP } from '../roleToScopeMapping';
import {
    getOrganizationRoleForRoleSetSpaceAccess,
    getOrganizationRoleForSpaceAccess,
    getProjectRoleForRoleSetSpaceAccess,
    getProjectRoleForSpaceAccess,
} from './customRoleProjectRole';

describe('getProjectRoleForSpaceAccess', () => {
    it.each(Object.values(ProjectMemberRole))(
        'derives the same inherited space role as the system role %s it was duplicated from',
        (role) => {
            const derivedRole = getProjectRoleForSpaceAccess([
                ...PROJECT_ROLE_TO_SCOPES_MAP[role],
            ]);
            expect(convertProjectRoleToSpaceRole(derivedRole)).toEqual(
                convertProjectRoleToSpaceRole(role),
            );
        },
    );
});

describe('getOrganizationRoleForSpaceAccess', () => {
    it.each(Object.values(ProjectMemberRole))(
        'org derivation converts to the same project role as the direct derivation for %s scopes',
        (role) => {
            const scopes = [...PROJECT_ROLE_TO_SCOPES_MAP[role]];
            expect(
                convertOrganizationRoleToProjectRole(
                    getOrganizationRoleForSpaceAccess(scopes),
                ),
            ).toEqual(getProjectRoleForSpaceAccess(scopes));
        },
    );
});

describe('role-set space access derivation', () => {
    it('keeps the system role when extras add nothing higher', () => {
        expect(
            getProjectRoleForRoleSetSpaceAccess({
                systemRole: ProjectMemberRole.EDITOR,
                customRoleScopes: ['view:Dashboard'],
            }),
        ).toBe(ProjectMemberRole.EDITOR);
    });
    it('raises to the derived role when extras grant more', () => {
        expect(
            getProjectRoleForRoleSetSpaceAccess({
                systemRole: ProjectMemberRole.VIEWER,
                customRoleScopes: ['manage:Space'],
            }),
        ).toBe(ProjectMemberRole.ADMIN);
    });
    it('derives from scopes alone for custom-only sets', () => {
        expect(
            getProjectRoleForRoleSetSpaceAccess({
                systemRole: null,
                customRoleScopes: ['manage:Space@public'],
            }),
        ).toBe(ProjectMemberRole.EDITOR);
        expect(
            getOrganizationRoleForRoleSetSpaceAccess({
                systemRole: null,
                customRoleScopes: [],
            }),
        ).toBe(OrganizationMemberRole.VIEWER);
    });
    it('never lowers an organization system role', () => {
        expect(
            getOrganizationRoleForRoleSetSpaceAccess({
                systemRole: OrganizationMemberRole.DEVELOPER,
                customRoleScopes: ['manage:Space@public'],
            }),
        ).toBe(OrganizationMemberRole.DEVELOPER);
        expect(
            getOrganizationRoleForRoleSetSpaceAccess({
                systemRole: OrganizationMemberRole.MEMBER,
                customRoleScopes: ['manage:Space'],
            }),
        ).toBe(OrganizationMemberRole.ADMIN);
    });
});
