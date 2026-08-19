import {
    ParameterError,
    QuerySourceType,
    UnexpectedServerError,
    type QuerySourceDefinition,
    type QuerySourceSchema,
    type ResultColumns,
    type SourceQuery,
    type TdcpSourceQuery,
} from '@lightdash/common';
import {
    TdcpClient,
    TdcpMethods,
    type TdcpColumnSchema,
    type TdcpLogicalType,
} from '@lightdash/tdcp';
import type { AsyncQueryService } from '../../AsyncQueryService/AsyncQueryService';
import { tdcpSourceQueryToDataRequest } from '../tdcp/dataRequest';
import { createTdcpGuardedFetch } from '../tdcp/guardedFetch';
import { tdcpTypeToDimensionType } from '../tdcp/typeMapping';
import type {
    QuerySourceClient,
    ScanSchemaArgs,
    SubmitSourceQueryArgs,
} from '../types';

type RemoteTdcpQuerySourceArguments = {
    asyncQueryService: AsyncQueryService;
};

/** How long the background import waits for a pending remote dataset. */
const REMOTE_DATASET_WAIT_TIMEOUT_MS = 10 * 60_000;

const cellMatchesType = (value: unknown, type: TdcpLogicalType): boolean => {
    if (value === null) return true;
    switch (type) {
        case 'number':
            return typeof value === 'number';
        case 'boolean':
            return typeof value === 'boolean';
        case 'string':
        case 'timestamp':
        case 'date':
            return typeof value === 'string';
        default:
            return false;
    }
};

/**
 * Boundary validation of the data plane: every declared column's cells must
 * match its declared logical type, so a misdeclaring server fails here with
 * a row number instead of poisoning results consumed far away (viz, DuckDB
 * compose).
 */
async function* validatedRows(
    rows: AsyncGenerator<Record<string, unknown>>,
    schema: TdcpColumnSchema[],
): AsyncGenerator<Record<string, unknown>> {
    let rowNumber = 0;
    for await (const row of rows) {
        rowNumber += 1;
        for (const column of schema) {
            const value = row[column.name];
            if (value !== undefined && !cellMatchesType(value, column.type)) {
                throw new UnexpectedServerError(
                    `TDCP data plane row ${rowNumber} column "${column.name}": value does not match declared type "${column.type}"`,
                );
            }
        }
        yield row;
    }
}

/**
 * Remote TDCP servers as a query source. One registry entry covers every
 * remote server — the query names the server — so external sources plug
 * into the multi-source pipeline without new source types.
 *
 * Submission is non-blocking: the query_history row is created first and
 * the whole exchange with the remote server — control-plane request,
 * polling while pending, then streaming the data plane into S3 — runs in
 * the background phase, surfacing failures through the standard status
 * lifecycle. The import primitive itself is protocol-agnostic; this class
 * hands it a thunk producing plain columns and a row stream.
 */
export class RemoteTdcpQuerySource implements QuerySourceClient {
    readonly definition: QuerySourceDefinition = {
        sourceType: QuerySourceType.TDCP,
        label: 'Remote TDCP server',
        description:
            'Queries against a remote server speaking the tabular data context protocol draft. The query names the server and carries a table read/scan or a dialect-tagged payload; results are imported into the standard results pipeline and referenced like any other query result.',
    };

    private readonly asyncQueryService: AsyncQueryService;

    private readonly fetchImpl: typeof fetch;

    constructor(args: RemoteTdcpQuerySourceArguments) {
        this.asyncQueryService = args.asyncQueryService;
        this.fetchImpl = createTdcpGuardedFetch();
    }

    private static assertSourceQuery(query: SourceQuery): TdcpSourceQuery {
        if (query.sourceType !== QuerySourceType.TDCP) {
            throw new ParameterError(
                `Expected a ${QuerySourceType.TDCP} query, got "${query.sourceType}"`,
            );
        }
        return query;
    }

    // eslint-disable-next-line class-methods-use-this
    async scanSchema(_args: ScanSchemaArgs): Promise<QuerySourceSchema> {
        // @oliver: the schema endpoint is GET /{sourceType}/schema, but a
        // remote scan needs to name WHICH server — that's a controller
        // change (schema of a registered server) that lands with the
        // sources entity. Empty until then.
        return {
            sourceType: QuerySourceType.TDCP,
            tables: [],
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getQueryReferences(): string[] {
        // @oliver: remote compose (sending OUR handles to THEIR compose
        // server) is deliberately out of the draft — it needs the token
        // delegation decision from the proposal before any handle leaves
        // the deployment.
        return [];
    }

    async submitQuery({
        account,
        projectUuid,
        context,
        query,
    }: SubmitSourceQueryArgs): Promise<{ queryUuid: string }> {
        const sourceQuery = RemoteTdcpQuerySource.assertSourceQuery(query);

        // Validates the request form up front, so form errors fail the
        // submission itself rather than the background phase
        const request = tdcpSourceQueryToDataRequest(sourceQuery);

        // @oliver: serverUrl straight from the request body is the draft's
        // biggest shortcut — it becomes a registered-server reference (and
        // per-server credentials) with the sources entity. The guarded
        // fetch closes the private-address hole meanwhile.
        const client = new TdcpClient({
            url: sourceQuery.serverUrl,
            fetchImpl: this.fetchImpl,
        });

        return this.asyncQueryService.executeAsyncExternalDatasetImport({
            account,
            projectUuid,
            context,
            source: {
                url: sourceQuery.serverUrl,
                requestFingerprint: JSON.stringify(request),
            },
            fetchDataset: async () => {
                const result = await (() => {
                    switch (request.method) {
                        case TdcpMethods.READ:
                            return client.read({
                                table: request.table,
                                limit: request.limit,
                            });
                        case TdcpMethods.SCAN:
                            return client.scan({
                                table: request.table,
                                columns: request.columns,
                                predicates: request.predicates,
                                predicateMode: request.predicateMode,
                                limit: request.limit,
                            });
                        case TdcpMethods.QUERY:
                            return client.query({
                                dialect: request.dialect,
                                query: request.query,
                                params: request.params,
                                references: request.references,
                                limit: request.limit,
                            });
                        default:
                            throw new UnexpectedServerError(
                                'Unknown TDCP data request method',
                            );
                    }
                })();

                const descriptor = await client.waitForReady(result, {
                    timeoutMs: REMOTE_DATASET_WAIT_TIMEOUT_MS,
                });

                const jsonlLink = descriptor.links.find(
                    (link) => link.encoding === 'jsonl',
                );
                if (!jsonlLink) {
                    throw new UnexpectedServerError(
                        'TDCP server returned a descriptor without a jsonl data-plane link',
                    );
                }

                const columns: ResultColumns = Object.fromEntries(
                    descriptor.schema.map((column) => [
                        column.name,
                        {
                            reference: column.name,
                            type: tdcpTypeToDimensionType(column.type),
                        },
                    ]),
                );

                return {
                    datasetId: descriptor.datasetId,
                    columns,
                    fetchRows: () =>
                        validatedRows(
                            client.fetchJsonlRows(jsonlLink),
                            descriptor.schema,
                        ),
                };
            },
        });
    }
}
