import {
    type ApiError,
    type HomepageOpening,
    type OrganizationHomepageSettings,
    type UpdateOrganizationHomepageSettings,
} from '@lightdash/common';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
import useToaster from '../../../../hooks/toaster/useToaster';
import { useHomepageAiState } from './useHomepageAiState';

const ORG_HOMEPAGE_SETTINGS_QUERY_KEY = 'org_homepage_settings';

const getOrgHomepageSettingsApi = async () =>
    lightdashApi<OrganizationHomepageSettings>({
        url: `/org/homepage-settings`,
        method: 'GET',
        body: undefined,
    });

export const useOrgHomepageSettings = () =>
    useQuery<OrganizationHomepageSettings, ApiError>({
        queryKey: [ORG_HOMEPAGE_SETTINGS_QUERY_KEY],
        queryFn: getOrgHomepageSettingsApi,
    });

const updateOrgHomepageSettingsApi = async (
    data: UpdateOrganizationHomepageSettings,
) =>
    lightdashApi<OrganizationHomepageSettings>({
        url: `/org/homepage-settings`,
        method: 'PATCH',
        body: JSON.stringify(data),
    });

export const useUpdateOrgHomepageSettings = () => {
    const { showToastApiError } = useToaster();
    const queryClient = useQueryClient();
    return useMutation<
        OrganizationHomepageSettings,
        ApiError,
        UpdateOrganizationHomepageSettings
    >(updateOrgHomepageSettingsApi, {
        mutationKey: ['update_org_homepage_settings'],
        onSuccess: async (settings) => {
            // Seed the cache directly so the homepage flips without a refetch
            // round-trip; homepage configs may have been rewritten server-side
            // (content-first swaps stored ask heroes), so refetch those.
            queryClient.setQueryData(
                [ORG_HOMEPAGE_SETTINGS_QUERY_KEY],
                settings,
            );
            await queryClient.invalidateQueries(['project_homepage']);
        },
        onError: ({ error }) => {
            showToastApiError({
                title: 'Failed to update homepage settings',
                apiError: error,
            });
        },
    });
};

/**
 * The opening the homepage should render, resolved from the org's choice and
 * AI availability. The org preset wins; `null` (never chosen) falls back to
 * the legacy rule where AI availability decides. Ask-first always requires a
 * working composer, so without AI it clamps to content-first rather than
 * opening on a hero that can't answer anything.
 */
export const useHomepageOpening = (projectUuid: string | undefined) => {
    const settings = useOrgHomepageSettings();
    const { canAskAi, isLoading: isAiStateLoading } =
        useHomepageAiState(projectUuid);

    const preferred = settings.data?.opening ?? null;
    const opening: HomepageOpening =
        preferred === 'content-first' || !canAskAi
            ? 'content-first'
            : 'ask-first';

    return {
        opening,
        canAskAi,
        isLoading: isAiStateLoading || settings.isInitialLoading,
    };
};
