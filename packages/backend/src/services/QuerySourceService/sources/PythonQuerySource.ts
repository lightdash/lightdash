import {
    FeatureFlags,
    getSourceQueryResultReferences,
    ParameterError,
    QuerySourceType,
    type PythonSourceQuery,
    type QuerySourceDefinition,
    type QuerySourceSchema,
    type SourceQuery,
} from '@lightdash/common';
import type { AsyncQueryService } from '../../AsyncQueryService/AsyncQueryService';
import type {
    QuerySourceClient,
    ScanSchemaArgs,
    SourceQuerySubmissionResult,
    SubmitSourceQueryArgs,
} from '../types';

type PythonQuerySourceArguments = {
    asyncQueryService: Pick<AsyncQueryService, 'executeAsyncPythonQuery'>;
};

/**
 * Python over other query results as a query source. Like the DuckDB
 * compose engine it has no schema of its own: its inputs are the references
 * handed to each query, exposed to `run(inputs, params)` as DataFrames.
 */
export class PythonQuerySource implements QuerySourceClient {
    readonly definition: QuerySourceDefinition = {
        sourceType: QuerySourceType.PYTHON,
        label: 'Python',
        description:
            'Python over other query results, run in a sandbox with pandas, numpy, scipy, pyarrow, scikit-learn and polars and no network access. The code defines run(inputs: dict[str, pandas.DataFrame], params: dict) -> pandas.DataFrame. References expose results as inputs: an array of node ids (each inputs[nodeId]) or an {inputName: nodeIdOrQueryUuid} map. The returned DataFrame needs identifier-safe column names (letters, digits, underscores) and is capped at limit rows. References to still-running queries are waited on. At least one reference is required.',
    };

    readonly supportsPivot = false;

    readonly requiredFeatureFlags = [
        FeatureFlags.ComposeSqlRunner,
        FeatureFlags.PythonQueryRunner,
    ];

    private readonly asyncQueryService: PythonQuerySourceArguments['asyncQueryService'];

    constructor(args: PythonQuerySourceArguments) {
        this.asyncQueryService = args.asyncQueryService;
    }

    private static assertSourceQuery(query: SourceQuery): PythonSourceQuery {
        if (query.sourceType !== QuerySourceType.PYTHON) {
            throw new ParameterError(
                `Expected a ${QuerySourceType.PYTHON} query, got "${query.sourceType}"`,
            );
        }
        return query;
    }

    // eslint-disable-next-line class-methods-use-this
    async scanSchema(_args: ScanSchemaArgs): Promise<QuerySourceSchema> {
        return {
            sourceType: QuerySourceType.PYTHON,
            tables: [],
        };
    }

    getQueryReferences(query: SourceQuery): string[] {
        return Object.values(
            getSourceQueryResultReferences(
                PythonQuerySource.assertSourceQuery(query),
            ),
        );
    }

    /**
     * A cache hit is only known once the references resolve, so submission
     * never reports one. User attribute overrides have nothing to apply to;
     * the referenced results were produced under them.
     */
    async submitQuery({
        account,
        projectUuid,
        context,
        querySurface,
        query,
        resolvedReferences,
        parameters,
        invalidateCache,
        savedChartUuid,
        documentReference,
    }: SubmitSourceQueryArgs): Promise<SourceQuerySubmissionResult> {
        const sourceQuery = PythonQuerySource.assertSourceQuery(query);
        const references = Object.fromEntries(
            Object.entries(getSourceQueryResultReferences(sourceQuery)).map(
                ([inputName, reference]) => [
                    inputName,
                    resolvedReferences[reference] ?? reference,
                ],
            ),
        );
        const { queryUuid } =
            await this.asyncQueryService.executeAsyncPythonQuery({
                ...(savedChartUuid ? { savedChartUuid } : {}),
                ...(documentReference ? { documentReference } : {}),
                account,
                projectUuid,
                code: sourceQuery.code,
                limit: sourceQuery.limit,
                references,
                parameters,
                invalidateCache,
                context,
                querySurface,
            });
        return { queryUuid, cacheHit: false };
    }
}
