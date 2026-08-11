import knex from 'knex';
import { MockClient } from 'knex-mock-client';
import { ContentFilters } from '../ContentModelTypes';
import { dataAppContentConfiguration } from './DataAppContentConfiguration';

const db = knex({ client: MockClient, dialect: 'pg' });

const buildQuery = (filters: ContentFilters) =>
    dataAppContentConfiguration.getSummaryQuery(db, filters).toSQL();

describe('dataAppContentConfiguration.getSummaryQuery dataAppVizsFilter', () => {
    it('does not filter on template by default', () => {
        const { sql } = buildQuery({});
        expect(sql).not.toContain('"apps"."template" =');
        expect(sql).not.toContain('"apps"."template" is null');
    });

    it('excludes viz template rows when dataAppVizsFilter is "exclude"', () => {
        const { sql, bindings } = buildQuery({
            dataAppVizsFilter: 'exclude',
        });
        // knex renders whereNot(col, val) as `not col = ?` rather than `!= ?`
        expect(sql).toContain('not "apps"."template" = ?');
        expect(sql).toContain('"apps"."template" is null');
        expect(bindings).toContain('data_app_viz');
    });

    it('keeps deleted vizs visible in the recently-deleted view (no exclusion when the filter is not passed)', () => {
        const { sql } = buildQuery({ deleted: true });
        expect(sql).not.toContain('"apps"."template" =');
        expect(sql).not.toContain('"apps"."template" is null');
    });

    it('returns only viz template rows when dataAppVizsFilter is "only"', () => {
        const { sql, bindings } = buildQuery({ dataAppVizsFilter: 'only' });
        expect(sql).toContain('"apps"."template" = ?');
        expect(bindings).toContain('data_app_viz');
    });

    it('does not scope "only" mode by space, even with spaceUuids set and no personal opt-in — vizs are spaceless and project-global', () => {
        const { sql, bindings } = buildQuery({
            dataAppVizsFilter: 'only',
            spaceUuids: ['space-1'],
        });
        expect(sql).not.toContain('"spaces"."space_uuid" in');
        expect(sql).not.toContain('"apps"."space_uuid" is not null');
        expect(bindings).not.toContain('space-1');
    });

    it('still scopes "exclude" mode by space (guards against over-broad skipping of the space-visibility block)', () => {
        const { sql, bindings } = buildQuery({
            dataAppVizsFilter: 'exclude',
            spaceUuids: ['space-1'],
        });
        expect(sql).toContain('"spaces"."space_uuid" in');
        expect(bindings).toContain('space-1');
    });
});
