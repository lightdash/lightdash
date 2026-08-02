import { subject } from '@casl/ability';
import {
    CreateEmailWhitelabel,
    EmailDnsRecord,
    EmailSenderIdentity,
    EmailWhitelabelStatus,
    FeatureFlags,
    ForbiddenError,
    getEmailDomain,
    getErrorMessage,
    isPublicEmailProviderDomain,
    isValidEmailAddress,
    MissingConfigError,
    OrganizationEmailWhitelabel,
    ParameterError,
    UpdateEmailWhitelabel,
    type RegisteredAccount,
} from '@lightdash/common';
import EmailClient from '../../clients/EmailClient/EmailClient';
import {
    PostmarkClient,
    PostmarkDomain,
} from '../../clients/Postmark/PostmarkClient';
import { LightdashConfig } from '../../config/parseConfig';
import { DbOrganizationEmailDomain } from '../../database/entities/organizationEmailDomains';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { OrganizationEmailDomainModel } from '../../models/OrganizationEmailDomainModel';
import { OrganizationMemberProfileModel } from '../../models/OrganizationMemberProfileModel';
import { BaseService } from '../BaseService';

type EmailWhitelabelServiceArguments = {
    lightdashConfig: LightdashConfig;
    organizationEmailDomainModel: OrganizationEmailDomainModel;
    organizationMemberProfileModel: OrganizationMemberProfileModel;
    featureFlagModel: FeatureFlagModel;
    emailClient: EmailClient;
};

// Same shape check used by OrganizationDomainVerificationService.
const VALID_DOMAIN_REGEX =
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/**
 * How long a domain has to finish verifying before it is considered failed.
 * DNS propagation can take up to 24h; we give a generous margin. The poller
 * stops re-checking a row once it passes this age.
 */
export const EMAIL_WHITELABEL_VERIFICATION_TIMEOUT_MS = 72 * 60 * 60 * 1000;

