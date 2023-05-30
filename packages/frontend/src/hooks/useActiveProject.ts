import {
    QueryClient,
    useMutation,
    useQuery,
    useQueryClient,
} from 'react-query';
import { useParams } from 'react-router-dom';
import { useDefaultProject, useProjects } from './useProjects';

const LAST_PROJECT_KEY = 'lastProject';

export const useActiveProject = () => {
    return useQuery<string | undefined>(
        ['activeProject'],
        () =>
            Promise.resolve(
                localStorage.getItem(LAST_PROJECT_KEY) || undefined,
            ),
        {
            cacheTime: 0,
            refetchOnWindowFocus: false,
            refetchOnMount: false,
            refetchOnReconnect: false,
        },
    );
};

const clearProjectCache = (queryClient: QueryClient) => {
    queryClient.removeQueries(['project']);
    queryClient.removeQueries(['projects']);
    queryClient.invalidateQueries();
};

export const useUpdateActiveProjectMutation = () => {
    const queryClient = useQueryClient();

    return useMutation<void, Error, string>({
        mutationFn: (projectUuid) =>
            Promise.resolve(
                localStorage.setItem(LAST_PROJECT_KEY, projectUuid),
            ),
        onSuccess: () => clearProjectCache(queryClient),
    });
};

export const useDeleteActiveProjectMutation = () => {
    const queryClient = useQueryClient();

    return useMutation<void, Error>({
        mutationFn: () =>
            Promise.resolve(localStorage.removeItem(LAST_PROJECT_KEY)),
        onSuccess: () => clearProjectCache(queryClient),
    });
};

export const useActiveProjectUuid = () => {
    const params = useParams<{ projectUuid?: string }>();
    const { data: projects, isLoading: isLoadingProjects } = useProjects();
    const { data: defaultProject, isLoading: isLoadingDefaultProject } =
        useDefaultProject();
    const { data: lastProjectUuid, isLoading: isLoadingLastProject } =
        useActiveProject();

    if (isLoadingProjects || isLoadingDefaultProject || isLoadingLastProject) {
        return {
            isLoading: true,
            activeProjectUuid: undefined,
        };
    }

    const lastProject = projects?.find(
        (project) => project.projectUuid === lastProjectUuid,
    );

    return {
        isLoading: false,
        activeProjectUuid:
            params.projectUuid ||
            lastProject?.projectUuid ||
            defaultProject?.projectUuid,
    };
};
