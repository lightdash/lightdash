import { QuerySourceType } from '@lightdash/common';
import type { AsyncQueryService } from '../../AsyncQueryService/AsyncQueryService';
import type { ProjectService } from '../../ProjectService/ProjectService';
import { TdcpQuerySource } from '../sources/TdcpQuerySource';
import {
    createDuckdbComposeTdcpServer,
    duckdbQueryReferences,
    duckdbSourceQueryToDataRequest,
} from './servers/DuckdbComposeTdcpServer';
import {
    createSemanticLayerTdcpServer,
    semanticLayerSourceQueryToDataRequest,
} from './servers/SemanticLayerTdcpServer';
import { createSqlTdcpServer } from './servers/SqlTdcpServer';

type BuiltInTdcpSourcesArguments = {
    asyncQueryService: AsyncQueryService;
    projectService: ProjectService;
};

/**
 * The built-in query sources, each an in-process TDCP server behind the one
 * adapter. Each server module owns its SourceQuery -> protocol mapping, so
 * the adapter stays source-agnostic. The outbound MCP extension re-exposes
 * these same server instances, so this list is also the deployment's
 * outbound source inventory.
 */
export const createBuiltInTdcpQuerySources = ({
    asyncQueryService,
    projectService,
}: BuiltInTdcpSourcesArguments): TdcpQuerySource[] => {
    const sqlServer = createSqlTdcpServer({
        asyncQueryService,
        projectService,
    });
    return [
        new TdcpQuerySource({
            definition: {
                sourceType: QuerySourceType.SEMANTIC_LAYER,
                label: 'Semantic layer',
                description:
                    'Metric queries against the explores of this project. Tables are explores; columns are their dimensions and metrics, referenced by field id. Result columns are named by field id — exactly the dimensions and metrics requested.',
            },
            server: createSemanticLayerTdcpServer({
                asyncQueryService,
                projectService,
            }),
            toDataRequest: semanticLayerSourceQueryToDataRequest,
        }),
        new TdcpQuerySource({
            definition: {
                sourceType: QuerySourceType.SQL,
                label: 'Warehouse SQL',
                description:
                    'Raw SQL against the project data warehouse. Tables are referenced as database.schema.table in the SQL dialect of the warehouse. Result columns are named by the SELECT output names.',
            },
            server: sqlServer.server,
            toDataRequest: sqlServer.toDataRequest,
        }),
        new TdcpQuerySource({
            definition: {
                sourceType: QuerySourceType.DUCKDB,
                label: 'DuckDB compose',
                description:
                    'DuckDB SQL over other query results. References expose results as named tables: an array of node ids (each a table named by its node id) or a {tableName: nodeIdOrQueryUuid} map. A referenced result keeps the column names of the query that produced it — field ids for semanticLayer queries, SELECT output names for sql queries. References to still-running queries are waited on.',
            },
            server: createDuckdbComposeTdcpServer({ asyncQueryService }),
            toDataRequest: duckdbSourceQueryToDataRequest,
            getQueryReferences: duckdbQueryReferences,
        }),
    ];
};
