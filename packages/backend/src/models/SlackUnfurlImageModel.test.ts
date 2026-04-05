import { NotFoundError } from '@lightdash/common';
import knex, { Knex } from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { SlackUnfurlImageModel } from './SlackUnfurlImageModel';

describe('SlackUnfurlImageModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new SlackUnfurlImageModel({
        database: database as unknown as Knex,
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    describe('create', () => {
        it('inserts a row with correct column mapping', async () => {
            tracker.on
                .insert(({ sql }) => sql.includes('slack_unfurl_images'))
                .responseOnce([]);

            await model.create({
                nanoid: 'abcdefghijklmnopqrstu',
                s3Key: 'slack-image-test.png',
                organizationUuid: '00000000-0000-0000-0000-000000000001',
            });

            expect(tracker.history.insert).toHaveLength(1);
            const insertCall = tracker.history.insert[0];
            expect(insertCall.bindings).toEqual([
                'abcdefghijklmnopqrstu',
                '00000000-0000-0000-0000-000000000001',
                'slack-image-test.png',
            ]);
        });
    });

    describe('get', () => {
        it('returns the record when nanoid exists', async () => {
            const mockRow = {
                nanoid: 'abcdefghijklmnopqrstu',
                s3_key: 'slack-image-test.png',
                organization_uuid: '00000000-0000-0000-0000-000000000001',
                created_at: new Date('2026-01-01'),
            };

            tracker.on
                .select(({ sql }) => sql.includes('slack_unfurl_images'))
                .responseOnce(mockRow);

            const result = await model.get('abcdefghijklmnopqrstu');

            expect(result).toEqual(mockRow);
            expect(tracker.history.select).toHaveLength(1);
        });

        it('throws NotFoundError when nanoid does not exist', async () => {
            tracker.on
                .select(({ sql }) => sql.includes('slack_unfurl_images'))
                .responseOnce(undefined);

            await expect(model.get('nonexistentnanoid12345')).rejects.toThrow(
                NotFoundError,
            );
        });
    });
});
