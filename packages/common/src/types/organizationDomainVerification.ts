import { type EmailStatusExpiring } from './email';

/**
 * A domain an organization has proven it owns (via a one-time passcode sent to
 * an address at the domain). Verified domains are globally unique — the first
 * organization to verify a domain owns it.
 */
export type VerifiedDomain = {
    organizationUuid: string;
    domain: string;
    verifiedAt: Date;
    verifiedByUserUuid: string | null;
};

/**
 * Verification status of a single domain. Mirrors {@link EmailStatusExpiring}:
 * `otp` is present only while a pending one-time passcode challenge exists.
 */
export type DomainVerificationStatus = Pick<EmailStatusExpiring, 'otp'> & {
    domain: string;
    isVerified: boolean;
};

/**
 * Request to verify a domain. `challengeEmail` must be an address at `domain`;
 * a one-time passcode is sent there and confirmed via
 * {@link ConfirmDomainVerification}.
 */
export type RequestDomainVerification = {
    domain: string;
    challengeEmail: string;
};

export type ConfirmDomainVerification = {
    domain: string;
    passcode: string;
};

export type ApiVerifiedDomainsResponse = {
    status: 'ok';
    results: VerifiedDomain[];
};

export type ApiDomainVerificationStatusResponse = {
    status: 'ok';
    results: DomainVerificationStatus;
};
