import { describe, expect, it } from 'vitest';
import { STUDIO_STARTERS } from './studioStarters';
import {
    getStudioStarters,
    summarizeWarehouseCatalog,
} from './warehouseSummary';

describe('summarizeWarehouseCatalog', () => {
    it('names the catalog and schema when the tables share one', () => {
        expect(
            summarizeWarehouseCatalog({
                db: { schema_a: { table_a: {}, table_b: {} } },
            }),
        ).toEqual({
            location: 'db.schema_a',
            tableCount: 2,
            tables: [
                {
                    schema: 'schema_a',
                    name: 'table_a',
                    reference: 'schema_a.table_a',
                },
                {
                    schema: 'schema_a',
                    name: 'table_b',
                    reference: 'schema_a.table_b',
                },
            ],
        });
    });

    it('names only the catalog across schemas, and nothing across catalogs', () => {
        expect(
            summarizeWarehouseCatalog({
                db: { schema_a: { table_a: {} }, schema_b: { table_b: {} } },
            }).location,
        ).toBe('db');
        expect(
            summarizeWarehouseCatalog({
                db_a: { schema_a: { table_a: {} } },
                db_b: { schema_b: { table_b: {} } },
            }).location,
        ).toBeNull();
    });
});

describe('getStudioStarters', () => {
    it('leaves naming tables to the warehouse card when the catalog lists some', () => {
        const starters = getStudioStarters(
            summarizeWarehouseCatalog({
                db: { schema_a: { table_a: {}, table_b: {}, table_c: {} } },
            }),
        );
        expect(starters.map(({ label }) => label)).toEqual([
            STUDIO_STARTERS[0].label,
            STUDIO_STARTERS[2].label,
        ]);
    });

    it('falls back to general starters when nothing is listed', () => {
        expect(getStudioStarters(null)).toEqual(STUDIO_STARTERS);
    });
});
