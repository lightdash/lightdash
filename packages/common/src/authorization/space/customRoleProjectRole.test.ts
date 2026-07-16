import { ProjectMemberRole } from '../../types/projectMemberRole';
import { convertProjectRoleToSpaceRole } from '../../utils/projectMemberRole';
import { PROJECT_ROLE_TO_SCOPES_MAP } from '../roleToScopeMapping';
import { getProjectRoleForSpaceAccess } from './customRoleProjectRole';

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
