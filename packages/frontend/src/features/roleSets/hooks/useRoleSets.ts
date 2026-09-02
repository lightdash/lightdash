import {
    CommercialFeatureFlags,
    type ApiError,
    type ApiOrganizationRoleSetResponse,
    type ApiProjectRoleSetResponse,
    type OrganizationRoleSet,
    type ProjectRoleSet,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';

/** Role sets follow the custom-roles gate: instance config or the custom-roles flag. */
export const useMultipleRolesEnabled = (): boolean => {
    const { health } = useApp();
    const flag = useServerFeatureFlag(CommercialFeatureFlags.CustomRoles);
    return (
        health.data?.isCustomRolesEnabled === true ||
        (flag.isSuccess && flag.data.enabled)
    );
};

const ORG_ROLE_SET_KEY = 'organization_user_role_set';
const PROJECT_USER_ROLE_SET_KEY = 'project_user_role_set';
const PROJECT_GROUP_ROLE_SET_KEY = 'project_group_role_set';

export const useOrganizationUserRoleSet = (
    userUuid: string,
    { enabled = true }: { enabled?: boolean } = {},
) => {
    const { user } = useApp();
    const organizationUuid = user.data?.organizationUuid;
    return useQuery<OrganizationRoleSet, ApiError>(
        [ORG_ROLE_SET_KEY, organizationUuid, userUuid],
        async () =>
            await lightdashApi<ApiOrganizationRoleSetResponse['results']>({
                url: `/orgs/${organizationUuid}/roles/assignments/user/${userUuid}/set`,
                version: 'v2',
                method: 'GET',
                body: undefined,
            }),
        { enabled: enabled && !!organizationUuid },
    );
};

export const useProjectUserRoleSet = (
    projectUuid: string,
    userUuid: string,
    { enabled = true }: { enabled?: boolean } = {},
) =>
    useQuery<ProjectRoleSet, ApiError>(
        [PROJECT_USER_ROLE_SET_KEY, projectUuid, userUuid],
        () =>
            lightdashApi<ApiProjectRoleSetResponse['results']>({
                url: `/projects/${projectUuid}/roles/assignments/user/${userUuid}/set`,
                version: 'v2',
                method: 'GET',
                body: undefined,
            }),
        { enabled },
    );

export const useProjectGroupRoleSet = (
    projectUuid: string,
    groupUuid: string,
    { enabled = true }: { enabled?: boolean } = {},
) =>
    useQuery<ProjectRoleSet, ApiError>(
        [PROJECT_GROUP_ROLE_SET_KEY, projectUuid, groupUuid],
        () =>
            lightdashApi<ApiProjectRoleSetResponse['results']>({
                url: `/projects/${projectUuid}/roles/assignments/group/${groupUuid}/set`,
                version: 'v2',
                method: 'GET',
                body: undefined,
            }),
        { enabled },
    );

export const useReplaceOrganizationUserRoleSetMutation = () => {
    const { user } = useApp();
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();
    const organizationUuid = user.data?.organizationUuid;

    return useMutation<
        OrganizationRoleSet,
        ApiError,
        { userUuid: string; roleSet: OrganizationRoleSet }
    >(
        ({ userUuid, roleSet }) => {
            if (!organizationUuid) {
                const notLoaded: ApiError = {
                    status: 'error',
                    error: {
                        name: 'Error',
                        statusCode: 400,
                        message: 'Organization is not loaded yet',
                        data: {},
                    },
                };
                return Promise.reject(notLoaded);
            }
            return lightdashApi<ApiOrganizationRoleSetResponse['results']>({
                url: `/orgs/${organizationUuid}/roles/assignments/user/${userUuid}/set`,
                version: 'v2',
                method: 'PUT',
                body: JSON.stringify(roleSet),
            });
        },
        {
            onSuccess: async (_data, { userUuid }) => {
                await Promise.all([
                    queryClient.invalidateQueries([
                        ORG_ROLE_SET_KEY,
                        organizationUuid,
                        userUuid,
                    ]),
                    queryClient.invalidateQueries([
                        'organization_role_assignments',
                    ]),
                    queryClient.invalidateQueries(['organization_users']),
                    queryClient.refetchQueries(['user']),
                ]);
                showToastSuccess({ title: 'Success! User roles updated.' });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: "Failed to update user's roles",
                    apiError: error,
                });
            },
        },
    );
};

export const useReplaceProjectUserRoleSetMutation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<
        ProjectRoleSet,
        ApiError,
        { userUuid: string; roleSet: ProjectRoleSet }
    >(
        ({ userUuid, roleSet }) =>
            lightdashApi<ApiProjectRoleSetResponse['results']>({
                url: `/projects/${projectUuid}/roles/assignments/user/${userUuid}/set`,
                version: 'v2',
                method: 'PUT',
                body: JSON.stringify(roleSet),
            }),
        {
            onSuccess: async (_data, { userUuid }) => {
                await Promise.all([
                    queryClient.invalidateQueries([
                        PROJECT_USER_ROLE_SET_KEY,
                        projectUuid,
                        userUuid,
                    ]),
                    queryClient.invalidateQueries([
                        'project_role_assignments',
                        projectUuid,
                    ]),
                ]);
                showToastSuccess({
                    title: 'Success! User project roles updated.',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to update user project roles',
                    apiError: error,
                });
            },
        },
    );
};

export const useReplaceProjectGroupRoleSetMutation = (projectUuid: string) => {
    const queryClient = useQueryClient();
    const { showToastSuccess, showToastApiError } = useToaster();

    return useMutation<
        ProjectRoleSet,
        ApiError,
        { groupUuid: string; roleSet: ProjectRoleSet }
    >(
        ({ groupUuid, roleSet }) =>
            lightdashApi<ApiProjectRoleSetResponse['results']>({
                url: `/projects/${projectUuid}/roles/assignments/group/${groupUuid}/set`,
                version: 'v2',
                method: 'PUT',
                body: JSON.stringify(roleSet),
            }),
        {
            onSuccess: async (_data, { groupUuid }) => {
                await Promise.all([
                    queryClient.invalidateQueries([
                        PROJECT_GROUP_ROLE_SET_KEY,
                        projectUuid,
                        groupUuid,
                    ]),
                    queryClient.invalidateQueries([
                        'project_role_assignments',
                        projectUuid,
                    ]),
                    queryClient.invalidateQueries([
                        'projects',
                        projectUuid,
                        'groupAccesses',
                    ]),
                ]);
                showToastSuccess({
                    title: 'Success! Group project roles updated.',
                });
            },
            onError: ({ error }) => {
                showToastApiError({
                    title: 'Failed to update group project roles',
                    apiError: error,
                });
            },
        },
    );
};

/**
 * Set to edit for a row: the fetched set when the row holds extra roles,
 * otherwise the set derived from its primary slot. Editing is blocked until
 * the fetch settles successfully so a partial set is never written back.
 */
export const useResolvedRoleSet = <T extends { systemRole: unknown }>(
    slotSet: T,
    hasMultipleRoles: boolean,
    query: { data: T | undefined; isLoading: boolean; isError: boolean },
): { value: T; isPending: boolean } =>
    useMemo(
        () => ({
            value: hasMultipleRoles && query.data ? query.data : slotSet,
            isPending: hasMultipleRoles && (query.isLoading || query.isError),
        }),
        [slotSet, hasMultipleRoles, query.data, query.isLoading, query.isError],
    );
