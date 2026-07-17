import { ProjectMemberRole } from '../../types/projectMemberRole';
import {
    convertOrganizationRoleToProjectRole,
    convertProjectRoleToSpaceRole,
} from '../../utils/projectMemberRole';
import { PROJECT_ROLE_TO_SCOPES_MAP } from '../roleToScopeMapping';
import {
    getOrganizationRoleForSpaceAccess,
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
