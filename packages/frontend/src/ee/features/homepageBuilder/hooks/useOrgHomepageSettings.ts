import {
    type ApiError,
    type HomepageOpening,
    type OrganizationHomepageSettings,
} from '@lightdash/common';
import { useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../../../../api';
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
