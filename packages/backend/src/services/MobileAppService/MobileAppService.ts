import {
    FeatureFlags,
    ForbiddenError,
    NotFoundError,
    TooManyRequestsError,
    type MobileAppLink,
    type MobileAppLinkStatus,
    type MobileAppPlatform,
    type SessionUser,
} from '@lightdash/common';
import { validate as isValidUuid } from 'uuid';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import {
    hashMobileAppLinkKey,
    MOBILE_APP_LINK_TTL_MINUTES,
    MobileAppLinkModel,
} from '../../models/MobileAppLinkModel';
import { BaseService } from '../BaseService';
import { MOBILE_APP_STRINGS } from './mobileAppStrings';

export const MOBILE_APP_LINK_MINTS_PER_HOUR = 30;
export const MOBILE_APP_SCANS_PER_CLIENT_LINK_PER_MINUTE = 10;

type MobileAppLinkModelMethods = Pick<
    MobileAppLinkModel,
    | 'create'
    | 'findForUser'
    | 'hasActiveLink'
    | 'recordScan'
    | 'incrementRateCounter'
>;

type MobileAppServiceArguments = {
    mobileAppLinkModel: MobileAppLinkModelMethods;
    featureFlagModel: Pick<FeatureFlagModel, 'get'>;
    analytics: Pick<LightdashAnalytics, 'track'>;
    lightdashConfig: Pick<LightdashConfig, 'siteUrl'>;
    now?: () => Date;
};

const startOfWindow = (date: Date, windowMs: number): Date =>
    new Date(Math.floor(date.getTime() / windowMs) * windowMs);

export class MobileAppService extends BaseService {
    private readonly mobileAppLinkModel: MobileAppLinkModelMethods;

    private readonly featureFlagModel: Pick<FeatureFlagModel, 'get'>;

    private readonly analytics: Pick<LightdashAnalytics, 'track'>;

    private readonly lightdashConfig: Pick<LightdashConfig, 'siteUrl'>;

    private readonly now: () => Date;

    constructor({
        mobileAppLinkModel,
        featureFlagModel,
        analytics,
        lightdashConfig,
        now,
    }: MobileAppServiceArguments) {
        super({ serviceName: 'MobileAppService' });
        this.mobileAppLinkModel = mobileAppLinkModel;
        this.featureFlagModel = featureFlagModel;
        this.analytics = analytics;
        this.lightdashConfig = lightdashConfig;
        this.now = now ?? (() => new Date());
    }

    private async assertEnabled(user: SessionUser): Promise<string> {
        if (!user.organizationUuid) {
            throw new ForbiddenError(MOBILE_APP_STRINGS.noOrganization);
        }
        const { enabled } = await this.featureFlagModel.get({
            user,
            featureFlagId: FeatureFlags.MobileSettings,
        });
        if (!enabled) {
            throw new ForbiddenError(MOBILE_APP_STRINGS.notEnabled);
        }
        return user.organizationUuid;
    }

    async createLink(user: SessionUser): Promise<MobileAppLink> {
        const organizationUuid = await this.assertEnabled(user);
        const mints = await this.mobileAppLinkModel.incrementRateCounter({
            keyHash: hashMobileAppLinkKey(`user:${user.userUuid}`),
            operation: 'mint',
            windowStartedAt: startOfWindow(this.now(), 60 * 60 * 1000),
        });
        if (mints > MOBILE_APP_LINK_MINTS_PER_HOUR) {
            throw new TooManyRequestsError(MOBILE_APP_STRINGS.tooManyLinks);
        }
        const { linkUuid, scanId, expiresAt } =
            await this.mobileAppLinkModel.create(
                user.userUuid,
                organizationUuid,
            );
        this.analytics.track({
            userId: user.userUuid,
            event: 'mobile_app_link.created',
            properties: {
                userId: user.userUuid,
                organizationId: organizationUuid,
                linkUuid,
            },
        });
        const siteUrl = this.lightdashConfig.siteUrl.replace(/\/+$/, '');
        return {
            linkUuid,
            scanUrl: `${siteUrl}/m/app/${scanId}`,
            expiresAt: expiresAt.toISOString(),
            expiresInSeconds: MOBILE_APP_LINK_TTL_MINUTES * 60,
        };
    }

    async getLinkStatus(
        user: SessionUser,
        linkUuid: string,
    ): Promise<MobileAppLinkStatus> {
        await this.assertEnabled(user);
        const link = isValidUuid(linkUuid)
            ? await this.mobileAppLinkModel.findForUser(linkUuid, user.userUuid)
            : null;
        if (!link) {
            throw new NotFoundError(MOBILE_APP_STRINGS.linkNotFound);
        }
        return {
            linkUuid: link.mobile_app_link_uuid,
            expiresAt: link.expires_at.toISOString(),
            scannedAt: link.first_scanned_at?.toISOString() ?? null,
            scanPlatform: link.first_scan_platform,
        };
    }

    async recordScan(args: {
        scanId: string;
        platform: MobileAppPlatform;
        clientAddress: string;
    }): Promise<void> {
        if (!(await this.mobileAppLinkModel.hasActiveLink(args.scanId))) return;
        const scans = await this.mobileAppLinkModel.incrementRateCounter({
            keyHash: hashMobileAppLinkKey(
                `scan:${args.clientAddress}:${args.scanId}`,
            ),
            operation: 'scan',
            windowStartedAt: startOfWindow(this.now(), 60 * 1000),
        });
        if (scans > MOBILE_APP_SCANS_PER_CLIENT_LINK_PER_MINUTE) return;
        const scan = await this.mobileAppLinkModel.recordScan(
            args.scanId,
            args.platform,
        );
        if (!scan) return;
        this.analytics.track({
            userId: scan.userUuid,
            event: 'mobile_app_link.opened',
            properties: {
                userId: scan.userUuid,
                organizationId: scan.organizationUuid,
                linkUuid: scan.linkUuid,
                platform: args.platform,
                secondsSinceCreated: Math.max(
                    0,
                    Math.round(
                        (this.now().getTime() - scan.createdAt.getTime()) /
                            1000,
                    ),
                ),
                isFirstScan: scan.isFirstScan,
            },
        });
    }
}
