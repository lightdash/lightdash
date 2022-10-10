import { shareModel } from '../../models/models';
import { ShareService } from './ShareService';
import {
    Config,
    FullShareUrl,
    FullShareUrlWithoutParams,
    ShareUrl,
    ShareUrlWithoutParams,
} from './ShareService.mock';

jest.mock('../../models/models', () => ({
    shareModel: {
        createSharedUrl: jest.fn(async () => ShareUrl),
        getSharedUrl: jest.fn(async () => ShareUrl),
    },
}));

describe('share', () => {
    const shareService = new ShareService({
        shareModel,
        lightdashConfig: Config,
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('Should save sharedUrl', async () => {
        expect(
            await shareService.createShareUrl(ShareUrl.path, ShareUrl.params),
        ).toEqual(FullShareUrl);
    });
    it('Should get saved sharedUrl', async () => {
        expect(await shareService.getShareUrl(ShareUrl.nanoid)).toEqual(
            FullShareUrl,
        );
    });

    it('Should get saved sharedUrl without params', async () => {
        (shareModel.getSharedUrl as jest.Mock).mockImplementationOnce(
            async () => ShareUrlWithoutParams,
        );

        expect(
            await shareService.getShareUrl(ShareUrlWithoutParams.nanoid),
        ).toEqual(FullShareUrlWithoutParams);
    });
});
