import {
    type ApiError,
    type Role,
    type RoleAssignment,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';
import useApp from '../providers/App/useApp';
import useQueryError from './useQueryError';

export const useOrganizationRoles = (loadScopes?: boolean) => {
    const { user } = useApp();
    const setErrorResponse = useQueryError();

    return useQuery<Role[], ApiError>(
        ['organization_roles', user.data?.organizationUuid, loadScopes],
        () => {
            if (!user.data?.organizationUuid) {
                throw new Error('Organization UUID is required');
            }
            const params = loadScopes ? '?load=scopes' : '';
            return lightdashApi({
                url: `/orgs/${user.data.organizationUuid}/roles${params}`,
                version: 'v2',
                method: 'GET',
                body: undefined,
            });
        },
        {
            enabled: !!user.data?.organizationUuid,
            onError: (result: ApiError) => setErrorResponse(result),
        },
    );
};

export const useOrganizationRoleAssignments = () => {
    const { user } = useApp();
    const setErrorResponse = useQueryError();

    return useQuery<RoleAssignment[], ApiError>(
        ['organization_role_assignments', user.data?.organizationUuid],
        () => {
            if (!user.data?.organizationUuid) {
                throw new Error('Organization UUID is required');
            }
            return lightdashApi({
                url: `/orgs/${user.data.organizationUuid}/roles/assignments`,
                version: 'v2',
                method: 'GET',
                body: undefined,
            });
        },
        {
            enabled: !!user.data?.organizationUuid,
            onError: (result: ApiError) => setErrorResponse(result),
        },
    );
};
