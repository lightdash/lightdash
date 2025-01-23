import {
    ApiErrorPayload,
    NotFoundError,
    type ApiGetSpotlightTableConfig,
    type ApiSuccessEmpty,
    type SpotlightTableConfig,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
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

@Route('/api/v1/projects/{projectUuid}/spotlight')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Spotlight')
export class SpotlightController extends BaseController {
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/table/config')
    @OperationId('postSpotlightTableConfig')
    async postSpotlightTableConfig(
        @Path() projectUuid: string,
        @Body() body: Pick<SpotlightTableConfig, 'columnConfig'>,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        await this.services
            .getSpotlightService()
            .createSpotlightTableConfig(req.user!, projectUuid, body);

        this.setStatus(201);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/table/config')
    @OperationId('getSpotlightTableConfig')
    async getSpotlightTableConfig(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiGetSpotlightTableConfig> {
        const { columnConfig } = await this.services
            .getSpotlightService()
            .getSpotlightTableConfig(req.user!, projectUuid);

        this.setStatus(200);
        return {
            status: 'ok',
            results: {
                columnConfig,
            },
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Deleted')
    @Delete('/table/config')
    @OperationId('resetSpotlightTableConfig')
    async resetSpotlightTableConfig(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        await this.services
            .getSpotlightService()
            .resetSpotlightTableConfig(req.user!, projectUuid);

        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
