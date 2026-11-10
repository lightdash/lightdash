import { WarehouseTableType, WarehouseTypes } from '@lightdash/common';
import {
    findCatalogTable,
    getRowCountSql,
    parseTableReference,
} from './tableSize';

const table = { tableType: WarehouseTableType.TABLE };
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

describe('parseTableReference', () => {
    it('reads a plain or quoted name, last part first', () => {
        expect(parseTableReference('db.public.orders')).toEqual([
            'orders',
            'public',
            'db',
        ]);
        expect(parseTableReference('`proj-1`.`sales`.`orders`')).toEqual([
            'orders',
            'sales',
            'proj-1',
        ]);
    });

    it('gives up on a query or a name it cannot be sure of', () => {
        expect(parseTableReference('(SELECT 1) AS t')).toBeNull();
        expect(parseTableReference('"a b".orders')).toBeNull();
        expect(parseTableReference('a.b.c.d')).toBeNull();
    });
});

describe('findCatalogTable', () => {
    const catalog = {
        SHOP: { PUBLIC: { ORDERS: table }, ARCHIVE: { ORDERS: table } },
    };

    it('finds a table whatever its case, under the names the catalog uses', () => {
        expect(findCatalogTable(catalog, ['orders', 'public'])).toEqual({
            database: 'SHOP',
            schema: 'PUBLIC',
            table: 'ORDERS',
        });
    });

    it('does not guess between two tables or invent one', () => {
        expect(findCatalogTable(catalog, ['orders'])).toBeNull();
        expect(findCatalogTable(catalog, ['customers'])).toBeNull();
    });
});

describe('getRowCountSql', () => {
    const named = { database: 'shop', schema: 'public', table: "o'rders" };

    it('asks the warehouse metadata, escaping names used as values', () => {
        expect(getRowCountSql(WarehouseTypes.POSTGRES, named, quote)).toContain(
            "c.relname = 'o''rders'",
        );
    });

    it('has no query where metadata gives no cheap count, or a name is unsafe to write', () => {
        expect(getRowCountSql(WarehouseTypes.ATHENA, named, quote)).toBeNull();
        expect(
            getRowCountSql(
                WarehouseTypes.BIGQUERY,
                { ...named, database: 'a`b' },
                quote,
            ),
        ).toBeNull();
    });
});
