import {
    assertRegisteredAccount,
    type ApiErrorPayload,
    type ApiExecuteWarehouseConnectionSwitchRequest,
    type ApiWarehouseConnectionSwitchAvailabilityResponse,
    type ApiWarehouseConnectionSwitchPlanResponse,
    type ApiWarehouseConnectionSwitchRequest,
    type ApiWarehouseConnectionSwitchResponse,
    type UUID,
} from '@lightdash/common';
import {
    Body,
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Path,
    Post,
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

@Route('/api/v1/projects/{projectUuid}/warehouse-connection-mode')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
@Hidden()
export class WarehouseConnectionSwitchController extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('getWarehouseConnectionSwitchAvailability')
    async getWarehouseConnectionSwitchAvailability(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiWarehouseConnectionSwitchAvailabilityResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getWarehouseConnectionSwitchService()
                .getAvailability(req.account, projectUuid),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/preview')
    @OperationId('previewWarehouseConnectionSwitch')
    async previewWarehouseConnectionSwitch(
        @Path() projectUuid: UUID,
        @Body() body: ApiWarehouseConnectionSwitchRequest,
        @Request() req: express.Request,
    ): Promise<ApiWarehouseConnectionSwitchPlanResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getWarehouseConnectionSwitchService()
                .preview(req.account, projectUuid, body),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/switch')
    @OperationId('switchToMultipleWarehouseConnections')
    async switchToMultipleWarehouseConnections(
        @Path() projectUuid: UUID,
        @Body() body: ApiExecuteWarehouseConnectionSwitchRequest,
        @Request() req: express.Request,
    ): Promise<ApiWarehouseConnectionSwitchResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getWarehouseConnectionSwitchService()
                .execute(req.account, projectUuid, body),
        };
    }
}
