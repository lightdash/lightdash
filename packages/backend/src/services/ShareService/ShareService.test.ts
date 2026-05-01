import { ForbiddenError } from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { ShareModel } from '../../models/ShareModel';
import { ShareService } from './ShareService';
import {
    Account,
    AccountFromAnotherOrg,
    Config,
    FullShareUrl,
    FullShareUrlWithoutParams,
    SampleShareUrl,
    ShareUrlWithoutParams,
} from './ShareService.mock';

const shareModel = {
    createSharedUrl: jest.fn(async () => SampleShareUrl),
    getSharedUrl: jest.fn(async () => SampleShareUrl),
};

describe('share', () => {
    const shareService = new ShareService({
        analytics: analyticsMock,
        shareModel: shareModel as unknown as ShareModel,
        lightdashConfig: Config,
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('Should save sharedUrl', async () => {
        expect(
            await shareService.createShareUrl(
                Account,
                SampleShareUrl.path,
                SampleShareUrl.params,
            ),
        ).toEqual(FullShareUrl);
    });
    it('Should get saved sharedUrl', async () => {
        expect(
            await shareService.getShareUrl(Account, SampleShareUrl.nanoid),
        ).toEqual(FullShareUrl);
    });

    it('Should get saved sharedUrl without params', async () => {
        (shareModel.getSharedUrl as jest.Mock).mockImplementationOnce(
            async () => ShareUrlWithoutParams,
        );

        expect(
            await shareService.getShareUrl(
                Account,
                ShareUrlWithoutParams.nanoid,
            ),
        ).toEqual(FullShareUrlWithoutParams);
    });

    it('Should throw error if user does not have access to the organization', async () => {
        await expect(
            shareService.getShareUrl(
                AccountFromAnotherOrg,
                SampleShareUrl.nanoid,
            ),
        ).rejects.toThrowError(ForbiddenError);
    });
});
