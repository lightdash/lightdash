import {
    assertRegisteredAccount,
    type ApiBindDbtSourceToWarehouseConnectionRequest,
    type ApiDbtSourceBindingsResponse,
    type ApiErrorPayload,
    type ApiSuccessEmpty,
    type UUID,
} from '@lightdash/common';
import {
    Body,
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Path,
    Put,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/warehouse-connections/dbt-sources')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
@Hidden()
export class WarehouseConnectionBindingController extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/bindings')
    @OperationId('getDbtSourceWarehouseConnectionBindings')
    async getDbtSourceWarehouseConnectionBindings(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiDbtSourceBindingsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getWarehouseConnectionBindingService()
                .getDbtSourceBindings(req.account, projectUuid),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Put('/{projectDbtSourceUuid}')
    @OperationId('bindDbtSourceToWarehouseConnection')
    async bindDbtSourceToWarehouseConnection(
        @Path() projectUuid: UUID,
        @Path() projectDbtSourceUuid: UUID,
        @Body() body: ApiBindDbtSourceToWarehouseConnectionRequest,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getWarehouseConnectionBindingService()
            .bindDbtSource(
                req.account,
                projectUuid,
                projectDbtSourceUuid,
                body.warehouseConnectionUuid,
            );
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }
}
