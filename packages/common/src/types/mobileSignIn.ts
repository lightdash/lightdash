export const MOBILE_SIGN_IN_CODE_TOKEN_TYPE =
    'urn:lightdash:params:oauth:token-type:mobile-sign-in-code';

export const MOBILE_SIGN_IN_PATH = '/m/sign-in';

export const MOBILE_SIGN_IN_CODE_TTL_SECONDS = 120;
export const MOBILE_SIGN_IN_CLAIM_TTL_SECONDS = 300;
export const MOBILE_SIGN_IN_REDEEM_INTERVAL_SECONDS = 2;
export const MOBILE_SIGN_IN_MAX_FAILED_REDEEMS = 3;

export enum MobileSignInCodeStatus {
    PENDING = 'pending',
    CLAIMED = 'claimed',
    APPROVED = 'approved',
    DECLINED = 'declined',
    REDEEMED = 'redeemed',
    EXPIRED = 'expired',
}

export type MobileSignInPlatform = 'ios' | 'android';

export const isMobileSignInPlatform = (
    value: unknown,
): value is MobileSignInPlatform => value === 'ios' || value === 'android';

export type MobileSignInMintReason = 'show' | 'auto_refresh';

export const isMobileSignInMintReason = (
    value: unknown,
): value is MobileSignInMintReason =>
    value === 'show' || value === 'auto_refresh';

export enum MobileSignInRefusal {
    MANAGED_SIGN_IN_REQUIRED = 'managed_sign_in_required',
    EMAIL_UNVERIFIED = 'email_unverified',
    ORGANIZATION_REQUIRED = 'organization_required',
    FEATURE_DISABLED = 'feature_disabled',
    RATE_LIMITED = 'rate_limited',
    APPROVAL_SESSION_MISMATCH = 'approval_session_mismatch',
    INVALID_STATE = 'invalid_state',
}

export type MobileSignInCode = {
    codeUuid: string;
    signInUrl: string;
    approvalNonce: string;
    expiresAt: string;
    expiresInSeconds: number;
};

export type MobileSignInCodeDevice = {
    platform: MobileSignInPlatform | 'unknown';
    clientName: string;
};

export type MobileSignInCodeState = {
    codeUuid: string;
    status: MobileSignInCodeStatus;
    expiresAt: string;
    matchNumber: string | null;
    device: MobileSignInCodeDevice | null;
};

export type MobileSignInDecision = {
    status: MobileSignInCodeStatus.APPROVED | MobileSignInCodeStatus.DECLINED;
    matchNumber: string | null;
};

export type ApiMobileSignInCodeResponse = {
    status: 'ok';
    results: MobileSignInCode;
};

export type ApiMobileSignInCodeStateResponse = {
    status: 'ok';
    results: MobileSignInCodeState;
};

export type ApiMobileSignInDecisionResponse = {
    status: 'ok';
    results: MobileSignInDecision;
};

export type MobileSignInClaimResponse = {
    instance_url: string;
    display_name_masked: string;
    expires_in: number;
    interval: number;
};

export const formatMobileSignInMatchNumber = (value: number): string =>
    String(value).padStart(2, '0');
