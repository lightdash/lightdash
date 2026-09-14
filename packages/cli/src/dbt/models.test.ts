import {
    DimensionType,
    setCatalogNestedColumnShape,
    type WarehouseCatalog,
} from '@lightdash/common';
import { type WarehouseClient } from '@lightdash/warehouses';
import {
    getColumnsMissingFromWarehouse,
    getWarehouseTableForModel,
    isDocBlock,
    isGeneratableColumn,
} from './models';

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
    describe('getWarehouseTableForModel', () => {
        const catalog: WarehouseCatalog = {
            db: {
                ds: {
                    orders: {
                        order_id: DimensionType.STRING,
                        product: DimensionType.STRING,
                        'product.sku': DimensionType.STRING,
                        'product.price': DimensionType.NUMBER,
                        'product.variants': DimensionType.STRING,
                        'product.variants.size': DimensionType.STRING,
                        customer: DimensionType.STRING,
                        'customer.location': DimensionType.STRING,
                        tags: DimensionType.STRING,
                    },
                },
            },
        };
        Object.entries({
            product: { repeated: true, record: true },
            'product.variants': { repeated: true, record: true },
            customer: { repeated: false, record: true },
            tags: { repeated: true, record: false },
        }).forEach(([path, shape]) =>
            setCatalogNestedColumnShape(
                catalog,
                'db',
                'ds',
                'orders',
                path,
                shape,
            ),
        );
        const warehouseClient = {
            getCatalog: vi.fn(async () => catalog),
        } as unknown as WarehouseClient;
        const model = {
            name: 'orders',
            schema: 'ds',
            database: 'db',
            alias: 'orders',
            originalFilePath: 'models/orders.sql',
            patchPath: null,
            packageName: 'p',
            uniqueId: 'model.p.orders',
        };

        test('generates scalars, struct leaves and arrays of scalars but reports every warehouse path', async () => {
            const result = await getWarehouseTableForModel({
                model,
                warehouseClient,
                preserveColumnCase: false,
            });
            expect(Object.keys(result.table).sort()).toEqual([
                'customer.location',
                'order_id',
                'tags',
            ]);
            expect(result.warehouseColumnPaths.sort()).toEqual([
                'customer',
                'customer.location',
                'order_id',
                'product',
                'product.price',
                'product.sku',
                'product.variants',
                'product.variants.size',
                'tags',
            ]);
        });
    });

    describe('getColumnsMissingFromWarehouse', () => {
        test('keeps documented nested leaves and containers, drops only paths the warehouse lacks', () => {
            expect(
                getColumnsMissingFromWarehouse(
                    [
                        'order_id',
                        'Product',
                        'product.sku',
                        'product.variants.size',
                        'legacy_status',
                        'product.colour',
                    ],
                    [
                        'order_id',
                        'product',
                        'product.sku',
                        'product.variants',
                        'product.variants.size',
                    ],
                ),
            ).toEqual(['legacy_status', 'product.colour']);
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
