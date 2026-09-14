import {
    DimensionType,
    setCatalogNestedColumnShape,
    type WarehouseCatalog,
} from '@lightdash/common';
import { isDocBlock, isGeneratableColumn } from './models';

describe('Models', () => {
    describe('isGeneratableColumn', () => {
        const ref = { database: 'db', schema: 'ds', table: 'sessions' };
        const catalog: WarehouseCatalog = {
            db: {
                ds: {
                    sessions: {
                        visitId: DimensionType.NUMBER,
                        totals: DimensionType.STRING,
                        'totals.pageviews': DimensionType.NUMBER,
                        hits: DimensionType.STRING,
                        'hits.page': DimensionType.STRING,
                        'hits.page.pagePath': DimensionType.STRING,
                        tags: DimensionType.STRING,
                    },
                },
            },
        };
        const shapes = {
            totals: { repeated: false, record: true },
            hits: { repeated: true, record: true },
            'hits.page': { repeated: false, record: true },
            tags: { repeated: true, record: false },
        };
        Object.entries(shapes).forEach(([path, shape]) =>
            setCatalogNestedColumnShape(
                catalog,
                ref.database,
                ref.schema,
                ref.table,
                path,
                shape,
            ),
        );

        test('keeps scalar columns and leaves under plain structs', () => {
            expect(isGeneratableColumn(catalog, ref, 'visitId')).toBe(true);
            expect(isGeneratableColumn(catalog, ref, 'totals.pageviews')).toBe(
                true,
            );
        });
        test('keeps an array of scalars, exposed through its container entry', () => {
            expect(isGeneratableColumn(catalog, ref, 'tags')).toBe(true);
        });
        test('skips struct and repeated record containers', () => {
            expect(isGeneratableColumn(catalog, ref, 'totals')).toBe(false);
            expect(isGeneratableColumn(catalog, ref, 'hits')).toBe(false);
        });
        test('skips leaves beneath a repeated node', () => {
            expect(isGeneratableColumn(catalog, ref, 'hits.page')).toBe(false);
            expect(
                isGeneratableColumn(catalog, ref, 'hits.page.pagePath'),
            ).toBe(false);
        });
    });
    describe('isDocBlock', () => {
        test('should match all doc block variations', () => {
            expect(isDocBlock("{{doc('user_id')}}")).toBe(true); // single quote
            expect(isDocBlock('{{doc("user_id")}}')).toBe(true); // double quote
            expect(isDocBlock("{{ doc('user_id') }}")).toBe(true); // white spaces
            expect(isDocBlock("{{ doc('user_id')}}")).toBe(true); // inconsistent white space
        });
        test('should return false when value doesnt match doc block', () => {
            expect(isDocBlock()).toBe(false);
            expect(isDocBlock('{{ref("user_id")}}')).toBe(false);
            expect(isDocBlock("doc('user_id')")).toBe(false);
            expect(isDocBlock('my description')).toBe(false);
        });
    });
});
