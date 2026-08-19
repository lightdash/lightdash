import { assertRegisteredAccount } from '@lightdash/common';
import {
    createTdcpServer,
    TdcpDialects,
    type TdcpCatalog,
    type TdcpCatalogTable,
    type TdcpDatasetDescriptor,
    type TdcpQueryRequest,
    type TdcpServer,
} from '@lightdash/tdcp';
import { toSessionUser } from '../../../../auth/account';
import type { AsyncQueryService } from '../../../AsyncQueryService/AsyncQueryService';
import type { ProjectService } from '../../../ProjectService/ProjectService';
import {
    localDatasetDescriptor,
    type TdcpCatalogContext,
    type TdcpRequestContext,
} from '../host';

type SqlTdcpServerArguments = {
    asyncQueryService: AsyncQueryService;
    projectService: ProjectService;
};

/**
 * The project's data warehouse as an in-process TDCP server: raw SQL through
 * the SQL runner pipeline as a tier 2 dialect. The catalog lists tables
 * through the same path as the SQL runner catalog endpoint; column detail is
 * not cached, so tables scan without columns.
 *
 * @oliver: the dialect tag is the generic sql:warehouse for the draft — it
 * should be sql:<warehouse type> resolved from the project connection, so a
 * consumer knows which SQL it is writing before submitting.
 */
class SqlTdcpHandlers {
    private readonly asyncQueryService: AsyncQueryService;

    private readonly projectService: ProjectService;

    constructor(args: SqlTdcpServerArguments) {
        this.asyncQueryService = args.asyncQueryService;
        this.projectService = args.projectService;
    }

    async catalog({
        account,
        projectUuid,
    }: TdcpCatalogContext): Promise<TdcpCatalog> {
        assertRegisteredAccount(account);

        // The SQL runner catalog path: same manage-SqlRunner gate, and the
        // catalog is resolved for the user's own warehouse credentials when
        // they have them, falling back to the project connection
        const catalog = await this.projectService.getWarehouseTables(
            toSessionUser(account),
            projectUuid,
        );

        const tables: TdcpCatalogTable[] = Object.entries(catalog).flatMap(
            ([database, schemas]) =>
                Object.entries(schemas).flatMap(([schemaName, schemaTables]) =>
                    Object.keys(schemaTables).map((tableName) => ({
                        reference: `${database}.${schemaName}.${tableName}`,
                        label: tableName,
                        description: null,
                        columns: [],
                    })),
                ),
        );

        return { tables };
    }

    async query(
        ctx: TdcpRequestContext,
        queryRequest: TdcpQueryRequest,
    ): Promise<TdcpDatasetDescriptor> {
        const results = await this.asyncQueryService.executeAsyncSqlQuery({
            account: ctx.account,
            projectUuid: ctx.projectUuid,
            sql: queryRequest.query,
            limit: queryRequest.limit,
            invalidateCache: false,
            context: ctx.queryContext,
        });

        return localDatasetDescriptor({
            queryUuid: results.queryUuid,
            expiresAt: this.asyncQueryService.getCacheExpiresAt(new Date()),
        });
    }
}

export const createSqlTdcpServer = (
    args: SqlTdcpServerArguments,
): TdcpServer<TdcpCatalogContext, TdcpRequestContext> => {
    const handlers = new SqlTdcpHandlers(args);
    return createTdcpServer({
        catalog: handlers.catalog.bind(handlers),
        queryDialects: [TdcpDialects.WAREHOUSE_SQL],
        query: handlers.query.bind(handlers),
    });
};
