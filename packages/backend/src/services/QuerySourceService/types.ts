import type {
    Account,
    ParametersValuesMap,
    PivotConfiguration,
    QueryExecutionContext,
    QuerySourceDefinition,
    QuerySourceSchema,
    SourceQuery,
    UserAttributeValueMap,
} from '@lightdash/common';

export type ScanSchemaArgs = {
    account: Account;
    projectUuid: string;
};

/**
 * Execution context shared by every query of one submission. Each field is
 * required so a caller decides it explicitly; none of them defaults.
 */
export type SourceQueryExecutionContext = {
    /** Parameter values every node resolves its references against. */
    parameters: ParametersValuesMap;
    /**
     * Never optional: overrides come from the caller's runtime (embed, MCP,
     * AI agent) and a dropped override shows a user another tenant's rows.
     * Callers without overrides pass an empty map.
     */
    userAttributeOverrides: UserAttributeValueMap;
    invalidateCache: boolean;
};

export type SubmitSourceQueryArgs = SourceQueryExecutionContext & {
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
    /** The node's own pivot, lifted off the query so every source reads one place. */
    pivotConfiguration: PivotConfiguration | null;
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
    /** Whether a query of this source may carry a pivotConfiguration. */
    supportsPivot: boolean;
    scanSchema(args: ScanSchemaArgs): Promise<QuerySourceSchema>;
    getQueryReferences(query: SourceQuery): string[];
    submitQuery(args: SubmitSourceQueryArgs): Promise<{ queryUuid: string }>;
}
