import {
    isSummaryExploreError,
    ParameterError,
    QuerySourceType,
    type ExternalSourceQuery,
    type ExternalSourceTableReference,
    type QuerySourceDefinition,
    type QuerySourceSchema,
    type QuerySourceSchemaTable,
    type QuerySourceTableName,
    type SourceQuery,
} from '@lightdash/common';
import type { AsyncQueryService } from '../../../services/AsyncQueryService/AsyncQueryService';
import type { ProjectService } from '../../../services/ProjectService/ProjectService';
import type {
    QuerySourceClient,
    ScanSchemaArgs,
    SubmitSourceQueryArgs,
} from '../../../services/QuerySourceService/types';
import type { ExternalSourceModel } from '../../models/ExternalSourceModel';

type ExternalQuerySourceArguments = {
    asyncQueryService: AsyncQueryService;
    projectService: ProjectService;
    externalSourceModel: ExternalSourceModel;
};

/** Durable external tables exposed as a DuckDB query source. */
export class ExternalQuerySource implements QuerySourceClient {
    readonly definition: QuerySourceDefinition = {
        sourceType: QuerySourceType.EXTERNAL,
        label: 'External sources',
        description:
            'DuckDB SQL over external source tables (uploaded CSVs, connected Google Sheets). Tables expose ingested files as named tables: an array of table names, or a {tableName: tableNameOrUuid} map for aliasing. Column names are the ingested columns from scanSchema, not explore field ids. Join the result with warehouse data in a referencing duckdb query.',
    };

    readonly supportsPivot = false;

    private readonly asyncQueryService: AsyncQueryService;

    private readonly projectService: ProjectService;

    private readonly externalSourceModel: ExternalSourceModel;

    constructor(args: ExternalQuerySourceArguments) {
        this.asyncQueryService = args.asyncQueryService;
        this.projectService = args.projectService;
        this.externalSourceModel = args.externalSourceModel;
    }

    private static assertSourceQuery(query: SourceQuery): ExternalSourceQuery {
        if (query.sourceType !== QuerySourceType.EXTERNAL) {
            throw new ParameterError(
                `Expected a ${QuerySourceType.EXTERNAL} query, got "${query.sourceType}"`,
            );
        }
        return query;
    }

    /** The array shorthand exposes each table under its own name. */
    private static normalizeTables(
        tables: ExternalSourceQuery['tables'],
    ): Record<QuerySourceTableName, ExternalSourceTableReference> {
        if (Array.isArray(tables)) {
            return Object.fromEntries(tables.map((name) => [name, name]));
        }
        return tables;
    }

    /** Returns ingested columns for external explores visible to the caller. */
    async scanSchema({
        account,
        projectUuid,
    }: ScanSchemaArgs): Promise<QuerySourceSchema> {
        const summaries = await this.projectService.getAllExploresSummary(
            account,
            projectUuid,
            true,
            false,
        );
        const visibleTableUuids = new Set(
            summaries.flatMap((summary) =>
                !isSummaryExploreError(summary) && summary.externalSource
                    ? [summary.externalSource.tableUuid]
                    : [],
            ),
        );

        const tableRows =
            await this.externalSourceModel.listReadyTables(projectUuid);
        const tables: QuerySourceSchemaTable[] = tableRows.flatMap((row) => {
            if (
                !visibleTableUuids.has(row.external_source_table_uuid) ||
                row.columns === null
            ) {
                return [];
            }
            return [
                {
                    reference: row.name,
                    label: row.label,
                    description: null,
                    columns: Object.values(row.columns).map((column) => ({
                        reference: column.reference,
                        type: column.type,
                        label: null,
                        description: null,
                    })),
                },
            ];
        });

        return {
            sourceType: QuerySourceType.EXTERNAL,
            tables,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getQueryReferences(_query: SourceQuery): string[] {
        // Durable external tables create no dependency edges.
        return [];
    }

    /**
     * User attribute overrides have nothing to apply to: external tables are
     * ingested files, not attribute-scoped SQL. A pivot refuses until the
     * join node owns the pivot stage.
     */
    async submitQuery({
        account,
        projectUuid,
        context,
        query,
        parameters,
        invalidateCache,
        pivotConfiguration,
    }: SubmitSourceQueryArgs): Promise<{ queryUuid: string }> {
        const sourceQuery = ExternalQuerySource.assertSourceQuery(query);
        if (pivotConfiguration !== null) {
            throw new ParameterError(
                `${QuerySourceType.EXTERNAL} queries do not support pivotConfiguration yet`,
            );
        }

        const results =
            await this.asyncQueryService.executeAsyncExternalSqlQuery({
                account,
                projectUuid,
                sql: sourceQuery.sql,
                limit: sourceQuery.limit,
                tables: ExternalQuerySource.normalizeTables(sourceQuery.tables),
                context,
                parameters,
                invalidateCache,
            });

        return { queryUuid: results.queryUuid };
    }
}
