import {
    FeatureFlags,
    ForbiddenError,
    InviteLink,
    InviteLinkFailure,
    InviteLinkFailureReason,
    NotFoundError,
    SessionUser,
    TooManyRequestsError,
} from '@lightdash/common';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import EmailClient from '../clients/EmailClient/EmailClient';
import { LightdashConfig } from '../config/parseConfig';
import { FeatureFlagModel } from '../models/FeatureFlagModel/FeatureFlagModel';
import { InviteLinkModel } from '../models/InviteLinkModel';
import { InviteLinkProvenanceModel } from '../models/InviteLinkProvenanceModel';
import { BaseService } from './BaseService';

type Dependencies = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    featureFlagModel: FeatureFlagModel;
    inviteLinkModel: InviteLinkModel;
    provenanceModel: InviteLinkProvenanceModel;
    emailClient: EmailClient;
};

export class InviteLinkFailureService extends BaseService {
    constructor(private readonly dependencies: Dependencies) {
        super();
    }

    private async isEnabled(user: SessionUser | null = null): Promise<boolean> {
        const flag = await this.dependencies.featureFlagModel.get({
            featureFlagId: FeatureFlags.ConnectJourney,
            ...(user ? { user } : {}),
        });
        return flag.enabled;
    }

    private async requireEnabled(user: SessionUser | null): Promise<void> {
        if (!(await this.isEnabled(user)))
            throw new ForbiddenError('Invite recovery is not enabled.');
    }

    async recordInvite(
        invite: InviteLink,
        inviter: SessionUser,
    ): Promise<void> {
        if (await this.isEnabled(inviter))
            await this.dependencies.provenanceModel.upsert(invite, inviter);
    }

    async getFailure(
        inviteCode: string,
        user: SessionUser | null,
    ): Promise<InviteLinkFailure> {
        await this.requireEnabled(user);
        const [provenance, expiresAt] = await Promise.all([
            this.dependencies.provenanceModel.findByCode(inviteCode),
            this.dependencies.inviteLinkModel.findExpiresAt(inviteCode),
        ]);
        let reason: InviteLinkFailureReason | null = null;
        if (
            expiresAt
                ? expiresAt <= new Date()
                : provenance && provenance.expires_at <= new Date()
        ) {
            reason = InviteLinkFailureReason.Expired;
        } else if (!expiresAt) {
            reason = provenance
                ? InviteLinkFailureReason.AlreadyUsed
                : InviteLinkFailureReason.NotFound;
        }
        return {
            reason,
            canRequestNewInvite:
                !!this.dependencies.lightdashConfig.smtp &&
                !!provenance?.inviterEmail,
        };
    }

    async trackFailure(
        inviteCode: string,
        reason: InviteLinkFailureReason,
        user: SessionUser | null = null,
        organizationUuid: string | null = null,
    ): Promise<void> {
        if (!(await this.isEnabled(user))) return;
        const provenance =
            await this.dependencies.provenanceModel.findByCode(inviteCode);
        let resolvedReason = reason;
        if (reason === InviteLinkFailureReason.NotFound && provenance) {
            resolvedReason =
                provenance.expires_at <= new Date()
                    ? InviteLinkFailureReason.Expired
                    : InviteLinkFailureReason.AlreadyUsed;
        }
        this.dependencies.analytics.track({
            event: 'invite_link.failed',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: {
                reason: resolvedReason,
                hasProvenance: !!provenance,
                organizationId:
                    provenance?.organization_uuid ?? organizationUuid,
            },
        });
    }

    async requestNew(
        inviteCode: string,
        user: SessionUser | null,
    ): Promise<void> {
        await this.requireEnabled(user);
        const provenance =
            await this.dependencies.provenanceModel.findByCode(inviteCode);
        if (!provenance)
            throw new NotFoundError('We cannot tell who sent this invite.');
        if (!this.dependencies.lightdashConfig.smtp)
            throw new ForbiddenError(
                'Ask the inviter directly for a new invite.',
            );
        if (!provenance.inviterEmail)
            throw new NotFoundError('The inviter is no longer available.');
        if (
            provenance.last_requested_at &&
            provenance.last_requested_at.getTime() >
                Date.now() - 24 * 60 * 60 * 1000
        ) {
            throw new TooManyRequestsError(
                'A new invite was already requested in the last 24 hours.',
            );
        }
        const { inviterEmail } = provenance;
        const settingsUrl = new URL(
            '/generalSettings/userManagement',
            this.dependencies.lightdashConfig.siteUrl,
        ).href;
        await this.dependencies.provenanceModel.requestNew(
            inviteCode,
            async () => {
                await this.dependencies.emailClient.sendGenericNotificationEmail(
                    [inviterEmail],
                    'A new invite was requested',
                    'A new invite was requested',
                    `${provenance.invitee_email} asked for a new invite to ${provenance.organizationName}.\n\nSend a new invite from ${settingsUrl}`,
                );
            },
        );
        this.dependencies.analytics.track({
            event: 'invite_link.new_invite_requested',
            anonymousId: LightdashAnalytics.anonymousId,
            properties: { organizationId: provenance.organization_uuid },
        });
    }

    async cleanup(): Promise<void> {
        if (await this.isEnabled())
            await this.dependencies.provenanceModel.deleteExpired();
    }
}