export class EmailWhitelabelService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly organizationEmailDomainModel: OrganizationEmailDomainModel;

    private readonly organizationMemberProfileModel: OrganizationMemberProfileModel;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly emailClient: EmailClient;

    constructor({
        lightdashConfig,
        organizationEmailDomainModel,
        organizationMemberProfileModel,
        featureFlagModel,
        emailClient,
    }: EmailWhitelabelServiceArguments) {
        super({ serviceName: 'EmailWhitelabelService' });
        this.lightdashConfig = lightdashConfig;
        this.organizationEmailDomainModel = organizationEmailDomainModel;
        this.organizationMemberProfileModel = organizationMemberProfileModel;
        this.featureFlagModel = featureFlagModel;
        this.emailClient = emailClient;
    }

    /**
     * Single definition of "email whitelabelling is available": the instance
     * must have a Postmark account token AND the org must have the feature
     * flag. Everything (API endpoints, health's `hasEmailWhitelabel`, the
     * frontend tab) derives from these two facts — don't re-check them
     * piecemeal elsewhere.
     */
    private async assertAvailable(account: RegisteredAccount): Promise<void> {
        if (!this.lightdashConfig.postmark.accountToken) {
            throw new MissingConfigError(
                'Email whitelabelling is not configured on this instance',
            );
        }
        const flag = await this.featureFlagModel.get({
            user: {
                userUuid: account.user.userUuid,
                organizationUuid: account.organization?.organizationUuid,
            },
            featureFlagId: FeatureFlags.EmailWhitelabel,
        });
        if (!flag.enabled) {
            throw new ForbiddenError(
                'Email whitelabelling is not enabled for this organization',
            );
        }
    }

    private assertCanManageOrganization(
        account: RegisteredAccount,
        organizationUuid: string,
    ): string {
        const accountOrganizationUuid = account.organization?.organizationUuid;
        if (
            !accountOrganizationUuid ||
            accountOrganizationUuid !== organizationUuid
        ) {
            throw new ForbiddenError(
                'User is not a member of this organization',
            );
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

    /**
     * Provisioning goes through the Postmark account API, which requires an
     * account token. Self-hosted instances without one can't self-serve, so the
     * feature is unavailable there.
     */
    private getPostmarkClient(): PostmarkClient {
        const { accountToken } = this.lightdashConfig.postmark;
        if (!accountToken) {
            throw new MissingConfigError(
                'Email whitelabelling is not configured on this instance',
            );
        }
        return new PostmarkClient({ accountToken });
    }

    private static normalizeDomain(domain: string): string {
        const normalized = domain.trim().toLowerCase();
        if (!VALID_DOMAIN_REGEX.test(normalized)) {
            throw new ParameterError(`Invalid domain format: ${domain}`);
        }
        if (isPublicEmailProviderDomain(normalized)) {
            throw new ParameterError(
                `${normalized} is a public email provider and can't be used as a sending domain.`,
            );
        }
        return normalized;
    }

    private static status(
        row: DbOrganizationEmailDomain,
    ): EmailWhitelabelStatus {
        const isVerified = row.dkim_verified && row.return_path_verified;
        if (isVerified && row.is_enabled) return 'enabled';
        if (isVerified) return 'verified';
        if (
            row.verification_started_at &&
            Date.now() - row.verification_started_at.getTime() >
                EMAIL_WHITELABEL_VERIFICATION_TIMEOUT_MS
        ) {
            return 'failed';
        }
        return 'pending';
    }

    private static toWhitelabel(
        row: DbOrganizationEmailDomain,
    ): OrganizationEmailWhitelabel {
        const dnsRecords: EmailDnsRecord[] = [];
        if (row.dkim_host && row.dkim_value) {
            dnsRecords.push({
                purpose: 'dkim',
                type: 'TXT',
                name: row.dkim_host,
                value: row.dkim_value,
                verified: row.dkim_verified,
            });
        }
        if (row.return_path_host && row.return_path_value) {
            dnsRecords.push({
                purpose: 'return-path',
                type: 'CNAME',
                name: row.return_path_host,
                value: row.return_path_value,
                verified: row.return_path_verified,
            });
        }
        return {
            organizationUuid: row.organization_uuid,
            domain: row.domain,
            fromEmail: row.from_email,
            fromName: row.from_name,
            status: EmailWhitelabelService.status(row),
            dkimVerified: row.dkim_verified,
            returnPathVerified: row.return_path_verified,
            isVerified: row.dkim_verified && row.return_path_verified,
            isEnabled: row.is_enabled,
            dnsRecords,
            lastCheckedAt: row.last_checked_at,
            createdAt: row.created_at,
        };
    }

    /**
     * The DNS records Postmark expects. While a domain is pending, Postmark
     * exposes the DKIM record under the `*Pending*` fields; once verified it
     * moves to the non-pending fields.
     */
    private static dkimRecord(domain: PostmarkDomain): {
        host: string | null;
        value: string | null;
    } {
        return {
            host: domain.DKIMPendingHost || domain.DKIMHost || null,
            value: domain.DKIMPendingTextValue || domain.DKIMTextValue || null,
        };
    }

    async getStatus(
        account: RegisteredAccount,
        organizationUuid: string,
    ): Promise<OrganizationEmailWhitelabel | null> {
        await this.assertAvailable(account);
        this.assertCanManageOrganization(account, organizationUuid);
        const row =
            await this.organizationEmailDomainModel.findByOrganization(
                organizationUuid,
            );
        return row ? EmailWhitelabelService.toWhitelabel(row) : null;
    }

    /**
     * Sets up (or replaces) the org's sending domain. Provisions the domain in
     * Postmark, stores the DNS records to publish, and returns the pending
     * status. Does not enable sending — that happens after verification.
     */
    async setupDomain(
        account: RegisteredAccount,
        organizationUuid: string,
        body: CreateEmailWhitelabel,
    ): Promise<OrganizationEmailWhitelabel> {
        await this.assertAvailable(account);
        this.assertCanManageOrganization(account, organizationUuid);
        const postmark = this.getPostmarkClient();

        const domain = EmailWhitelabelService.normalizeDomain(body.domain);
        const fromEmail = body.fromEmail.trim().toLowerCase();
        if (!isValidEmailAddress(fromEmail)) {
            throw new ParameterError(
                `${body.fromEmail} is not a valid email address`,
            );
        }
        let fromEmailDomain: string;
        try {
            fromEmailDomain = getEmailDomain(fromEmail);
        } catch {
            throw new ParameterError(
                `${body.fromEmail} is not a valid email address`,
            );
        }
        if (fromEmailDomain !== domain) {
            throw new ParameterError(
                `The sending address must be at ${domain} (e.g. reports@${domain})`,
            );
        }

        // Postmark rejects duplicate domain creation — reuse an existing one.
        let postmarkDomain: PostmarkDomain;
        try {
            postmarkDomain = await postmark.createDomain(
                domain,
                this.lightdashConfig.postmark.returnPathSubdomain,
            );
        } catch (error) {
            const existing = await postmark.getDomainByName(domain);
            if (!existing) {
                throw error;
            }
            postmarkDomain = existing;
        }

        const dkim = EmailWhitelabelService.dkimRecord(postmarkDomain);
        const row = await this.organizationEmailDomainModel.upsert({
            organizationUuid,
            domain,
            fromEmail,
            fromName: body.fromName?.trim() || null,
            postmarkDomainId: postmarkDomain.ID,
            dkimHost: dkim.host,
            dkimValue: dkim.value,
            dkimVerified: postmarkDomain.DKIMVerified,
            returnPathHost: postmarkDomain.ReturnPathDomain || null,
            returnPathValue: postmarkDomain.ReturnPathDomainCNAMEValue || null,
            returnPathVerified: postmarkDomain.ReturnPathDomainVerified,
        });
        this.logger.info('Email whitelabel domain set up', {
            organizationUuid,
            domain,
        });
        return EmailWhitelabelService.toWhitelabel(row);
    }

    /**
     * Triggers verification of both DKIM and return-path with the provider and
     * persists the result. Both must pass before the domain can be enabled.
     */
    async verify(
        account: RegisteredAccount,
        organizationUuid: string,
    ): Promise<OrganizationEmailWhitelabel> {
        await this.assertAvailable(account);
        this.assertCanManageOrganization(account, organizationUuid);
        const row =
            await this.organizationEmailDomainModel.findByOrganization(
                organizationUuid,
            );
        if (!row || row.postmark_domain_id === null) {
            throw new ParameterError(
                'No sending domain has been set up for this organization',
            );
        }
        const updated = await this.checkVerification(row);
        return EmailWhitelabelService.toWhitelabel(updated);
    }

    /**
     * Re-checks a single domain against the provider and persists the DKIM /
     * return-path verification state and the latest DNS records. Shared by the
     * on-demand verify endpoint and the background poller.
     */
    async checkVerification(
        row: DbOrganizationEmailDomain,
    ): Promise<DbOrganizationEmailDomain> {
        if (row.postmark_domain_id === null) return row;
        const postmark = this.getPostmarkClient();

        const dkimResult = row.dkim_verified
            ? await postmark.getDomain(row.postmark_domain_id)
            : await postmark.verifyDkim(row.postmark_domain_id);
        const returnPathResult = row.return_path_verified
            ? dkimResult
            : await postmark.verifyReturnPath(row.postmark_domain_id);

        const dkim = EmailWhitelabelService.dkimRecord(returnPathResult);
        return this.organizationEmailDomainModel.update(row.organization_uuid, {
            dkim_host: dkim.host,
            dkim_value: dkim.value,
            dkim_verified: returnPathResult.DKIMVerified,
            return_path_host: returnPathResult.ReturnPathDomain || null,
            return_path_value:
                returnPathResult.ReturnPathDomainCNAMEValue || null,
            return_path_verified: returnPathResult.ReturnPathDomainVerified,
            last_checked_at: new Date(),
        });
    }

    /** Enable or disable sending from the verified domain. */
    async updateEnabled(
        account: RegisteredAccount,
        organizationUuid: string,
        body: UpdateEmailWhitelabel,
    ): Promise<OrganizationEmailWhitelabel> {
        await this.assertAvailable(account);
        this.assertCanManageOrganization(account, organizationUuid);
        const row =
            await this.organizationEmailDomainModel.findByOrganization(
                organizationUuid,
            );
        if (!row) {
            throw new ParameterError(
                'No sending domain has been set up for this organization',
            );
        }
        if (
            body.isEnabled &&
            !(row.dkim_verified && row.return_path_verified)
        ) {
            throw new ParameterError(
                'Both DKIM and return-path must be verified before enabling.',
            );
        }
        const updated = await this.organizationEmailDomainModel.update(
            organizationUuid,
            { is_enabled: body.isEnabled },
        );
        return EmailWhitelabelService.toWhitelabel(updated);
    }

    /** Removes the sending domain from the provider and the database. */
    async deleteDomain(
        account: RegisteredAccount,
        organizationUuid: string,
    ): Promise<void> {
        await this.assertAvailable(account);
        this.assertCanManageOrganization(account, organizationUuid);
        const row =
            await this.organizationEmailDomainModel.findByOrganization(
                organizationUuid,
            );
        if (!row) return;
        if (row.postmark_domain_id !== null) {
            try {
                await this.getPostmarkClient().deleteDomain(
                    row.postmark_domain_id,
                );
            } catch (error) {
                // Best effort — still remove our record so the org reverts to
                // the Lightdash sending identity.
                this.logger.warn(
                    `Failed to delete Postmark domain: ${getErrorMessage(
                        error,
                    )}`,
                );
            }
        }
        await this.organizationEmailDomainModel.delete(organizationUuid);
    }

    /**
     * Resolves the sender fields for an organization at send time. Called from
     * the scheduler on the report-email path — never gated by the per-user
     * feature flag, since a row can only exist if the (gated) setup flow created
     * it.
     *
     * - enabled + verified → send from the customer's domain.
     * - configured but not yet verified → keep the Lightdash identity but set
     *   reply-to to the customer's address (sending is never blocked).
     * - verified but disabled, or no row → use the Lightdash identity.
     */
    async resolveSenderIdentity(
        organizationUuid: string,
    ): Promise<EmailSenderIdentity | null> {
        const row =
            await this.organizationEmailDomainModel.findByOrganization(
                organizationUuid,
            );
        if (!row) return null;
        const isVerified = row.dkim_verified && row.return_path_verified;
        if (row.is_enabled && isVerified) {
            const from = row.from_name
                ? `"${row.from_name}" <${row.from_email}>`
                : row.from_email;
            return { from, replyTo: null };
        }
        if (!isVerified) {
            // Setup in progress — soft fallback so replies still reach them.
            return { from: null, replyTo: row.from_email };
        }
        return null;
    }

    /**
     * Background poller entry point: re-checks every domain still awaiting
     * verification within the timeout window, and notifies the org's admins the
     * first time a domain becomes fully verified.
     */
    async pollPendingVerifications(): Promise<void> {
        if (!this.lightdashConfig.postmark.accountToken) return;
        const startedAfter = new Date(
            Date.now() - EMAIL_WHITELABEL_VERIFICATION_TIMEOUT_MS,
        );
        const pending =
            await this.organizationEmailDomainModel.findPendingForPolling(
                startedAfter,
            );
        for (const row of pending) {
            try {
                // eslint-disable-next-line no-await-in-loop
                const updated = await this.checkVerification(row);
                const becameVerified =
                    !(row.dkim_verified && row.return_path_verified) &&
                    updated.dkim_verified &&
                    updated.return_path_verified;
                if (becameVerified) {
                    // eslint-disable-next-line no-await-in-loop
                    await this.notifyVerificationComplete(updated);
                }
            } catch (error) {
                this.logger.warn(
                    `Failed to poll email whitelabel verification for org ${
                        row.organization_uuid
                    }: ${getErrorMessage(error)}`,
                );
            }
        }
    }

    private async notifyVerificationComplete(
        row: DbOrganizationEmailDomain,
    ): Promise<void> {
        try {
            const admins =
                await this.organizationMemberProfileModel.getOrganizationAdmins(
                    row.organization_uuid,
                );
            const recipients = admins.map((a) => a.email).filter(Boolean);
            if (recipients.length === 0) return;
            await this.emailClient.sendGenericNotificationEmail(
                recipients,
                'Your email sending domain is verified',
                'Email domain verified',
                `Your sending domain **${row.domain}** is now verified. You can enable it in your organization settings to start sending report emails from **${row.from_email}**.`,
            );
        } catch (error) {
            this.logger.warn(
                `Failed to send email whitelabel verification notification: ${getErrorMessage(
                    error,
                )}`,
            );
        }
    }
}
