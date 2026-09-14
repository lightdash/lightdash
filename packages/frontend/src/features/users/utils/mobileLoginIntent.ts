import { isMobileLoginIntent, type MobileLoginIntent } from '@lightdash/common';

export const getMobileLoginIntentFromRedirect = (
    redirect: string,
    origin: string,
): MobileLoginIntent | undefined => {
    try {
        const redirectUrl = new URL(redirect, origin);
        if (redirectUrl.pathname !== '/api/v1/oauth/authorize') {
            return undefined;
        }
        const intent = redirectUrl.searchParams.get('mobile_login_intent');
        return isMobileLoginIntent(intent) ? intent : undefined;
    } catch {
        return undefined;
    }
};

export const setMobileLoginIntentOnRedirect = (
    redirect: string,
    origin: string,
    intent: MobileLoginIntent,
): string => {
    const url = new URL(redirect, origin);
    url.searchParams.set('mobile_login_intent', intent);
    return `${url.pathname}${url.search}${url.hash}`;
};
