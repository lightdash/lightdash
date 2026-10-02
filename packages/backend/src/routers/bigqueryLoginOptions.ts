export const getBigqueryLoginOptions = ({
    lightReconnect,
    forceConsent,
    loginHint,
}: {
    lightReconnect: boolean;
    forceConsent: boolean;
    loginHint: string | undefined;
}) => ({
    scope: ['profile', 'email', 'https://www.googleapis.com/auth/bigquery'],
    accessType: 'offline' as const,
    ...(lightReconnect && !forceConsent
        ? { loginHint }
        : { prompt: 'consent' }),
    session: false,
    includeGrantedScopes: true,
});

export const getBigqueryConsentRedirect = ({
    isPopup,
    returnTo,
}: {
    isPopup: boolean;
    returnTo: string | undefined;
}): string => {
    const params = new URLSearchParams({ forceConsent: 'true' });
    if (isPopup) params.set('isPopup', 'true');
    if (returnTo) params.set('redirect', returnTo);
    return `/api/v1/login/bigquery?${params.toString()}`;
};
