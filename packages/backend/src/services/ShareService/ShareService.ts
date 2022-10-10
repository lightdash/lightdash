import { ShareUrl } from '@lightdash/common';
import { nanoid as nanoidGenerator } from 'nanoid';
import { LightdashConfig } from '../../config/parseConfig';
import { ShareModel } from '../../models/ShareModel';

type Dependencies = {
    shareModel: ShareModel;
    lightdashConfig: Pick<LightdashConfig, 'siteUrl'>;
};

export class ShareService {
    private readonly lightdashConfig: Pick<LightdashConfig, 'siteUrl'>;

    private readonly shareModel: ShareModel;

    constructor(dependencies: Dependencies) {
        this.lightdashConfig = dependencies.lightdashConfig;
        this.shareModel = dependencies.shareModel;
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

    async getShareUrl(nanoid: string): Promise<ShareUrl> {
        const shareUrl = await this.shareModel.getSharedUrl(nanoid);
        return this.shareUrlWithHost(shareUrl);
    }

    async createShareUrl(path: string, params: string): Promise<ShareUrl> {
        const shareUrl = await this.shareModel.createSharedUrl({
            path,
            params,
            nanoid: nanoidGenerator(),
        });

        return this.shareUrlWithHost(shareUrl);
    }
}
