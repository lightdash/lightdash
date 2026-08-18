import { subject } from '@casl/ability';
import {
    ForbiddenError,
    ParameterError,
    TDCP_PROTOCOL_REVISION,
    TdcpDialects,
    TdcpMethods,
    type TdcpCapabilities,
    type TdcpCatalog,
    type TdcpCatalogTable,
    type TdcpDataRequest,
    type TdcpDatasetDescriptor,
} from '@lightdash/common';
import type { ProjectModel } from '../../../../models/ProjectModel/ProjectModel';
import type { WarehouseAvailableTablesModel } from '../../../../models/WarehouseAvailableTablesModel/WarehouseAvailableTablesModel';
import type { AsyncQueryService } from '../../../AsyncQueryService/AsyncQueryService';
import { BaseService } from '../../../BaseService';
import {
    localDatasetDescriptor,
    type TdcpCatalogContext,
    type TdcpRequestContext,
    type TdcpServer,
} from '../TdcpServer';

type SqlTdcpServerArguments = {
    asyncQueryService: AsyncQueryService;
    projectModel: ProjectModel;
    warehouseAvailableTablesModel: WarehouseAvailableTablesModel;
};

/**
 * The project's data warehouse as an in-process TDCP server: raw SQL through
 * the SQL runner pipeline as a tier 2 dialect. The catalog lists tables from
 * the cached warehouse catalog; column detail is not cached, so tables scan
 * without columns.
 *
 * @oliver: the dialect tag is the generic sql:warehouse for the draft — it
 * should be sql:<warehouse type> resolved from the project connection, so a
 * consumer knows which SQL it is writing before submitting.
 */
export class SqlTdcpServer extends BaseService implements TdcpServer {
    private readonly asyncQueryService: AsyncQueryService;

    private readonly projectModel: ProjectModel;

    private readonly warehouseAvailableTablesModel: WarehouseAvailableTablesModel;

    constructor(args: SqlTdcpServerArguments) {
        super({ serviceName: 'SqlTdcpServer' });
        this.asyncQueryService = args.asyncQueryService;
        this.projectModel = args.projectModel;
        this.warehouseAvailableTablesModel = args.warehouseAvailableTablesModel;
    }

    // eslint-disable-next-line class-methods-use-this
    async capabilities(): Promise<TdcpCapabilities> {
        return {
            revision: TDCP_PROTOCOL_REVISION,
            read: false,
            scan: false,
            queryDialects: [TdcpDialects.WAREHOUSE_SQL],
            compose: false,
        };
    }

    async catalog({
        account,
        projectUuid,
    }: TdcpCatalogContext): Promise<TdcpCatalog> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        // Same gate as the SQL runner catalog endpoints
        const ability = this.createAuditedAbility(account);
        if (
            ability.cannot(
                'manage',
                subject('SqlRunner', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const catalog =
            await this.warehouseAvailableTablesModel.getTablesForProjectWarehouseCredentials(
                projectUuid,
            );

        const tables: TdcpCatalogTable[] = Object.entries(
            catalog ?? {},
        ).flatMap(([database, schemas]) =>
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
        request: TdcpDataRequest,
    ): Promise<TdcpDatasetDescriptor> {
        if (
            request.method !== TdcpMethods.QUERY ||
            request.dialect !== TdcpDialects.WAREHOUSE_SQL
        ) {
            throw new ParameterError(
                `The warehouse SQL source only accepts ${TdcpMethods.QUERY} requests in the ${TdcpDialects.WAREHOUSE_SQL} dialect`,
            );
        }

        const results = await this.asyncQueryService.executeAsyncSqlQuery({
            account: ctx.account,
            projectUuid: ctx.projectUuid,
            sql: request.query,
            limit: request.limit,
            invalidateCache: false,
            context: ctx.queryContext,
        });

        return localDatasetDescriptor({
            queryUuid: results.queryUuid,
            expiresAt: this.asyncQueryService.getCacheExpiresAt(new Date()),
        });
    }
}
