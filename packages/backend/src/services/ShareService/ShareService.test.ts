import { ForbiddenError, ParameterError } from '@lightdash/common';
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
    User,
} from './ShareService.mock';

const shareModel = {
    createSharedUrl: vi.fn(async () => SampleShareUrl),
    getSharedUrl: vi.fn(async () => SampleShareUrl),
};
const unsafeJavascriptUrl = ['javascript', 'alert(1)'].join(':');

describe('share', () => {
    const shareService = new ShareService({
        analytics: analyticsMock,
        shareModel: shareModel as unknown as ShareModel,
        lightdashConfig: Config,
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('Should save sharedUrl', async () => {
        expect(
            await shareService.createShareUrl(
                User,
                SampleShareUrl.path,
                SampleShareUrl.params,
            ),
        ).toEqual(FullShareUrl);
    });

    it.each([
        'https://evil.example.com/pwn',
        'https://test.lightdash.cloud/pwn',
        unsafeJavascriptUrl,
        '//evil.example.com/pwn',
        '//test.lightdash.cloud/pwn',
        '/\\evil.example.com/pwn',
        'projects/uuid/tables/customers',
        '',
    ])('Should reject unsafe share path %j before saving', async (path) => {
        await expect(
            shareService.createShareUrl(User, path, ''),
        ).rejects.toThrowError(ParameterError);
        expect(shareModel.createSharedUrl).not.toHaveBeenCalled();
    });

    it.each(['/evil.example.com/pwn', '\\evil.example.com/pwn'])(
        'Should reject unsafe share params %j before saving',
        async (params) => {
            await expect(
                shareService.createShareUrl(User, '/', params),
            ).rejects.toThrowError(ParameterError);
            expect(shareModel.createSharedUrl).not.toHaveBeenCalled();
        },
    );

    it('Should get saved sharedUrl', async () => {
        expect(
            await shareService.getShareUrl(Account, SampleShareUrl.nanoid),
        ).toEqual(FullShareUrl);
    });

    it('Should reject an unsafe saved share path', async () => {
        (
            shareModel.getSharedUrl as import('vitest').Mock
        ).mockImplementationOnce(async () => ({
            ...SampleShareUrl,
            path: unsafeJavascriptUrl,
        }));

        await expect(
            shareService.getShareUrl(Account, SampleShareUrl.nanoid),
        ).rejects.toThrowError(ParameterError);
    });

    it('Should reject unsafe params from a saved share URL', async () => {
        (
            shareModel.getSharedUrl as import('vitest').Mock
        ).mockImplementationOnce(async () => ({
            ...SampleShareUrl,
            path: '/',
            params: '/evil.example.com/pwn',
        }));

        await expect(
            shareService.getShareUrl(Account, SampleShareUrl.nanoid),
        ).rejects.toThrowError(ParameterError);
    });

    it('Should get saved sharedUrl without params', async () => {
        (
            shareModel.getSharedUrl as import('vitest').Mock
        ).mockImplementationOnce(async () => ShareUrlWithoutParams);

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
