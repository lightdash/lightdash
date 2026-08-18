import { QuerySourceType } from '@lightdash/common';
import type { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import type { WarehouseAvailableTablesModel } from '../../../models/WarehouseAvailableTablesModel/WarehouseAvailableTablesModel';
import type { AsyncQueryService } from '../../AsyncQueryService/AsyncQueryService';
import type { ProjectService } from '../../ProjectService/ProjectService';
import { TdcpQuerySource } from '../sources/TdcpQuerySource';
import { DuckdbComposeTdcpServer } from './servers/DuckdbComposeTdcpServer';
import { SemanticLayerTdcpServer } from './servers/SemanticLayerTdcpServer';
import { SqlTdcpServer } from './servers/SqlTdcpServer';

type BuiltInTdcpSourcesArguments = {
    asyncQueryService: AsyncQueryService;
    projectService: ProjectService;
    projectModel: ProjectModel;
    warehouseAvailableTablesModel: WarehouseAvailableTablesModel;
};

/**
 * The built-in query sources, each an in-process TDCP server behind the one
 * adapter. Definitions live here, next to the servers they describe; the
 * outbound MCP extension re-exposes these same server instances, so this
 * list is also the deployment's outbound source inventory.
 */
export const createBuiltInTdcpQuerySources = ({
    asyncQueryService,
    projectService,
    projectModel,
    warehouseAvailableTablesModel,
}: BuiltInTdcpSourcesArguments): TdcpQuerySource[] => [
    new TdcpQuerySource({
        definition: {
            sourceType: QuerySourceType.SEMANTIC_LAYER,
            label: 'Semantic layer',
            description:
                'Metric queries against the explores of this project. Tables are explores; columns are their dimensions and metrics, referenced by field id. Result columns are named by field id — exactly the dimensions and metrics requested.',
        },
        server: new SemanticLayerTdcpServer({
            asyncQueryService,
            projectService,
            projectModel,
        }),
    }),
    new TdcpQuerySource({
        definition: {
            sourceType: QuerySourceType.SQL,
            label: 'Warehouse SQL',
            description:
                'Raw SQL against the project data warehouse. Tables are referenced as database.schema.table in the SQL dialect of the warehouse. Result columns are named by the SELECT output names.',
        },
        server: new SqlTdcpServer({
            asyncQueryService,
            projectModel,
            warehouseAvailableTablesModel,
        }),
    }),
    new TdcpQuerySource({
        definition: {
            sourceType: QuerySourceType.DUCKDB,
            label: 'DuckDB compose',
            description:
                'DuckDB SQL over other query results. References expose results as named tables: an array of node ids (each a table named by its node id) or a {tableName: nodeIdOrQueryUuid} map. A referenced result keeps the column names of the query that produced it — field ids for semanticLayer queries, SELECT output names for sql queries. References to still-running queries are waited on.',
        },
        server: new DuckdbComposeTdcpServer({ asyncQueryService }),
    }),
];
