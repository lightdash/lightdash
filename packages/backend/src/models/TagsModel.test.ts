import knex from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { TagsTableName } from '../database/entities/tags';
import { TagsModel } from './TagsModel';

describe('TagsModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new TagsModel({ database });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
    });

    it('only updates allowed tag fields', async () => {
        tracker.on.update(TagsTableName).responseOnce(1);

        await model.update('tag-uuid', {
            name: 'Core Metrics',
            color: 'blue',
            yaml_reference: 'veria-proof',
        } as unknown as Parameters<TagsModel['update']>[1]);

        const [query] = tracker.history.update;
        expect(query.sql).toContain(TagsTableName);
        expect(query.sql).toContain('name');
        expect(query.sql).toContain('color');
        expect(query.sql).not.toContain('yaml_reference');
        expect(query.bindings).not.toContain('veria-proof');
    });
});
