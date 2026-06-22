import { subject } from '@casl/ability';
import {
    DomainVerificationStatus,
    FeatureFlags,
    ForbiddenError,
    getEmailDomain,
    isPublicEmailProviderDomain,
    isValidEmailAddress,
    NotFoundError,
    ParameterError,
    VerifiedDomain,
    type RegisteredAccount,
} from '@lightdash/common';
import EmailClient from '../../clients/EmailClient/EmailClient';
import { LightdashConfig } from '../../config/parseConfig';
import { DbOrganizationDomainVerification } from '../../database/entities/organizationDomainVerifications';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { OrganizationDomainVerificationModel } from '../../models/OrganizationDomainVerificationModel';
import {
    generateOneTimePasscode,
    isOtpExpired,
    isOtpMaxAttempts,
    otpExpirationDate,
    resendCooldownRemainingSeconds,
} from '../../utils/oneTimePasscode';
import { BaseService } from '../BaseService';

type OrganizationDomainVerificationServiceArguments = {
    lightdashConfig: LightdashConfig;
    organizationDomainVerificationModel: OrganizationDomainVerificationModel;
    featureFlagModel: FeatureFlagModel;
    emailClient: EmailClient;
};

// Same shape check used by OrganizationSsoService — guards against typos like
// trailing dots or whitespace inside the domain.
const VALID_DOMAIN_REGEX =
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

const isUniqueViolation = (error: unknown): boolean =>
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === '23505';

