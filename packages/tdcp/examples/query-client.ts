/**
 * The consumer side of the hello-world: TdcpClient against a running
 * csv-server — capabilities, catalog, a tier 1 scan with predicate
 * pushdown, then streaming the data plane.
 *
 * Run: npx tsx packages/tdcp/examples/csv-server.ts &
 *      npx tsx packages/tdcp/examples/query-client.ts [url]
 */
import { TdcpClient } from '../src';

const url = process.argv[2] ?? 'http://127.0.0.1:4833/rpc';

const main = async () => {
    const client = new TdcpClient({ url });

    const capabilities = await client.capabilities();
    console.log('capabilities:', capabilities);

    const catalog = await client.catalog();
    console.log(
        'catalog:',
        catalog.tables.map(
            (table) =>
                `${table.reference} (${
                    table.columns
                        ? `${table.columns.length} cols`
                        : 'columns via describe'
                })`,
        ),
    );

    const result = await client.scan({
        table: 'signups',
        columns: ['signup_id', 'email_domain', 'plan', 'seats'],
        predicates: [{ column: 'plan', operator: 'eq', values: ['growth'] }],
        predicateMode: 'exact',
    });
    const descriptor = await client.waitForReady(result);
    console.log(
        `scan -> ${descriptor.datasetId}: ${descriptor.rowCount} rows,`,
        `pushed ${descriptor.pushedPredicates?.length ?? 0} predicate(s),`,
        `expires ${descriptor.expiresAt}`,
    );

    for await (const row of client.fetchJsonlRows(descriptor.links[0])) {
        console.log('row:', row);
    }
};

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
