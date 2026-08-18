/**
 * The consumer side of the hello-world: TdcpClient against a running
 * orders-server — capabilities, catalog, a tier 1 scan with predicate
 * pushdown, then streaming the data plane.
 *
 * Run: npx tsx packages/tdcp/examples/orders-server.ts &
 *      npx tsx packages/tdcp/examples/query-client.ts [url]
 */
import { TdcpClient } from '../src';

const url = process.argv[2] ?? 'http://127.0.0.1:4832/rpc';

const main = async () => {
    const client = new TdcpClient({ url });

    const capabilities = await client.capabilities();
    console.log('capabilities:', capabilities);

    const catalog = await client.catalog();
    console.log(
        'catalog:',
        catalog.tables.map(
            (table) => `${table.reference} (${table.columns.length} cols)`,
        ),
    );

    const descriptor = await client.scan({
        table: 'crm_accounts',
        columns: ['account_id', 'name', 'tier'],
        predicates: [{ column: 'tier', operator: 'eq', values: ['growth'] }],
        predicateMode: 'exact',
    });
    console.log(
        `scan -> ${descriptor.datasetId}: ${descriptor.rowCount} rows,`,
        `pushed ${descriptor.pushedPredicates?.length ?? 0} predicate(s),`,
        `expires ${descriptor.expiresAt}`,
    );

    if (!descriptor.links) throw new Error('wire descriptor without links');
    for await (const row of client.fetchJsonlRows(descriptor.links[0])) {
        console.log('row:', row);
    }
};

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
