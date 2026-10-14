import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { ReleaseHighlightsTableName } from '../database/entities/releaseHighlights';
import { ReleaseHighlightsModel } from './ReleaseHighlightsModel';

const database = knex({ client: MockClient, dialect: 'pg' });
const model = new ReleaseHighlightsModel({ database });
const candidates = [
    {
        id: 'pr-1',
        version: '2.2.0',
        scope: null,
        text: 'A feature',
        number: 1,
        url: 'https://github.com/lightdash/lightdash/pull/1',
    },
];
const ranked = [
    { candidateId: 'pr-1', title: 'A feature', benefit: 'Do a thing' },
];
const tracker = getTracker();

afterEach(() => tracker.reset());
afterAll(() => database.destroy());

it('returns null for a missing range', async () => {
    tracker.on.select(ReleaseHighlightsTableName).responseOnce([]);
    expect(await model.get('2.1.0', '2.2.0')).toBeNull();
});

it('maps a persisted range to the cached candidates and ranking', async () => {
    const generatedAt = new Date('2026-10-14');
    tracker.on.select(ReleaseHighlightsTableName).responseOnce([
        {
            from_version: '2.1.0',
            to_version: '2.2.0',
            candidates,
            ranked,
            created_at: generatedAt,
        },
    ]);
    expect(await model.get('2.1.0', '2.2.0')).toEqual({
        fromVersion: '2.1.0',
        toVersion: '2.2.0',
        candidates,
        ranked,
        generatedAt,
    });
});

it('uses conflict ignore for range writes', async () => {
    tracker.on.insert(ReleaseHighlightsTableName).responseOnce([]);
    await model.insert('2.1.0', '2.2.0', candidates, ranked);
    expect(tracker.history.insert[0].sql).toContain(
        'on conflict ("from_version", "to_version") do nothing',
    );
    expect(tracker.history.insert[0].bindings).toEqual([
        JSON.stringify(candidates),
        '2.1.0',
        JSON.stringify(ranked),
        '2.2.0',
    ]);
});
