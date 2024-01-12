import {
    CreateProjectGroupAccess,
    DeleteProjectGroupAccess,
    LightdashError,
    ProjectGroupAccess,
    UpdateProjectGroupAccess,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    addProjectGroupAccess,
    getProjectGroupAccessList,
    removeProjectGroupAccess,
    updateProjectGroupAccess,
} from '../api/projectGroupAccessApi';

export function useProjectGroupAccessList(projectUuid: string) {
    return useQuery<ProjectGroupAccess[], LightdashError>({
        queryKey: ['projects', projectUuid, 'groupAccesses'],
        queryFn: () => getProjectGroupAccessList(projectUuid),
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
        onSuccess: (_data, { projectUuid }) => {
            queryClient.invalidateQueries([
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
        onSuccess: (_data, { projectUuid }) => {
            queryClient.invalidateQueries([
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
        onSuccess: (_data, { projectUuid }) => {
            queryClient.invalidateQueries([
                'projects',
                projectUuid,
                'groupAccesses',
            ]);
        },
    });
}
