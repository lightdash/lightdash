import {
    ApiErrorPayload,
    Connection,
    ConnectionType,
} from '@lightdash/common';
import {
    Controller,
    Get,
    Middlewares,
    OperationId,
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
} from './authentication';
import { BaseController } from './baseController';
import { DbConnection } from '../database/entities/connections';

type ConnApiSuccess<T> = {
    status: 'ok';
    results: T;
};

export const mapDbConnectionToConnection = (row: DbConnection): Connection => ({
  connectionUuid: row.connection_uuid,
  type: row.type as ConnectionType,
  userUuid: row.user_uuid,
  shopUrl: row.shop_url,
});


@Route('/api/v1/connections')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Connections')
export class ConnectionsController extends BaseController {
    /**
     * Get user connections
     * Returns all connections (Shopify, Google Analytics, etc.) for the current user
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/')
    @OperationId('getConnections')
    @SuccessResponse('200', 'Success')
    async getConnections(
        @Request() req: express.Request,
    ): Promise<ConnApiSuccess<Connection[]>> {

        const connectionsService = req.services.getConnectionsService();
        const connectionsInDb: DbConnection[] = await connectionsService.getConnectionsByUserUuid(req.user!.userUuid);
        const connections: Connection[] = connectionsInDb.map((row) => mapDbConnectionToConnection(row));


        this.setStatus(200);
        return {
            status: 'ok',
            results: connections,
        };
    }
}