import {
    assertRegisteredAccount,
    type ApiErrorPayload,
    type ApiSqlRunnerWarehouseConnectionsResponse,
    type ApiSuccessEmpty,
    type ApiWarehouseDatabaseListing,
    type ApiWarehouseTableFields,
    type ApiWarehouseTablesCatalog,
    type UUID,
} from '@lightdash/common';
import {
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Path,
    Post,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/sqlRunner/connections')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('SQL runner')
@Hidden()
export class SqlRunnerConnectionsController extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('listSqlRunnerConnections')
    async listSqlRunnerConnections(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiSqlRunnerWarehouseConnectionsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getProjectService()
                .getSqlRunnerConnections(req.account, projectUuid),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{warehouseConnectionUuid}/databases')
    @OperationId('getSqlRunnerConnectionDatabases')
    async getSqlRunnerConnectionDatabases(
        @Path() projectUuid: UUID,
        @Path() warehouseConnectionUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiWarehouseDatabaseListing> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getProjectService()
                .getConnectionDatabases(
                    req.account,
                    projectUuid,
                    warehouseConnectionUuid,
                ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{warehouseConnectionUuid}/tables')
    @OperationId('getSqlRunnerConnectionTables')
    async getSqlRunnerConnectionTables(
        @Path() projectUuid: UUID,
        @Path() warehouseConnectionUuid: UUID,
        @Query() database: string,
        @Request() req: express.Request,
    ): Promise<ApiWarehouseTablesCatalog> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getProjectService()
                .getConnectionTables(
                    req.account,
                    projectUuid,
                    warehouseConnectionUuid,
                    database,
                ),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Get('/{warehouseConnectionUuid}/fields')
    @OperationId('getSqlRunnerConnectionTableFields')
    async getSqlRunnerConnectionTableFields(
        @Path() projectUuid: UUID,
        @Path() warehouseConnectionUuid: UUID,
        @Query() databaseName: string,
        @Query() schemaName: string,
        @Query() tableName: string,
        @Request() req: express.Request,
    ): Promise<ApiWarehouseTableFields> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getProjectService()
                .getConnectionTableFields(
                    req.account,
                    projectUuid,
                    warehouseConnectionUuid,
                    { databaseName, schemaName, tableName },
                ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{warehouseConnectionUuid}/refresh-catalog')
    @OperationId('refreshSqlRunnerConnectionCatalog')
    async refreshSqlRunnerConnectionCatalog(
        @Path() projectUuid: UUID,
        @Path() warehouseConnectionUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        await this.services
            .getProjectService()
            .refreshConnectionTables(
                req.account,
                projectUuid,
                warehouseConnectionUuid,
            );
        return { status: 'ok', results: undefined };
    }
}
