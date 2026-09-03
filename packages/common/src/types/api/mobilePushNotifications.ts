import { type ApiSuccess, type ApiSuccessEmpty } from './success';
import { type UUID } from './uuid';

export type MobilePushEnvironment = 'sandbox' | 'production';

export type MobilePushPlatform = 'ios' | 'android';

export type ApiMobilePushNotificationStatusResponse = ApiSuccess<{
    enabled: boolean;
    environments: MobilePushEnvironment[];
    platforms: MobilePushPlatform[];
}>;

export type ApiMobilePushInstallationRequest = {
    environment: MobilePushEnvironment;
    deviceToken: string;
    platform?: MobilePushPlatform;
};

export type ApiMobilePushInstallationResponse = ApiSuccessEmpty;

export type ApiMobilePushLiveActivityPushToStartTokenRequest = {
    pushToken: string;
};

export type ApiMobilePushLiveActivityPushToStartTokenResponse = ApiSuccessEmpty;

export type ApiMobilePushLiveActivityRequest = {
    installationUuid: UUID;
    promptUuid: UUID;
    pushToken: string;
};

export type ApiMobilePushLiveActivityResponse = ApiSuccessEmpty;
