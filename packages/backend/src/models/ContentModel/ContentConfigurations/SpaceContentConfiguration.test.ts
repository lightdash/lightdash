import knex from 'knex';
import { MockClient } from 'knex-mock-client';
import { ContentFilters } from '../ContentModelTypes';
import { spaceContentConfiguration } from './SpaceContentConfiguration';

const db = knex({ client: MockClient, dialect: 'pg' });

const buildSql = (filters: ContentFilters): string =>
    spaceContentConfiguration.getSummaryQuery(db, filters).toSQL().sql;

const baseFilters: ContentFilters = {
    spaceUuids: ['00000000-0000-0000-0000-000000000001'],
    space: { rootSpaces: true },
};

describe('spaceContentConfiguration.getSummaryQuery rootSpaces search', () => {
    it('restricts to root spaces when no search term is provided', () => {
        const sql = buildSql(baseFilters);
        expect(sql).toContain('nlevel(path) = 1');
    });

    it('matches spaces at any nesting level when searching (issue #23887)', () => {
        const sql = buildSql({ ...baseFilters, search: 'nested space' });
        expect(sql).not.toContain('nlevel(path) = 1');
    });
});
