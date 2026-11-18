import { DimensionType, type LightdashModel } from '@lightdash/common';
import {
    materializationCatalogCheck,
    materializationModelError,
} from './materializationSource';

const model: LightdashModel = {
    name: 'items',
    type: 'model',
    sql_from: 'raw.items',
    materialize: { max_rows: 100 },
    dimensions: [
        { name: 'id', type: DimensionType.NUMBER, sql: '${TABLE}.id' },
    ],
};

describe('materialization source eligibility', () => {
    it('checks all raw tables in a join and a window query', () => {
        const sql = materializationCatalogCheck(
            '(SELECT a.id, row_number() OVER (PARTITION BY b.id ORDER BY a.id) AS ordinal FROM raw.items a JOIN raw.groups b ON a.group_id = b.id)',
        );
        expect(sql).toContain("('raw', 'items'), ('raw', 'groups')");
        expect(sql).toContain('count(*) = 2');
        expect(sql).toContain('NOT c.relrowsecurity');
    });

    it('accepts immutable built-ins over raw tables', () => {
        expect(
            materializationCatalogCheck(
                "(SELECT trim(a.name) AS name, coalesce(a.code, 'none') AS code, nullif(a.total, 0) AS total FROM raw.items a)",
            ),
        ).toContain("('raw', 'items')");
    });

    it.each([
        'items',
        '${other.SQL_TABLE_NAME}',
        'select * from raw.items join other on true',
        'select current_user from raw.items',
        'select source_fn(id) from raw.items',
        'select now() from raw.items',
        'select public.lower(name) from raw.items',
        'select lower(name) over () from raw.items',
        'select row_number() over (order by (select id from hidden)) from raw.items',
        'select id from raw.items; select id from other',
        'pg_catalog.pg_class',
    ])('rejects unsupported or unresolved sources %s', (source) => {
        expect(materializationCatalogCheck(source)).toBeNull();
    });
    it('validates the scheduler cron expression at publish', () => {
        const check = (cron: string) =>
            materializationModelError({
                ...model,
                materialize: { max_rows: 5, refresh: { cron } },
            });
        expect(check('15 6 * * 1-5')).toBeNull();
        expect(check('75 6 * * *')).toContain('valid five-field cron');
        expect(check('* * * * * *')).toContain('valid five-field cron');
    });
    it.each([
        {
            ...model,
            joins: [{ join: 'other', sql_on: '${items.id} = ${other.id}' }],
        },
        { ...model, sql_filter: '${TABLE}.id = ${ld.attributes.region}' },
        { ...model, required_attributes: { region: ['all'] } },
        { ...model, pre_aggregates: [] },
        { ...model, sql_filter: '${another_model.id} > 0' },
    ])('rejects model dependencies or incompatible access rules', (input) => {
        expect(materializationModelError(input)).not.toBeNull();
    });
});
