export type MobileAppPlatform = 'ios' | 'android';

export type MobileAppLink = {
    linkUuid: string;
    scanUrl: string;
    expiresAt: string;
    /** Lifetime set by the server, so clients need not trust their own clock. */
    expiresInSeconds: number;
};

export type MobileAppLinkStatus = {
    linkUuid: string;
    expiresAt: string;
    scannedAt: string | null;
    scanPlatform: MobileAppPlatform | null;
};

export type ApiMobileAppLinkResponse = {
    status: 'ok';
    results: MobileAppLink;
};

export type ApiMobileAppLinkStatusResponse = {
    status: 'ok';
    results: MobileAppLinkStatus;
};
