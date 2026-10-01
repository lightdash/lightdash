import { subject } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    getEmailDomain,
    getOrganizationJoinRequestExpiry,
    getOrganizationJoinRequestStatus,
    isOrganizationJoinRequestLimitReached,
    isPublicEmailProviderDomain,
    isUserWithOrg,
    NotFoundError,
    OrganizationJoinRequestStatus,
    OrganizationMemberRole,
    ParameterError,
    type OrganizationJoinRequest,
    type OrganizationJoinRequestSummary,
    type OrganizationLanding,
    type OrganizationLandingMatch,
    type RegisteredAccount,
    type SessionUser,
    type UserAllowedOrganization,
} from '@lightdash/common';
import { type LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import type EmailClient from '../../clients/EmailClient/EmailClient';
import { type LightdashConfig } from '../../config/parseConfig';
import { type DbOrganizationJoinRequest } from '../../database/entities/organizationJoinRequests';
import { type EmailModel } from '../../models/EmailModel';
import { type FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { type OrganizationJoinRequestModel } from '../../models/OrganizationJoinRequestModel';
import { type OrganizationMemberProfileModel } from '../../models/OrganizationMemberProfileModel';
import { type OrganizationModel } from '../../models/OrganizationModel';
import { type UserModel } from '../../models/UserModel';
import { BaseService } from '../BaseService';

type OrganizationLandingServiceArguments = {
    lightdashConfig: Pick<
        LightdashConfig,
        'allowMultiOrgs' | 'smtp' | 'siteUrl'
    >;
    analytics: Pick<LightdashAnalytics, 'track'>;
    featureFlagModel: Pick<FeatureFlagModel, 'get'>;
    emailModel: Pick<EmailModel, 'getPrimaryEmailStatus'>;
    organizationModel: Pick<
        OrganizationModel,
        | 'get'
        | 'hasOrgs'
        | 'getAllowedOrgsForDomain'
        | 'getOrganizationsWithMemberDomain'
        | 'getAllOrganizationsWithAdminFlag'
    >;
    organizationJoinRequestModel: Pick<
        OrganizationJoinRequestModel,
        | 'create'
        | 'findLatestForUser'
        | 'countCreatedSince'
        | 'expirePendingForUser'
        | 'get'
        | 'listOpenForOrganization'
        | 'decide'
    >;
    organizationMemberProfileModel: Pick<
        OrganizationMemberProfileModel,
        'getOrganizationAdmins'
    >;
    userModel: Pick<
        UserModel,
        'findSessionUserByUUID' | 'joinOrg' | 'invalidateSessionUserCache'
    >;
    emailClient: Pick<EmailClient, 'sendGenericNotificationEmail'>;
};

type RequestTarget = {
    organizationUuid: string;
    name: string;
    hasAdmin: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const toSummary = (
    row: DbOrganizationJoinRequest,
    now: Date,
): OrganizationJoinRequestSummary => ({
    joinRequestUuid: row.join_request_uuid,
    status: getOrganizationJoinRequestStatus(
        { status: row.status, expiresAt: row.expires_at },
        now,
    ),
    createdAt: row.created_at,
    decidedAt: row.decided_at,
});

export class OrganizationLandingService extends BaseService {
    private readonly dependencies: OrganizationLandingServiceArguments;

    constructor(dependencies: OrganizationLandingServiceArguments) {
        super({ serviceName: 'OrganizationLandingService' });
        this.dependencies = dependencies;
    }

    private async assertEnabled(
        user: Pick<SessionUser, 'userUuid' | 'organizationUuid'>,
    ): Promise<void> {
        const { enabled } = await this.dependencies.featureFlagModel.get({
            user: {
                userUuid: user.userUuid,
                organizationUuid: user.organizationUuid,
            },
            featureFlagId: FeatureFlags.ConnectJourney,
        });
        if (!enabled) {
            throw new ForbiddenError('Organization landing is not enabled');
        }
    }

    private async isSingleOrganizationInstance(): Promise<boolean> {
        if (this.dependencies.lightdashConfig.allowMultiOrgs) return false;
        return this.dependencies.organizationModel.hasOrgs();
    }

    private async getRequestTargets(
        emailDomain: string,
        isEmailVerified: boolean,
        joinable: UserAllowedOrganization[],
    ): Promise<RequestTarget[]> {
        const joinableUuids = joinable.map((org) => org.organizationUuid);
        if (await this.isSingleOrganizationInstance()) {
            const organizations =
                await this.dependencies.organizationModel.getAllOrganizationsWithAdminFlag();
            return organizations.filter(
                (org) => !joinableUuids.includes(org.organizationUuid),
            );
        }
        if (!isEmailVerified || isPublicEmailProviderDomain(emailDomain)) {
            return [];
        }
        return this.dependencies.organizationModel.getOrganizationsWithMemberDomain(
            emailDomain,
            joinableUuids,
        );
    }

    async getLanding(user: SessionUser): Promise<OrganizationLanding> {
        await this.assertEnabled(user);
        if (isUserWithOrg(user)) {
            throw new ForbiddenError('User already has an organization');
        }
        const now = new Date();
        const emailStatus =
            await this.dependencies.emailModel.getPrimaryEmailStatus(
                user.userUuid,
            );
        const emailDomain = getEmailDomain(emailStatus.email);
        const joinable = emailStatus.isVerified
            ? await this.dependencies.organizationModel.getAllowedOrgsForDomain(
                  emailDomain,
              )
            : [];
        const [targets, latestRequests] = await Promise.all([
            this.getRequestTargets(
                emailDomain,
                emailStatus.isVerified,
                joinable,
            ),
            this.dependencies.organizationJoinRequestModel.findLatestForUser(
                user.userUuid,
            ),
        ]);
        const requestable: OrganizationLandingMatch[] = targets.map(
            (target) => {
                const latest = latestRequests.find(
                    (row) => row.organization_uuid === target.organizationUuid,
                );
                return {
                    organizationUuid: target.organizationUuid,
                    name: target.name,
                    hasAdmin: target.hasAdmin,
                    joinRequest: latest ? toSummary(latest, now) : null,
                };
            },
        );
        return {
            emailDomain,
            isEmailVerified: emailStatus.isVerified,
            canCreateOrganization: !(await this.isSingleOrganizationInstance()),
            joinable,
            requestable,
        };
    }

    async requestToJoin(
        user: SessionUser,
        organizationUuid: string,
    ): Promise<OrganizationJoinRequestSummary> {
        const landing = await this.getLanding(user);
        const target = landing.requestable.find(
            (match) => match.organizationUuid === organizationUuid,
        );
        if (!target) {
            throw new ForbiddenError(
                'You cannot request to join this organization',
            );
        }
        const now = new Date();
        if (
            target.joinRequest?.status === OrganizationJoinRequestStatus.PENDING
        ) {
            return target.joinRequest;
        }
        const { organizationJoinRequestModel } = this.dependencies;
        await organizationJoinRequestModel.expirePendingForUser(
            user.userUuid,
            organizationUuid,
            now,
        );
        const createdInLastDay =
            await organizationJoinRequestModel.countCreatedSince(
                user.userUuid,
                new Date(now.getTime() - DAY_MS),
            );
        if (isOrganizationJoinRequestLimitReached(createdInLastDay)) {
            throw new ForbiddenError(
                'You have sent too many requests to join today. Try again tomorrow.',
            );
        }
        const row = await organizationJoinRequestModel.create({
            organizationUuid,
            userUuid: user.userUuid,
            expiresAt: getOrganizationJoinRequestExpiry(now),
        });
        this.dependencies.analytics.track({
            event: 'organization_join_request.created',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
                hasAdmin: target.hasAdmin,
                isEmailVerified: landing.isEmailVerified,
            },
        });
        await this.notifyAdmins(user, organizationUuid);
        return toSummary(row, now);
    }

    private async notifyAdmins(
        user: SessionUser,
        organizationUuid: string,
    ): Promise<void> {
        const { lightdashConfig, emailClient, organizationMemberProfileModel } =
            this.dependencies;
        if (!lightdashConfig.smtp) return;
        try {
            const [admins, organization] = await Promise.all([
                organizationMemberProfileModel.getOrganizationAdmins(
                    organizationUuid,
                ),
                this.dependencies.organizationModel.get(organizationUuid),
            ]);
            const recipients = admins
                .filter((admin) => admin.isActive)
                .map((admin) => admin.email);
            if (recipients.length === 0) return;
            await emailClient.sendGenericNotificationEmail(
                recipients,
                `Request to join ${organization.name}`,
                'Someone asked to join your organization',
                `${user.email} asked to join ${organization.name}. Approve or decline the request in [Users & groups](${lightdashConfig.siteUrl}/generalSettings/userManagement). The request expires in 14 days.`,
            );
        } catch (error) {
            this.logger.error('Failed to notify admins of a request to join', {
                organizationUuid,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    private async notifyRequester(
        userUuid: string,
        organizationUuid: string,
        decision:
            | OrganizationJoinRequestStatus.APPROVED
            | OrganizationJoinRequestStatus.DECLINED,
    ): Promise<void> {
        const { lightdashConfig, emailClient, userModel } = this.dependencies;
        if (!lightdashConfig.smtp) return;
        try {
            const [requester, organization] = await Promise.all([
                userModel.findSessionUserByUUID(userUuid),
                this.dependencies.organizationModel.get(organizationUuid),
            ]);
            if (!requester.email) return;
            const isApproved =
                decision === OrganizationJoinRequestStatus.APPROVED;
            await emailClient.sendGenericNotificationEmail(
                [requester.email],
                isApproved
                    ? `You joined ${organization.name}`
                    : `Your request to join ${organization.name}`,
                isApproved
                    ? 'Your request to join was approved'
                    : 'Your request to join was declined',
                isApproved
                    ? `An admin approved your request. [Open Lightdash](${lightdashConfig.siteUrl}) to start.`
                    : `An admin declined your request to join ${organization.name}. You can create your own organization in [Lightdash](${lightdashConfig.siteUrl}).`,
            );
        } catch (error) {
            this.logger.error('Failed to notify a requester', {
                userUuid,
                organizationUuid,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    private async assertCanManageRequests(
        account: RegisteredAccount,
    ): Promise<string> {
        const { organizationUuid } = account.organization;
        if (!organizationUuid) {
            throw new ForbiddenError('User is not part of an organization');
        }
        await this.assertEnabled({
            userUuid: account.user.userUuid,
            organizationUuid,
        });
        const ability = this.createAuditedAbility(account);
        if (
            ability.cannot(
                'manage',
                subject('OrganizationMemberProfile', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        return organizationUuid;
    }

    async listJoinRequests(
        account: RegisteredAccount,
    ): Promise<OrganizationJoinRequest[]> {
        const organizationUuid = await this.assertCanManageRequests(account);
        return this.dependencies.organizationJoinRequestModel.listOpenForOrganization(
            organizationUuid,
            new Date(),
        );
    }

    private async getOpenRequest(
        organizationUuid: string,
        joinRequestUuid: string,
    ): Promise<DbOrganizationJoinRequest> {
        const row =
            await this.dependencies.organizationJoinRequestModel.get(
                joinRequestUuid,
            );
        if (row.organization_uuid !== organizationUuid) {
            throw new NotFoundError('Request to join not found');
        }
        const status = getOrganizationJoinRequestStatus(
            { status: row.status, expiresAt: row.expires_at },
            new Date(),
        );
        if (status !== OrganizationJoinRequestStatus.PENDING) {
            throw new ParameterError('This request is no longer open');
        }
        return row;
    }

    async approveJoinRequest(
        account: RegisteredAccount,
        joinRequestUuid: string,
        role: OrganizationMemberRole,
    ): Promise<void> {
        if (!Object.values(OrganizationMemberRole).includes(role)) {
            throw new ParameterError('Choose a role for the new member');
        }
        const organizationUuid = await this.assertCanManageRequests(account);
        const row = await this.getOpenRequest(
            organizationUuid,
            joinRequestUuid,
        );
        const requester =
            await this.dependencies.userModel.findSessionUserByUUID(
                row.user_uuid,
            );
        if (isUserWithOrg(requester)) {
            throw new ParameterError(
                'This person already belongs to an organization',
            );
        }
        await this.dependencies.userModel.joinOrg(
            row.user_uuid,
            organizationUuid,
            role,
            undefined,
        );
        this.dependencies.userModel.invalidateSessionUserCache(row.user_uuid);
        await this.dependencies.organizationJoinRequestModel.decide(
            joinRequestUuid,
            OrganizationJoinRequestStatus.APPROVED,
            account.user.userUuid,
        );
        this.dependencies.analytics.track({
            event: 'organization_join_request.decided',
            userId: account.user.userUuid,
            properties: {
                organizationId: organizationUuid,
                joinRequestId: joinRequestUuid,
                decision: OrganizationJoinRequestStatus.APPROVED,
                role,
            },
        });
        await this.notifyRequester(
            row.user_uuid,
            organizationUuid,
            OrganizationJoinRequestStatus.APPROVED,
        );
    }

    async declineJoinRequest(
        account: RegisteredAccount,
        joinRequestUuid: string,
    ): Promise<void> {
        const organizationUuid = await this.assertCanManageRequests(account);
        const row = await this.getOpenRequest(
            organizationUuid,
            joinRequestUuid,
        );
        await this.dependencies.organizationJoinRequestModel.decide(
            joinRequestUuid,
            OrganizationJoinRequestStatus.DECLINED,
            account.user.userUuid,
        );
        this.dependencies.analytics.track({
            event: 'organization_join_request.decided',
            userId: account.user.userUuid,
            properties: {
                organizationId: organizationUuid,
                joinRequestId: joinRequestUuid,
                decision: OrganizationJoinRequestStatus.DECLINED,
                role: null,
            },
        });
        await this.notifyRequester(
            row.user_uuid,
            organizationUuid,
            OrganizationJoinRequestStatus.DECLINED,
        );
    }
}
