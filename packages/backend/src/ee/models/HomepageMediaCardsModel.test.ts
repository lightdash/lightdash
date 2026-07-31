import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { HomepageMediaCardsTableName } from '../database/entities/homepageMediaCards';
import { HomepageMediaCardsModel } from './HomepageMediaCardsModel';

describe('HomepageMediaCardsModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new HomepageMediaCardsModel({
        database: database as unknown as Knex,
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('lists media cards in deterministic creation order', async () => {
        tracker.on.select(HomepageMediaCardsTableName).responseOnce([
            {
                card_key: 'data-apps-video',
                title: 'Video title',
                subtitle: 'Video subtitle',
                url: 'https://example.com/video',
                thumbnail_url: 'https://example.com/thumbnail.jpg',
            },
            {
                card_key: 'bi-as-code',
                title: 'Article title',
                subtitle: 'Article subtitle',
                url: 'https://example.com/article',
                thumbnail_url: null,
            },
        ]);

        await expect(model.list()).resolves.toEqual([
            {
                cardKey: 'data-apps-video',
                title: 'Video title',
                subtitle: 'Video subtitle',
                url: 'https://example.com/video',
                thumbnailUrl: 'https://example.com/thumbnail.jpg',
            },
            {
                cardKey: 'bi-as-code',
                title: 'Article title',
                subtitle: 'Article subtitle',
                url: 'https://example.com/article',
                thumbnailUrl: null,
            },
        ]);

        const query = tracker.history.select[0];
        expect(query.sql).toContain(
            'order by "created_at" asc, "card_key" asc',
        );
    });
});
