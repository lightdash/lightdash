import {
    assertRegisteredAccount,
    ParameterError,
    QueryExecutionContext,
    QuerySourceType,
    type QuerySourceDefinition,
    type QuerySourceSchema,
    type QuerySourceSchemaTable,
    type SourceQuery,
    type SqlSourceQuery,
} from '@lightdash/common';
import { toSessionUser } from '../../../auth/account';
import type { AsyncQueryService } from '../../AsyncQueryService/AsyncQueryService';
import type { ProjectService } from '../../ProjectService/ProjectService';
import { applySchemaScanFilter } from '../schemaSearch';
import type {
    QuerySourceClient,
    ScanSchemaArgs,
    SubmitSourceQueryArgs,
} from '../types';

type SqlQuerySourceArguments = {
    asyncQueryService: AsyncQueryService;
    projectService: ProjectService;
};

/**
 * The project's data warehouse as a query source: raw SQL through the SQL
 * runner pipeline. The schema scan lists tables through the same path as the
 * SQL runner catalog endpoint; column detail is not cached, so tables scan
 * without columns.
 */
export class SqlQuerySource implements QuerySourceClient {
    readonly definition: QuerySourceDefinition = {
        sourceType: QuerySourceType.SQL,
        label: 'Warehouse SQL',
        description:
            'Raw SQL against the project data warehouse. Tables are referenced as database.schema.table in the SQL dialect of the warehouse. Result columns are named by the SELECT output names.',
    };

    private readonly asyncQueryService: AsyncQueryService;

    private readonly projectService: ProjectService;

    constructor(args: SqlQuerySourceArguments) {
        this.asyncQueryService = args.asyncQueryService;
        this.projectService = args.projectService;
    }

    private static assertSourceQuery(query: SourceQuery): SqlSourceQuery {
        if (query.sourceType !== QuerySourceType.SQL) {
            throw new ParameterError(
                `Expected a ${QuerySourceType.SQL} query, got "${query.sourceType}"`,
            );
        }
        return query;
    }

    async scanSchema({
        account,
        projectUuid,
        patterns,
        tables: tableRefs,
    }: ScanSchemaArgs): Promise<QuerySourceSchema> {
        assertRegisteredAccount(account);

        // The SQL runner catalog path: same manage-SqlRunner gate, and the
        // catalog is resolved for the user's own warehouse credentials when
        // they have them, falling back to the project connection
        const catalog = await this.projectService.getWarehouseTables(
            toSessionUser(account),
            projectUuid,
        );

        // The cached catalog holds table names only, so a plain scan and a
        // pattern search list tables without columns; column detail is read
        // live from the warehouse for explicitly requested tables
        const tables: QuerySourceSchemaTable[] = Object.entries(
            catalog,
        ).flatMap(([database, schemas]) =>
            Object.entries(schemas).flatMap(([schemaName, schemaTables]) =>
                Object.keys(schemaTables).map((tableName) => ({
                    reference: `${database}.${schemaName}.${tableName}`,
                    label: tableName,
                    description: null,
                    columns: null,
                })),
            ),
        );

        const failedTables: string[] = [];
        if (tableRefs !== undefined) {
            const byReference = new Map(
                tables.map((table) => [table.reference, table]),
            );
            await Promise.all(
                tableRefs.map(async (reference) => {
                    const table = byReference.get(reference);
                    if (table === undefined) return;
                    const [database, schemaName, tableName] =
                        reference.split('.');
                    try {
                        const warehouseSchema =
                            await this.projectService.getWarehouseFields(
                                toSessionUser(account),
                                projectUuid,
                                QueryExecutionContext.MULTI_SOURCE_QUERY,
                                tableName,
                                schemaName,
                                database,
                            );
                        table.columns = Object.entries(warehouseSchema).map(
                            ([columnName, type]) => ({
                                reference: columnName,
                                type,
                                label: null,
                                description: null,
                            }),
                        );
                    } catch (error) {
                        failedTables.push(reference);
                    }
                }),
            );
        }

        const filtered = applySchemaScanFilter(tables, {
            patterns,
            tables: tableRefs,
        });
        const note =
            failedTables.length > 0
                ? [
                      filtered.note,
                      `Could not read columns from the warehouse for: ${failedTables.join(', ')}.`,
                  ]
                      .filter(Boolean)
                      .join(' ')
                : filtered.note;

        return {
            sourceType: QuerySourceType.SQL,
            ...filtered,
            note,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getQueryReferences(): string[] {
        return [];
    }

    async submitQuery({
        account,
        projectUuid,
        context,
        query,
    }: SubmitSourceQueryArgs): Promise<{ queryUuid: string }> {
        const sourceQuery = SqlQuerySource.assertSourceQuery(query);

        const results = await this.asyncQueryService.executeAsyncSqlQuery({
            account,
            projectUuid,
            sql: sourceQuery.sql,
            limit: sourceQuery.limit,
            invalidateCache: false,
            context,
        });

        return { queryUuid: results.queryUuid };
    }
}
