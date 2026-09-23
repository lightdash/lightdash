import {
    assertRegisteredAccount,
    type ApiCreateWarehouseConnectionRequest,
    type ApiErrorPayload,
    type ApiRenameWarehouseConnectionRequest,
    type ApiSuccessEmpty,
    type ApiUpdateWarehouseConnectionRequest,
    type ApiWarehouseConnectionResponse,
    type ApiWarehouseConnectionsResponse,
    type ApiWarehouseConnectionWithCredentialsResponse,
    type UUID,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Patch,
    Path,
    Post,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/warehouse-connections')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
@Hidden()
export class WarehouseConnectionController extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('listWarehouseConnections')
    async listWarehouseConnections(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiWarehouseConnectionsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getWarehouseConnectionService()
                .list(req.account, projectUuid),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{warehouseConnectionUuid}')
    @OperationId('getWarehouseConnection')
    async getWarehouseConnection(
        @Path() projectUuid: UUID,
        @Path() warehouseConnectionUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiWarehouseConnectionWithCredentialsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getWarehouseConnectionService()
                .get(req.account, projectUuid, warehouseConnectionUuid),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('201', 'Created')
    @Post('/')
    @OperationId('createWarehouseConnection')
    async createWarehouseConnection(
        @Path() projectUuid: UUID,
        @Body() body: ApiCreateWarehouseConnectionRequest,
        @Request() req: express.Request,
    ): Promise<ApiWarehouseConnectionResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(201);
        return {
            status: 'ok',
            results: await this.services
                .getWarehouseConnectionService()
                .create(req.account, projectUuid, body),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Patch('/{warehouseConnectionUuid}')
    @OperationId('updateWarehouseConnection')
    async updateWarehouseConnection(
        @Path() projectUuid: UUID,
        @Path() warehouseConnectionUuid: UUID,
        @Body() body: ApiUpdateWarehouseConnectionRequest,
        @Request() req: express.Request,
    ): Promise<ApiWarehouseConnectionResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getWarehouseConnectionService()
                .update(
                    req.account,
                    projectUuid,
                    warehouseConnectionUuid,
                    body,
                ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Patch('/{warehouseConnectionUuid}/name')
    @OperationId('renameWarehouseConnection')
    async renameWarehouseConnection(
        @Path() projectUuid: UUID,
        @Path() warehouseConnectionUuid: UUID,
        @Body() body: ApiRenameWarehouseConnectionRequest,
        @Request() req: express.Request,
    ): Promise<ApiWarehouseConnectionResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getWarehouseConnectionService()
                .rename(
                    req.account,
                    projectUuid,
                    warehouseConnectionUuid,
                    body.name,
                ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Delete('/{warehouseConnectionUuid}')
    @OperationId('deleteWarehouseConnection')
    async deleteWarehouseConnection(
        @Path() projectUuid: UUID,
        @Path() warehouseConnectionUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getWarehouseConnectionService()
            .delete(req.account, projectUuid, warehouseConnectionUuid);
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }
}
