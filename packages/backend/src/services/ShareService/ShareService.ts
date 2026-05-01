import { subject } from '@casl/ability';
import {
    Account,
    assertIsAccountWithOrg,
    ForbiddenError,
    NotFoundError,
    RegisteredAccount,
    ShareUrl,
} from '@lightdash/common';
import { nanoid as nanoidGenerator } from 'nanoid';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import { ShareModel } from '../../models/ShareModel';
import { BaseService } from '../BaseService';

type ShareServiceArguments = {
    analytics: LightdashAnalytics;
    shareModel: ShareModel;
    lightdashConfig: Pick<LightdashConfig, 'siteUrl'>;
};

export class ShareService extends BaseService {
    private readonly lightdashConfig: Pick<LightdashConfig, 'siteUrl'>;

    private readonly analytics: LightdashAnalytics;

    private readonly shareModel: ShareModel;

    constructor(args: ShareServiceArguments) {
        super();
        this.lightdashConfig = args.lightdashConfig;
        this.analytics = args.analytics;
        this.shareModel = args.shareModel;
    }

    private shareUrlWithHost(shareUrl: ShareUrl) {
        const host = this.lightdashConfig.siteUrl;
        return {
            ...shareUrl,
            host,
            shareUrl: `${host}/share/${shareUrl.nanoid}`,
            url: `${shareUrl.path}${shareUrl.params}`,
        };
    }

    async getShareUrl(account: Account, nanoid: string): Promise<ShareUrl> {
        assertIsAccountWithOrg(account);
        const shareUrl = await this.shareModel.getSharedUrl(nanoid);
        if (!shareUrl.organizationUuid) {
            throw new NotFoundError('Shared link does not exist');
        }

        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'view',
                subject('OrganizationMemberProfile', {
                    organizationUuid: shareUrl.organizationUuid,
                    metadata: { shareNanoid: shareUrl.nanoid },
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        this.analytics.track({
            userId: account.user.id,
            event: 'share_url.used',
            properties: {
                path: shareUrl.path,
                organizationId: account.organization.organizationUuid,
            },
        });
        return this.shareUrlWithHost(shareUrl);
    }

    async createShareUrl(
        account: RegisteredAccount,
        path: string,
        params: string,
    ): Promise<ShareUrl> {
        assertIsAccountWithOrg(account);
        const shareUrl = await this.shareModel.createSharedUrl({
            path,
            params,
            nanoid: nanoidGenerator(),
            organizationUuid: account.organization.organizationUuid,
            createdByUserUuid: account.user.userUuid,
        });

        this.analytics.track({
            userId: account.user.userUuid,
            event: 'share_url.created',
            properties: {
                path: shareUrl.path,
                organizationId: account.organization.organizationUuid,
            },
        });

        return this.shareUrlWithHost(shareUrl);
    }
}
