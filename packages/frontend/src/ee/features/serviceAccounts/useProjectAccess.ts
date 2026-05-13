import {
    type ApiError,
    type CreateServiceAccountProjectAccess,
    type ProjectMemberRole,
    type ServiceAccountProjectGrant,
    type UpdateServiceAccountProjectAccess,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';
import useToaster from '../../../hooks/toaster/useToaster';

// Per-SA grants are fetched once at expand time. Mutations (grant / update
// role / revoke) hit project-scoped endpoints but invalidate this key so the
// expanded panel re-renders against fresh data without an extra round-trip.
const SA_GRANTS_KEY = 'service-account-project-grants';

const fetchGrantsForServiceAccount = (serviceAccountUuid: string) =>
    lightdashApi<ServiceAccountProjectGrant[]>({
        method: 'GET',
        url: `/service-accounts/${serviceAccountUuid}/projects`,
    });

const grant = (projectUuid: string, body: CreateServiceAccountProjectAccess) =>
    lightdashApi<undefined>({
        method: 'POST',
        url: `/projects/${projectUuid}/access/service-accounts`,
        body: JSON.stringify(body),
    });

const updateRole = (
    projectUuid: string,
    serviceAccountUuid: string,
    body: UpdateServiceAccountProjectAccess,
) =>
    lightdashApi<undefined>({
        method: 'PATCH',
        url: `/projects/${projectUuid}/access/service-accounts/${serviceAccountUuid}`,
        body: JSON.stringify(body),
    });

const revoke = (projectUuid: string, serviceAccountUuid: string) =>
    lightdashApi<undefined>({
        method: 'DELETE',
        url: `/projects/${projectUuid}/access/service-accounts/${serviceAccountUuid}`,
    });

/**
 * List the project grants for a single service account.
 *
 * Powers the org SA list's inline expand panel. One query per SA on
 * expand — cheap and bounded by user interaction.
 */
export const useServiceAccountProjectGrants = (serviceAccountUuid: string) =>
    useQuery<ServiceAccountProjectGrant[], ApiError>({
        queryKey: [SA_GRANTS_KEY, serviceAccountUuid],
        queryFn: () => fetchGrantsForServiceAccount(serviceAccountUuid),
        enabled: !!serviceAccountUuid,
    });

// Mutation hooks operate on a `(serviceAccountUuid, projectUuid)` pair. The
// backend keeps the write routes project-scoped (URL is `/projects/:p/...`)
// so the SA's `projectUuid` must be passed explicitly per call.
type MutateArgs = { serviceAccountUuid: string; projectUuid: string };

const invalidateOnGrantChange = (
    queryClient: ReturnType<typeof useQueryClient>,
    serviceAccountUuid: string,
) => {
    // Refresh the expanded panel for this SA.
    void queryClient.invalidateQueries([SA_GRANTS_KEY, serviceAccountUuid]);
    // The SA list shows the project count in the Access column.
    void queryClient.invalidateQueries(['service-accounts']);
};

export const useGrantServiceAccountProjectAccess = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        undefined,
        ApiError,
        MutateArgs & { role: ProjectMemberRole }
    >({
        mutationFn: ({ serviceAccountUuid, projectUuid, role }) =>
            grant(projectUuid, {
                serviceAccountUuid,
                role,
            } satisfies CreateServiceAccountProjectAccess),
        onSuccess: async (_, { serviceAccountUuid }) => {
            invalidateOnGrantChange(queryClient, serviceAccountUuid);
            showToastSuccess({ title: 'Project added' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to add project',
                apiError: error,
            });
        },
    });
};

export const useUpdateServiceAccountProjectAccess = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<
        undefined,
        ApiError,
        MutateArgs & { role: ProjectMemberRole }
    >({
        mutationFn: ({ serviceAccountUuid, projectUuid, role }) =>
            updateRole(projectUuid, serviceAccountUuid, {
                role,
            } satisfies UpdateServiceAccountProjectAccess),
        onSuccess: async (_, { serviceAccountUuid }) => {
            invalidateOnGrantChange(queryClient, serviceAccountUuid);
            showToastSuccess({ title: 'Role updated' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to update role',
                apiError: error,
            });
        },
    });
};

export const useRevokeServiceAccountProjectAccess = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<undefined, ApiError, MutateArgs>({
        mutationFn: ({ projectUuid, serviceAccountUuid }) =>
            revoke(projectUuid, serviceAccountUuid),
        onSuccess: async (_, { serviceAccountUuid }) => {
            invalidateOnGrantChange(queryClient, serviceAccountUuid);
            showToastSuccess({ title: 'Project removed' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to remove project',
                apiError: error,
            });
        },
    });
};
