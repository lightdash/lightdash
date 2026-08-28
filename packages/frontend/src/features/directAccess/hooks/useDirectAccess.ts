import {
    CommercialFeatureFlags,
    type ApiError,
    type DirectAccessAssignment,
    type DirectAccessPrincipalType,
    type SpaceMemberRole,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import useToaster from '../../../hooks/toaster/useToaster';
import { invalidateContent } from '../../../hooks/useContent';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import {
    getDirectAccessAssignments,
    resetDirectAccess,
    revokeDirectAccessAssignment,
    upsertDirectAccessAssignment,
    type DirectAccessResourceRef,
} from '../api';

const directAccessQueryKey = (
    projectUuid: string,
    ref: DirectAccessResourceRef,
) => ['direct-access', projectUuid, ref.resourceType, ref.resourceUuid];

/**
 * Direct access mirrors the backend gate: the commercial flag plus a valid
 * license. Everything the feature renders should hide behind this.
 */
export const useDirectAccessAvailability = () => {
    const { health } = useApp();
    const flagQuery = useServerFeatureFlag(CommercialFeatureFlags.DirectAccess);
    const licenseValid = health.data?.license?.valid ?? false;
    return {
        isAvailable: (flagQuery.data?.enabled ?? false) && licenseValid,
        isLoading: flagQuery.isInitialLoading || health.isInitialLoading,
    };
};

export const useDirectAccessAssignments = (
    projectUuid: string,
    ref: DirectAccessResourceRef,
    queryOptions?: UseQueryOptions<DirectAccessAssignment[], ApiError>,
) =>
    useQuery<DirectAccessAssignment[], ApiError>({
        queryKey: directAccessQueryKey(projectUuid, ref),
        queryFn: () => getDirectAccessAssignments(projectUuid, ref),
        retry: false,
        ...queryOptions,
    });

const useInvalidateAfterDirectAccessMutation = (
    projectUuid: string,
    ref: DirectAccessResourceRef,
) => {
    const queryClient = useQueryClient();
    return async () => {
        // Grants change what discovery surfaces return for the affected
        // users; refresh the policy plus every consumer of it.
        await Promise.all([
            queryClient.invalidateQueries(
                directAccessQueryKey(projectUuid, ref),
            ),
            queryClient.invalidateQueries(['favorites']),
            invalidateContent(queryClient, projectUuid),
        ]);
    };
};

export type UpsertDirectAccessArgs = {
    principalType: DirectAccessPrincipalType;
    principalUuid: string;
    role: SpaceMemberRole;
};

export const useUpsertDirectAccessAssignment = (
    projectUuid: string,
    ref: DirectAccessResourceRef,
) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const invalidate = useInvalidateAfterDirectAccessMutation(projectUuid, ref);
    return useMutation<unknown, ApiError, UpsertDirectAccessArgs>({
        mutationFn: ({ principalType, principalUuid, role }) =>
            upsertDirectAccessAssignment(
                projectUuid,
                ref,
                principalType,
                principalUuid,
                role,
            ),
        onSuccess: async () => {
            await invalidate();
            showToastSuccess({ title: 'Access updated' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to update access',
                apiError: error,
            });
        },
    });
};

export type RevokeDirectAccessArgs = {
    principalType: DirectAccessPrincipalType;
    principalUuid: string;
};

export const useRevokeDirectAccessAssignment = (
    projectUuid: string,
    ref: DirectAccessResourceRef,
) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const invalidate = useInvalidateAfterDirectAccessMutation(projectUuid, ref);
    return useMutation<unknown, ApiError, RevokeDirectAccessArgs>({
        mutationFn: ({ principalType, principalUuid }) =>
            revokeDirectAccessAssignment(
                projectUuid,
                ref,
                principalType,
                principalUuid,
            ),
        onSuccess: async () => {
            await invalidate();
            showToastSuccess({ title: 'Access removed' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to remove access',
                apiError: error,
            });
        },
    });
};

export const useResetDirectAccess = (
    projectUuid: string,
    ref: DirectAccessResourceRef,
) => {
    const { showToastSuccess, showToastApiError } = useToaster();
    const invalidate = useInvalidateAfterDirectAccessMutation(projectUuid, ref);
    return useMutation<unknown, ApiError, void>({
        mutationFn: () => resetDirectAccess(projectUuid, ref),
        onSuccess: async () => {
            await invalidate();
            showToastSuccess({ title: 'All access removed' });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to remove access',
                apiError: error,
            });
        },
    });
};
