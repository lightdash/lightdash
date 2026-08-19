import type {
    Account,
    QueryExecutionContext,
    QuerySourceDefinition,
    QuerySourceSchema,
    SourceQuery,
} from '@lightdash/common';

export type ScanSchemaArgs = {
    account: Account;
    projectUuid: string;
};

export type SubmitSourceQueryArgs = {
    account: Account;
    projectUuid: string;
    context: QueryExecutionContext;
    query: SourceQuery;
    /**
     * Reference value -> queryUuid, for reference values that named upstream
     * DAG nodes. Reference values not in this map already are queryUuids of
     * existing results and pass through unchanged.
     */
    resolvedReferences: Record<string, string>;
};

/**
 * The contract every query source implements: describe itself, scan its
 * schema into the standard shape, declare which result references a query
 * consumes (the DAG edges), and submit a query returning a queryUuid whose
 * results flow through the standard async query pipeline.
 *
 * Each source owns its authorization: submitQuery and scanSchema must apply
 * the same access checks as the execution path they wrap. New sources —
 * HTTP APIs, Google Sheets, CSV uploads — implement this interface and
 * register with QuerySourceRegistry; how a source authenticates against its
 * backing system is an implementation detail behind this contract.
 */
export interface QuerySourceClient {
    definition: QuerySourceDefinition;
    scanSchema(args: ScanSchemaArgs): Promise<QuerySourceSchema>;
    getQueryReferences(query: SourceQuery): string[];
    submitQuery(args: SubmitSourceQueryArgs): Promise<{ queryUuid: string }>;
}
