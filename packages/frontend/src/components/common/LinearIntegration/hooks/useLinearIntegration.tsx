import {
    type ApiError,
    type LinearInstallation,
    type LinearProject,
    type LinearTeam,
} from '@lightdash/common'; // pragma: allowlist secret
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api'; // pragma: allowlist secret
import useToaster from '../../../../hooks/toaster/useToaster';
import i18n from '../../../../i18n/i18n';

const LINEAR_INSTALLATION_QUERY_KEY = ['linear_installation'];
const LINEAR_TEAMS_QUERY_KEY = ['linear_teams'];
const LINEAR_PROJECTS_QUERY_KEY = ['linear_projects'];

const getLinearInstallation = async (): Promise<LinearInstallation> =>
    lightdashApi<LinearInstallation>({
        // pragma: allowlist secret
        url: `/linear/`,
        method: 'GET',
        body: undefined,
    });

export const useLinearInstallation = (options?: { enabled?: boolean }) => {
    const { showToastApiError } = useToaster();

    return useQuery<LinearInstallation, ApiError>({
        queryKey: LINEAR_INSTALLATION_QUERY_KEY,
        queryFn: getLinearInstallation,
        retry: false,
        enabled: options?.enabled ?? true,
        onError: ({ error }) => {
            if (error.statusCode === 404 || error.statusCode === 401) return;

            showToastApiError({
                title: i18n.t('linearIntegration.fetchInstallationFailed', {
                    ns: 'commonUi',
                }),
                apiError: error,
            });
        },
    });
};

const getLinearTeams = async (): Promise<LinearTeam[]> =>
    lightdashApi<LinearTeam[]>({
        // pragma: allowlist secret
        url: `/linear/teams`,
        method: 'GET',
        body: undefined,
    });

export const useLinearTeams = (options?: { enabled?: boolean }) => {
    const { showToastApiError } = useToaster();

    return useQuery<LinearTeam[], ApiError>({
        queryKey: LINEAR_TEAMS_QUERY_KEY,
        queryFn: getLinearTeams,
        retry: false,
        enabled: options?.enabled ?? true,
        onError: ({ error }) => {
            if (error.statusCode === 404 || error.statusCode === 401) return;

            showToastApiError({
                title: i18n.t('linearIntegration.fetchTeamsFailed', {
                    ns: 'commonUi',
                }),
                apiError: error,
            });
        },
    });
};

const getLinearProjects = async (teamId: string): Promise<LinearProject[]> =>
    lightdashApi<LinearProject[]>({
        // pragma: allowlist secret
        url: `/linear/projects?teamId=${encodeURIComponent(teamId)}`,
        method: 'GET',
        body: undefined,
    });

export const useLinearProjects = (options: {
    enabled?: boolean;
    teamId: string | null;
}) => {
    const { showToastApiError } = useToaster();
    const { teamId } = options;

    return useQuery<LinearProject[], ApiError>({
        queryKey: [...LINEAR_PROJECTS_QUERY_KEY, teamId],
        queryFn: () => getLinearProjects(teamId!),
        retry: false,
        enabled: !!teamId && (options.enabled ?? true),
        onError: ({ error }) => {
            if (error.statusCode === 404 || error.statusCode === 401) return;

            showToastApiError({
                title: i18n.t('linearIntegration.fetchProjectsFailed', {
                    ns: 'commonUi',
                }),
                apiError: error,
            });
        },
    });
};

const deleteLinearInstallation = async (): Promise<void> =>
    lightdashApi<undefined>({
        // pragma: allowlist secret
        url: `/linear/uninstall`,
        method: 'DELETE',
        body: undefined,
    });

export const useDeleteLinearInstallationMutation = () => {
    const { showToastApiError, showToastSuccess } = useToaster();
    const queryClient = useQueryClient();

    return useMutation<void, ApiError, void>({
        mutationFn: deleteLinearInstallation,
        onSuccess: async () => {
            await queryClient.invalidateQueries(LINEAR_INSTALLATION_QUERY_KEY);
            await queryClient.invalidateQueries(LINEAR_TEAMS_QUERY_KEY);
            await queryClient.invalidateQueries(LINEAR_PROJECTS_QUERY_KEY);
            showToastSuccess({
                title: i18n.t('linearIntegration.deleted', { ns: 'commonUi' }),
            });
        },
        onError: ({ error }) => {
            showToastApiError({
                title: i18n.t('linearIntegration.deleteFailed', {
                    ns: 'commonUi',
                }),
                apiError: error,
            });
        },
    });
};
