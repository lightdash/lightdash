import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ContentDraftsTableName } from '../database/entities/contentDrafts';
import { dismissOpenContentDrafts } from './ContentDraftModel';

describe('dismissOpenContentDrafts', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('dismisses only the open drafts of the given content', async () => {
        tracker.on.update(ContentDraftsTableName).responseOnce(2);

        const count = await dismissOpenContentDrafts(database, 'chart', [
            'chart-a',
            'chart-b',
        ]);

        expect(count).toBe(2);
        const [query] = tracker.history.update;
        expect(query.sql).toContain('content_uuid');
        expect(query.bindings).toEqual(
            expect.arrayContaining([
                'dismissed',
                'chart',
                'open',
                'chart-a',
                'chart-b',
            ]),
        );
    });

    it('does nothing for an empty list', async () => {
        await expect(
            dismissOpenContentDrafts(database, 'dashboard', []),
        ).resolves.toBe(0);
        expect(tracker.history.update).toHaveLength(0);
    });
});
