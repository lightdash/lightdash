import {
    setLiveSourceReturnTo,
    type LiveSourceReturnTo,
} from './postHogConnection';

export const LINKEDIN_AD_ACCOUNT_ID = /^\d{1,20}$/;

/** Opens LinkedIn's consent screen; reconnecting keeps the source's uuid. */
export const getLinkedInAdsSignInUrl = (
    projectUuid: string,
    values: { name: string; adAccountId: string },
    connectionUuid: string | null,
    returnTo: LiveSourceReturnTo,
) => {
    const params = new URLSearchParams({
        name: values.name.trim(),
        adAccountId: values.adAccountId.trim(),
    });
    if (connectionUuid) params.set('connectionUuid', connectionUuid);
    setLiveSourceReturnTo(params, returnTo);
    return `/api/v1/ee/projects/${projectUuid}/live-sources/linkedin/oauth/start?${params.toString()}`;
};
