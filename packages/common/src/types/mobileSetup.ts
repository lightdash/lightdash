import { type ApiSuccess, type ApiSuccessEmpty } from './api/success';
import { type UUID } from './api/uuid';
import { type MobilePlatform } from './managedSignIn';

export const MOBILE_SETUP_CODE_GRANT_TYPE =
    'urn:lightdash:params:oauth:grant-type:mobile-setup-code';

export enum MobileSetupCodeStatus {
    PENDING = 'pending',
    REDEEMED = 'redeemed',
    EXPIRED = 'expired',
    REVOKED = 'revoked',
}

export enum MobileSetupCodeError {
    EXPIRED = 'expired',
    ALREADY_USED = 'already_used',
    REVOKED = 'revoked',
    UNKNOWN = 'unknown',
}

export type MobileAppHealth = {
    enabled: boolean;
    setupLinkBaseUrl: string;
    appStoreUrl: string | null;
    playStoreUrl: string;
};

export type MobileSetupCode = {
    codeId: UUID;
    code: string;
    link: string;
    expiresAt: string;
    projectUuid: UUID;
};

export type MobileSetupCodeStatusResponse = {
    codeId: UUID;
    status: MobileSetupCodeStatus;
    expiresAt: string;
    redeemedAt: string | null;
    redeemedPlatform: MobilePlatform | null;
};

export type ApiMobileSetupCodeMintRequest = { projectUuid: UUID };
export type ApiMobileSetupCodeMintResponse = ApiSuccess<MobileSetupCode>;
export type ApiMobileSetupCodeStatusResponse =
    ApiSuccess<MobileSetupCodeStatusResponse>;
export type ApiMobileSetupCodeRevokeResponse = ApiSuccessEmpty;
