export type MobileAppPlatform = 'ios' | 'android';

export type MobileAppLink = {
    linkUuid: string;
    scanUrl: string;
    expiresAt: string;
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
