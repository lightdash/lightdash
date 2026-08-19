import {
    assertRegisteredAccount,
    ParameterError,
    QuerySourceType,
    type SourceQuery,
} from '@lightdash/common';
import {
    createTdcpServer,
    TdcpMethods,
    type TdcpCatalog,
    type TdcpCatalogTable,
    type TdcpDataRequest,
    type TdcpDialectDeclaration,
    type TdcpQueryRequest,
} from '@lightdash/tdcp';
import { toSessionUser } from '../../../../auth/account';
import type { AsyncQueryService } from '../../../AsyncQueryService/AsyncQueryService';
import type { ProjectService } from '../../../ProjectService/ProjectService';
import type {
    LightdashTdcpServer,
    TdcpHostContext,
    TdcpLocalDataset,
} from '../host';

type SqlTdcpServerArguments = {
    asyncQueryService: AsyncQueryService;
    projectService: ProjectService;
};

/** The dialect tag for a project's warehouse: sql:<warehouse type>. */
const warehouseSqlDialect = (warehouseType: string): string =>
    `sql:${warehouseType}`;

/**
 * The project's data warehouse as an in-process TDCP server: raw SQL through
 * the SQL runner pipeline as a tier 2 dialect, tagged sql:<warehouse type>
 * resolved from the project connection — a consumer knows which SQL it is
 * writing before submitting. The catalog lists tables through the same path
 * as the SQL runner catalog endpoint; column detail is not cached, so
 * catalog entries carry null columns (tabular/describe is the follow-up
 * that resolves one table on demand).
 */
class SqlTdcpHandlers {
    private readonly asyncQueryService: AsyncQueryService;

    private readonly projectService: ProjectService;

    constructor(args: SqlTdcpServerArguments) {
        this.asyncQueryService = args.asyncQueryService;
        this.projectService = args.projectService;
    }

    async resolveDialects(
        ctx: TdcpHostContext,
    ): Promise<TdcpDialectDeclaration[]> {
        const project = await this.projectService.getProject(
            ctx.projectUuid,
            ctx.account,
        );
        const warehouseType = project.warehouseConnection?.type;
        if (!warehouseType) return [];
        return [
            {
                dialect: warehouseSqlDialect(warehouseType),
                form: 'text',
                payloadSchema: null,
                docsUrl: null,
            },
        ];
    }

    async catalog({
        account,
        projectUuid,
    }: TdcpHostContext): Promise<TdcpCatalog> {
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
                        columns: null,
                    })),
                ),
        );

        return { tables, nextCursor: null };
    }

    async query(
        ctx: TdcpHostContext,
        queryRequest: TdcpQueryRequest,
    ): Promise<TdcpLocalDataset> {
        if (queryRequest.query === undefined) {
            throw new ParameterError('A sql dialect query carries query text');
        }
        const results = await this.asyncQueryService.executeAsyncSqlQuery({
            account: ctx.account,
            projectUuid: ctx.projectUuid,
            sql: queryRequest.query,
            limit: queryRequest.limit,
            invalidateCache: false,
            context: ctx.queryContext,
        });

        return { queryUuid: results.queryUuid };
    }
}

type SqlServerWithMapping = {
    server: LightdashTdcpServer;
    toDataRequest: (
        query: SourceQuery,
        resolvedReferences: Record<string, string>,
        ctx: TdcpHostContext,
    ) => Promise<TdcpDataRequest>;
};

export const createSqlTdcpServer = (
    args: SqlTdcpServerArguments,
): SqlServerWithMapping => {
    const handlers = new SqlTdcpHandlers(args);
    return {
        server: createTdcpServer({
            catalog: handlers.catalog.bind(handlers),
            queryDialects: handlers.resolveDialects.bind(handlers),
            query: handlers.query.bind(handlers),
        }),
        // The mapping resolves the same per-project dialect the server
        // declares, so a consumer-visible tag and the submit path agree
        toDataRequest: async (query, _resolvedReferences, ctx) => {
            if (query.sourceType !== QuerySourceType.SQL) {
                throw new ParameterError(
                    `Expected a ${QuerySourceType.SQL} query`,
                );
            }
            const [declaration] = await handlers.resolveDialects(ctx);
            if (!declaration) {
                throw new ParameterError(
                    'This project has no warehouse connection to run SQL against',
                );
            }
            return {
                method: TdcpMethods.QUERY,
                dialect: declaration.dialect,
                query: query.sql,
                limit: query.limit,
            };
        },
    };
};
