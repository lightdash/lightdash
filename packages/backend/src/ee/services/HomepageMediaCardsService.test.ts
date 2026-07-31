import {
    HomepageMediaCardsService,
    type HomepageMediaCardsServiceArguments,
} from './HomepageMediaCardsService';

describe('HomepageMediaCardsService', () => {
    it('lists instance media cards', async () => {
        const homepageMediaCardsModel = vi.mocked<
            HomepageMediaCardsServiceArguments['homepageMediaCardsModel']
        >({
            list: vi.fn().mockResolvedValue([
                {
                    cardKey: 'data-apps-video',
                    title: 'Video title',
                    subtitle: 'Video subtitle',
                    url: 'https://example.com/video',
                    thumbnailUrl: null,
                },
            ]),
        });
        const service = new HomepageMediaCardsService({
            homepageMediaCardsModel,
        });

        await expect(service.list()).resolves.toEqual([
            {
                cardKey: 'data-apps-video',
                title: 'Video title',
                subtitle: 'Video subtitle',
                url: 'https://example.com/video',
                thumbnailUrl: null,
            },
        ]);
        expect(homepageMediaCardsModel.list).toHaveBeenCalledOnce();
    });
});
