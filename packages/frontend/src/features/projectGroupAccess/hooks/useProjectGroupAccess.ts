import {
    CreateProjectGroupAccess,
    DeleteProjectGroupAccess,
    LightdashError,
    ProjectGroupAccess,
} from '@lightdash/common';
import { useMutation, useQuery } from 'react-query';
import {
    addProjectGroupAccess,
    getProjectGroupAccesses,
    removeProjectGroupAccess,
} from '../api/projectGroupAccessApi';

export function useProjectGroupAccesses(projectUuid: string) {
    return useQuery<ProjectGroupAccess[], LightdashError>({
        queryKey: ['projects', projectUuid, 'groupAccesses'],
        queryFn: () => getProjectGroupAccesses(projectUuid),
    });
}

export function useAddProjectGroupAccessMutation() {
    return useMutation<
        ProjectGroupAccess,
        LightdashError,
        CreateProjectGroupAccess
    >({
        mutationFn: ({ groupUuid, projectUuid, role }) =>
            addProjectGroupAccess({ groupUuid, projectUuid, role }),
    });
}

export function useRemoveProjectGroupAccessMutation() {
    return useMutation<undefined, LightdashError, DeleteProjectGroupAccess>({
        mutationFn: ({ groupUuid, projectUuid }) =>
            removeProjectGroupAccess({ groupUuid, projectUuid }),
    });
}
