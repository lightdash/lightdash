import { SupportedDbtAdapter } from '../types/dbt';
import { isExploreError } from '../types/explore';
import { DimensionType } from '../types/field';
import { DEFAULT_SPOTLIGHT_CONFIG } from '../types/lightdashProjectConfig';
import {
    setCatalogNestedColumnShape,
    type WarehouseCatalog,
} from '../types/warehouse';
import { getBigqueryUnnestSql } from '../utils/warehouse';
import { warehouseClientMock } from './exploreCompiler.mock';
import { attachTypesToModels, convertExplores } from './translator';
import { model } from './translator.mock';
import { resolveWritebackColumn } from './writebackColumn';

const bigqueryClientMock = {
    ...warehouseClientMock,
    getAdapterType: () => SupportedDbtAdapter.BIGQUERY,
    getFieldQuoteChar: () => '`',
    getUnnestSql: getBigqueryUnnestSql,
};

const column = (name: string) => ({ name, meta: {} });

const sessions = {
    ...model,
    name: 'sessions',
    alias: 'sessions',
    unique_id: 'model.sessions',
    database: 'db',
    schema: 'ds',
    relation_name: '`db`.`ds`.`sessions`',
    meta: {},
    columns: {
        visit_id: column('visit_id'),
        'totals.pageviews': column('totals.pageviews'),
        'hits.page.path': column('hits.page.path'),
        'hits.product.sku': column('hits.product.sku'),
        tags: column('tags'),
    },
};

const visits = {
    ...model,
    name: 'visits',
    alias: 'visits',
    unique_id: 'model.visits',
    database: 'db',
    schema: 'ds',
    relation_name: '`db`.`ds`.`visits`',
    meta: {
        joins: [
            {
                join: 'sessions',
                alias: 'same_session',
                sql_on: '${visits.visit_id} = ${same_session.visit_id}',
            },
        ],
    },
    columns: { visit_id: column('visit_id') },
};

const catalog: WarehouseCatalog = {
    db: {
        ds: {
            sessions: {
                visit_id: DimensionType.NUMBER,
                totals: DimensionType.STRING,
                'totals.pageviews': DimensionType.NUMBER,
                hits: DimensionType.STRING,
                'hits.page': DimensionType.STRING,
                'hits.page.path': DimensionType.STRING,
                'hits.product': DimensionType.STRING,
                'hits.product.sku': DimensionType.STRING,
                tags: DimensionType.STRING,
            },
            visits: { visit_id: DimensionType.NUMBER },
        },
    },
};
Object.entries({
    totals: { repeated: false, record: true },
    hits: { repeated: true, record: true },
    'hits.page': { repeated: false, record: true },
    'hits.product': { repeated: true, record: true },
    tags: { repeated: true, record: false },
}).forEach(([path, shape]) =>
    setCatalogNestedColumnShape(catalog, 'db', 'ds', 'sessions', path, shape),
);

const compile = async (name: string) => {
    const explores = await convertExplores(
        attachTypesToModels([sessions, visits], catalog, true),
        false,
        SupportedDbtAdapter.BIGQUERY,
        bigqueryClientMock,
        { spotlight: DEFAULT_SPOTLIGHT_CONFIG },
    );
    const explore = explores.find((e) => e.name === name);
    if (!explore || isExploreError(explore)) {
        throw new Error(JSON.stringify(explore));
    }
    return explore;
};

describe('resolveWritebackColumn', () => {
    it('keeps a plain column and a struct leaf on their own model', async () => {
        const explore = await compile('sessions');
        expect(resolveWritebackColumn(explore, 'sessions', 'visit_id')).toEqual(
            {
                model: 'sessions',
                column: 'visit_id',
                sql: '${TABLE}.visit_id',
                isScalarArrayElement: false,
            },
        );
        expect(
            resolveWritebackColumn(explore, 'sessions', 'totals.pageviews'),
        ).toMatchObject({ model: 'sessions', column: 'totals.pageviews' });
    });

    it('maps a leaf of an unnested table back to the dotted column of its model', async () => {
        const explore = await compile('sessions');
        expect(
            resolveWritebackColumn(explore, 'sessions__hits', 'page.path'),
        ).toEqual({
            model: 'sessions',
            column: 'hits.page.path',
            sql: '${TABLE}.page.path',
            isScalarArrayElement: false,
        });
        expect(
            resolveWritebackColumn(explore, 'sessions__hits__product', 'sku'),
        ).toMatchObject({ model: 'sessions', column: 'hits.product.sku' });
    });

    it('maps the element of an array of scalars to the array column itself', async () => {
        const explore = await compile('sessions');
        expect(
            resolveWritebackColumn(explore, 'sessions__tags', 'value'),
        ).toEqual({
            model: 'sessions',
            column: 'tags',
            sql: '${TABLE}',
            isScalarArrayElement: true,
        });
    });

    it('refuses the element position, which has no column in the model', async () => {
        const explore = await compile('sessions');
        expect(() =>
            resolveWritebackColumn(explore, 'sessions__hits', 'offset'),
        ).toThrow('not a column of model "sessions"');
    });

    it('resolves an unnested table under a join alias to the joined model', async () => {
        const explore = await compile('visits');
        expect(
            resolveWritebackColumn(explore, 'same_session__hits', 'page.path'),
        ).toMatchObject({ model: 'sessions', column: 'hits.page.path' });
    });

    it('rejects tables and dimensions that are not in the explore', async () => {
        const explore = await compile('sessions');
        expect(() =>
            resolveWritebackColumn(explore, 'orders', 'visit_id'),
        ).toThrow('not part of explore');
        expect(() =>
            resolveWritebackColumn(explore, 'sessions', 'missing'),
        ).toThrow('not found in table');
    });
});