export class OrganizationDomainVerificationService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly organizationDomainVerificationModel: OrganizationDomainVerificationModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly emailClient: EmailClient;

    constructor({
        lightdashConfig,
        organizationDomainVerificationModel,
        featureFlagModel,
        emailClient,
    }: OrganizationDomainVerificationServiceArguments) {
        super({ serviceName: 'OrganizationDomainVerificationService' });
        this.lightdashConfig = lightdashConfig;
        this.organizationDomainVerificationModel =
            organizationDomainVerificationModel;
        this.featureFlagModel = featureFlagModel;
        this.emailClient = emailClient;
    }

    /**
     * Domain verification gates the per-organization SSO settings, so it shares
     * the same feature flag.
     */
    private async assertFeatureEnabled(
        account: RegisteredAccount,
    ): Promise<void> {
        const flag = await this.featureFlagModel.get({
            user: {
                userUuid: account.user.userUuid,
                organizationUuid: account.organization?.organizationUuid,
            },
            featureFlagId: FeatureFlags.SsoOrganizationSettings,
        });
        if (!flag.enabled) {
            throw new ForbiddenError(
                'Per-organization SSO settings are not enabled for this organization',
            );
        }
    }

    private assertCanManageOrganization(account: RegisteredAccount): string {
        const organizationUuid = account.organization?.organizationUuid;
        if (!organizationUuid) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const ability = this.createAuditedAbility(account);
        if (
            ability.cannot(
                'manage',
                subject('Organization', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        return organizationUuid;
    }

    private static normalizeDomain(domain: string): string {
        const normalized = domain.trim().toLowerCase();
        if (!VALID_DOMAIN_REGEX.test(normalized)) {
            throw new ParameterError(`Invalid domain format: ${domain}`);
        }
        if (isPublicEmailProviderDomain(normalized)) {
            throw new ParameterError(
                `${normalized} is a public email provider and can't be verified. Use a domain that identifies your organization.`,
            );
        }
        return normalized;
    }

    private static toStatus(
        row: DbOrganizationDomainVerification,
    ): DomainVerificationStatus {
        const isVerified = row.verified_at !== null;
        const createdAt = row.passcode_created_at;
        return {
            domain: row.domain,
            isVerified,
            otp:
                !isVerified && createdAt
                    ? {
                          createdAt,
                          numberOfAttempts: row.number_of_attempts,
                          expiresAt: otpExpirationDate(createdAt),
                          isExpired: isOtpExpired(createdAt),
                          isMaxAttempts: isOtpMaxAttempts(
                              row.number_of_attempts,
                          ),
                      }
                    : undefined,
        };
    }

    async listVerifiedDomains(
        account: RegisteredAccount,
    ): Promise<VerifiedDomain[]> {
        await this.assertFeatureEnabled(account);
        const organizationUuid = this.assertCanManageOrganization(account);
        return this.organizationDomainVerificationModel.findVerifiedDomains(
            organizationUuid,
        );
    }

    /**
     * Sends a one-time passcode to an address at the domain. Rejects public
     * providers and domains already verified by another organization.
     */
    async requestVerification(
        account: RegisteredAccount,
        { domain, challengeEmail }: { domain: string; challengeEmail: string },
    ): Promise<DomainVerificationStatus> {
        await this.assertFeatureEnabled(account);
        const organizationUuid = this.assertCanManageOrganization(account);
        const normalizedDomain =
            OrganizationDomainVerificationService.normalizeDomain(domain);

        const trimmedChallengeEmail = challengeEmail.trim();
        if (!isValidEmailAddress(trimmedChallengeEmail)) {
            throw new ParameterError(
                `${challengeEmail} is not a valid email address`,
            );
        }
        let challengeEmailDomain: string;
        try {
            challengeEmailDomain = getEmailDomain(trimmedChallengeEmail);
        } catch {
            throw new ParameterError(
                `${challengeEmail} is not a valid email address`,
            );
        }
        if (challengeEmailDomain !== normalizedDomain) {
            throw new ParameterError(
                `The verification email must be an address at ${normalizedDomain}`,
            );
        }

        const owner =
            await this.organizationDomainVerificationModel.findVerifiedDomainOwner(
                normalizedDomain,
            );
        if (owner && owner.organizationUuid !== organizationUuid) {
            throw new ParameterError(
                `${normalizedDomain} has already been verified by another organization.`,
            );
        }

        const existing =
            await this.organizationDomainVerificationModel.findByOrgAndDomain(
                organizationUuid,
                normalizedDomain,
            );
        if (existing?.verified_at) {
            // Already verified by this organization — nothing to do.
            return OrganizationDomainVerificationService.toStatus(existing);
        }
        // Throttle resends: a fresh code can't be minted until the cooldown
        // since the last one has elapsed.
        if (existing?.passcode_created_at) {
            const wait = resendCooldownRemainingSeconds(
                existing.passcode_created_at,
            );
            if (wait > 0) {
                throw new ParameterError(
                    `Please wait ${wait} second${
                        wait === 1 ? '' : 's'
                    } before requesting another code.`,
                );
            }
        }

        const passcode = generateOneTimePasscode(this.lightdashConfig.mode);
        const { createdAt, numberOfAttempts } =
            await this.organizationDomainVerificationModel.upsertChallenge({
                organizationUuid,
                domain: normalizedDomain,
                passcode,
            });
        await this.emailClient.sendDomainVerificationEmail({
            recipient: trimmedChallengeEmail,
            passcode,
            domain: normalizedDomain,
        });

        return {
            domain: normalizedDomain,
            isVerified: false,
            otp: {
                createdAt,
                numberOfAttempts,
                expiresAt: otpExpirationDate(createdAt),
                isExpired: isOtpExpired(createdAt),
                isMaxAttempts: isOtpMaxAttempts(numberOfAttempts),
            },
        };
    }

    /**
     * Confirms a passcode. On a valid, non-expired, non-locked-out passcode the
     * domain is marked verified; a wrong code increments the attempt counter.
     * Mirrors {@link UserService.getPrimaryEmailStatus}.
     */
    async confirmVerification(
        account: RegisteredAccount,
        { domain, passcode }: { domain: string; passcode: string },
    ): Promise<DomainVerificationStatus> {
        await this.assertFeatureEnabled(account);
        const organizationUuid = this.assertCanManageOrganization(account);
        const normalizedDomain =
            OrganizationDomainVerificationService.normalizeDomain(domain);

        try {
            const challenge =
                await this.organizationDomainVerificationModel.verifyChallengePasscode(
                    {
                        organizationUuid,
                        domain: normalizedDomain,
                        passcode,
                    },
                );
            if (
                !isOtpExpired(challenge.createdAt) &&
                !isOtpMaxAttempts(challenge.numberOfAttempts)
            ) {
                try {
                    await this.organizationDomainVerificationModel.markChallengeVerified(
                        {
                            organizationUuid,
                            domain: normalizedDomain,
                            verifiedByUserUuid: account.user.userUuid,
                        },
                    );
                } catch (error) {
                    if (isUniqueViolation(error)) {
                        throw new ParameterError(
                            `${normalizedDomain} has already been verified by another organization.`,
                        );
                    }
                    throw error;
                }
            }
        } catch (error) {
            // Wrong/expired passcode — count the attempt, mirroring email OTP.
            if (error instanceof NotFoundError) {
                await this.organizationDomainVerificationModel.incrementChallengeAttempts(
                    {
                        organizationUuid,
                        domain: normalizedDomain,
                    },
                );
            } else {
                throw error;
            }
        }

        const row =
            await this.organizationDomainVerificationModel.findByOrgAndDomain(
                organizationUuid,
                normalizedDomain,
            );
        if (!row) {
            throw new NotFoundError(
                `No verification in progress for ${normalizedDomain}`,
            );
        }
        return OrganizationDomainVerificationService.toStatus(row);
    }

    /**
     * Removes a verified (or pending) domain. SSO routing re-validates against
     * the verified registry on every login, so any stale entry left in a
     * provider's `email_domains` subset is inert (it can't route a domain that
     * is no longer verified) — no cross-table sync is needed.
     */
    async deleteVerifiedDomain(
        account: RegisteredAccount,
        domain: string,
    ): Promise<void> {
        await this.assertFeatureEnabled(account);
        const organizationUuid = this.assertCanManageOrganization(account);
        const normalizedDomain =
            OrganizationDomainVerificationService.normalizeDomain(domain);

        await this.organizationDomainVerificationModel.deleteVerification({
            organizationUuid,
            domain: normalizedDomain,
        });
    }
}
