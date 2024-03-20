import {
    type CreateProjectGroupAccess,
    type DeleteProjectGroupAccess,
    type LightdashError,
    type ProjectGroupAccess,
    type UpdateProjectGroupAccess,
} from '@lightdash/common';
import {
    useMutation,
    useQuery,
    useQueryClient,
    type UseQueryOptions,
} from '@tanstack/react-query';
import {
    addProjectGroupAccess,
    getProjectGroupAccessList,
    removeProjectGroupAccess,
    updateProjectGroupAccess,
} from '../api/projectGroupAccessApi';

export function useProjectGroupAccessList(
    projectUuid: string,
    useQueryOptions?: UseQueryOptions<ProjectGroupAccess[], LightdashError>,
) {
    return useQuery<ProjectGroupAccess[], LightdashError>({
        queryKey: ['projects', projectUuid, 'groupAccesses'],
        queryFn: () => getProjectGroupAccessList(projectUuid),
        ...useQueryOptions,
    });
}

export function useAddProjectGroupAccessMutation() {
    const queryClient = useQueryClient();

    return useMutation<
        ProjectGroupAccess,
        LightdashError,
        CreateProjectGroupAccess
    >({
        mutationFn: ({ groupUuid, projectUuid, role }) =>
            addProjectGroupAccess({ groupUuid, projectUuid, role }),
        onSuccess: async (_data, { projectUuid }) => {
            await queryClient.invalidateQueries([
                'projects',
                projectUuid,
                'groupAccesses',
            ]);
        },
    });
}

export function useUpdateProjectGroupAccessMutation() {
    const queryClient = useQueryClient();

    return useMutation<
        ProjectGroupAccess,
        LightdashError,
        UpdateProjectGroupAccess
    >({
        mutationFn: ({ groupUuid, projectUuid, role }) =>
            updateProjectGroupAccess({ groupUuid, projectUuid, role }),
        onSuccess: async (_data, { projectUuid }) => {
            await queryClient.invalidateQueries([
                'projects',
                projectUuid,
                'groupAccesses',
            ]);
        },
    });
}

export function useRemoveProjectGroupAccessMutation() {
    const queryClient = useQueryClient();

    return useMutation<null, LightdashError, DeleteProjectGroupAccess>({
        mutationFn: ({ groupUuid, projectUuid }) =>
            removeProjectGroupAccess({ groupUuid, projectUuid }),
        onSuccess: async (_data, { projectUuid }) => {
            await queryClient.invalidateQueries([
                'projects',
                projectUuid,
                'groupAccesses',
            ]);
        },
    });
}
