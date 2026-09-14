import { ContentType } from '@lightdash/common';
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

    it('matches spaces at any nesting level for uuid-targeted lookups (issue #26541)', () => {
        const sql = buildSql({
            ...baseFilters,
            uuids: ['00000000-0000-0000-0000-000000000002'],
        });
        expect(sql).not.toContain('nlevel(path) = 1');
    });
});

describe('spaceContentConfiguration.shouldQueryBeIncluded', () => {
    it('excludes spaces from browse queries by default', () => {
        expect(spaceContentConfiguration.shouldQueryBeIncluded({})).toBe(false);
        expect(
            spaceContentConfiguration.shouldQueryBeIncluded({
                projectUuids: ['project-uuid'],
            }),
        ).toBe(false);
    });

    it('includes spaces when explicitly requested via contentTypes', () => {
        expect(
            spaceContentConfiguration.shouldQueryBeIncluded({
                contentTypes: [ContentType.SPACE],
            }),
        ).toBe(true);
    });

    it('includes spaces for uuid-targeted lookups without contentTypes (issue #26541)', () => {
        expect(
            spaceContentConfiguration.shouldQueryBeIncluded({
                uuids: ['space-uuid'],
            }),
        ).toBe(true);
    });

    it('respects an explicit contentTypes filter that excludes spaces, even with uuids', () => {
        expect(
            spaceContentConfiguration.shouldQueryBeIncluded({
                uuids: ['chart-uuid'],
                contentTypes: [ContentType.CHART],
            }),
        ).toBe(false);
    });

    it('includes spaces in the deleted content "all" view', () => {
        expect(
            spaceContentConfiguration.shouldQueryBeIncluded({ deleted: true }),
        ).toBe(true);
    });
});
