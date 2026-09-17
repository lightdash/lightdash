import {
    ApiConnectionResponse,
    ApiConnectionsResponse,
    ApiConnectionWithCredentialsResponse,
    ApiCreateConnectionRequest,
    ApiErrorPayload,
    ApiRenameConnectionRequest,
    ApiSuccessEmpty,
    ApiUpdateConnectionRequest,
    assertRegisteredAccount,
    UUID,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
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

@Route('/api/v1/projects/{projectUuid}/connections')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
export class ConnectionController extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('ListConnections')
    async listConnections(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiConnectionsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getConnectionService()
                .listWithCapabilities(req.account, projectUuid),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{connectionUuid}')
    @OperationId('GetConnection')
    async getConnection(
        @Path() projectUuid: UUID,
        @Path() connectionUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiConnectionWithCredentialsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getConnectionService()
                .get(req.account, projectUuid, connectionUuid),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('201', 'Created')
    @Post('/')
    @OperationId('CreateConnection')
    async createConnection(
        @Path() projectUuid: UUID,
        @Body() body: ApiCreateConnectionRequest,
        @Request() req: express.Request,
    ): Promise<ApiConnectionResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(201);
        return {
            status: 'ok',
            results: await this.services
                .getConnectionService()
                .create(req.account, projectUuid, body),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Patch('/{connectionUuid}')
    @OperationId('UpdateConnection')
    async updateConnection(
        @Path() projectUuid: UUID,
        @Path() connectionUuid: UUID,
        @Body() body: ApiUpdateConnectionRequest,
        @Request() req: express.Request,
    ): Promise<ApiConnectionResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getConnectionService()
                .update(req.account, projectUuid, connectionUuid, body),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Patch('/{connectionUuid}/name')
    @OperationId('RenameConnection')
    async renameConnection(
        @Path() projectUuid: UUID,
        @Path() connectionUuid: UUID,
        @Body() body: ApiRenameConnectionRequest,
        @Request() req: express.Request,
    ): Promise<ApiConnectionResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getConnectionService()
                .rename(req.account, projectUuid, connectionUuid, body.name),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Delete('/{connectionUuid}')
    @OperationId('DeleteConnection')
    async deleteConnection(
        @Path() projectUuid: UUID,
        @Path() connectionUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getConnectionService()
            .delete(req.account, projectUuid, connectionUuid);
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }
}
