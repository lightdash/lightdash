import {
    type ApiError,
    type JiraInstallation,
    type JiraInstallUrl,
    type JiraIssueType,
    type JiraOAuthCredentials,
    type JiraProject,
    type JiraSite,
} from '@lightdash/common'; // pragma: allowlist secret
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api'; // pragma: allowlist secret
import useToaster from '../../../../hooks/toaster/useToaster';

const INSTALLATION_KEY = ['jira_installation'];
const SITES_KEY = ['jira_sites'];
const PROJECTS_KEY = ['jira_projects'];
const ISSUE_TYPES_KEY = ['jira_issue_types'];

const useJiraQueryError = () => {
    const { showToastApiError } = useToaster();
    return (title: string) =>
        ({ error }: ApiError) => {
            if (error.statusCode === 404 || error.statusCode === 401) return;
            showToastApiError({ title, apiError: error });
        };
};

export const useJiraInstallation = (options?: { enabled?: boolean }) => {
    const queryError = useJiraQueryError();
    return useQuery<JiraInstallation, ApiError>({
        queryKey: INSTALLATION_KEY,
        queryFn: () =>
            lightdashApi<JiraInstallation>({
                url: '/jira/',
                method: 'GET',
                body: undefined,
            }),
        retry: false,
        enabled: options?.enabled ?? true,
        onError: queryError('Failed to get Jira installation'),
    });
};

export const useInstallJira = () => {
    const { showToastApiError } = useToaster();
    return useMutation<JiraInstallUrl, ApiError, JiraOAuthCredentials>({
        mutationFn: (credentials) =>
            lightdashApi<JiraInstallUrl>({
                url: '/jira/install',
                method: 'POST',
                body: JSON.stringify(credentials),
            }),
        onSuccess: ({ installUrl }) => {
            window.location.assign(installUrl);
        },
        onError: ({ error }) =>
            showToastApiError({
                title: 'Failed to connect Jira',
                apiError: error,
            }),
    });
};

export const useJiraSites = (options?: { enabled?: boolean }) => {
    const queryError = useJiraQueryError();
    return useQuery<JiraSite[], ApiError>({
        queryKey: SITES_KEY,
        queryFn: () =>
            lightdashApi<JiraSite[]>({
                url: '/jira/sites',
                method: 'GET',
                body: undefined,
            }),
        retry: false,
        enabled: options?.enabled ?? true,
        onError: queryError('Failed to get Jira sites'),
    });
};

export const useSelectJiraSite = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<JiraInstallation, ApiError, string>({
        mutationFn: (siteId) =>
            lightdashApi<JiraInstallation>({
                url: '/jira/site',
                method: 'PUT',
                body: JSON.stringify({ siteId }),
            }),
        onSuccess: async (installation) => {
            queryClient.setQueryData(INSTALLATION_KEY, installation);
            await queryClient.invalidateQueries(PROJECTS_KEY);
            showToastSuccess({ title: 'Jira site selected' });
        },
        onError: ({ error }) =>
            showToastApiError({
                title: 'Failed to select Jira site',
                apiError: error,
            }),
    });
};

export const useJiraProjects = (options?: { enabled?: boolean }) => {
    const queryError = useJiraQueryError();
    return useQuery<JiraProject[], ApiError>({
        queryKey: PROJECTS_KEY,
        queryFn: () =>
            lightdashApi<JiraProject[]>({
                url: '/jira/projects',
                method: 'GET',
                body: undefined,
            }),
        retry: false,
        enabled: options?.enabled ?? true,
        onError: queryError('Failed to get Jira projects'),
    });
};

export const useJiraIssueTypes = (options: {
    projectId: string | null;
    enabled?: boolean;
}) => {
    const queryError = useJiraQueryError();
    return useQuery<JiraIssueType[], ApiError>({
        queryKey: [...ISSUE_TYPES_KEY, options.projectId],
        queryFn: () =>
            lightdashApi<JiraIssueType[]>({
                url: `/jira/issue-types?projectId=${encodeURIComponent(
                    options.projectId!,
                )}`,
                method: 'GET',
                body: undefined,
            }),
        retry: false,
        enabled: !!options.projectId && (options.enabled ?? true),
        onError: queryError('Failed to get Jira issue types'),
    });
};

export const useDeleteJiraInstallation = () => {
    const queryClient = useQueryClient();
    const { showToastApiError, showToastSuccess } = useToaster();
    return useMutation<void, ApiError, void>({
        mutationFn: () =>
            lightdashApi<undefined>({
                url: '/jira/uninstall',
                method: 'DELETE',
                body: undefined,
            }),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries(INSTALLATION_KEY),
                queryClient.invalidateQueries(SITES_KEY),
                queryClient.invalidateQueries(PROJECTS_KEY),
                queryClient.invalidateQueries(ISSUE_TYPES_KEY),
            ]);
            showToastSuccess({
                title: 'Success! Jira integration was deleted.',
            });
        },
        onError: ({ error }) =>
            showToastApiError({
                title: 'Failed to delete Jira integration',
                apiError: error,
            }),
    });
};
