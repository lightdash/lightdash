import {
    ApiContentResponse,
    ApiErrorPayload,
    ContentType,
} from '@lightdash/common';
import {
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { allowApiKeyAuthentication, isAuthenticated } from '../authentication';
import { BaseController } from '../baseController';

@Route('/api/v2/content')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Content')
@Hidden() // Hide this endpoint from the documentation for now
export class ContentController extends BaseController {
    /**
     * Get content (charts, dashboards, etc.)
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('List content')
    async listCharts(
        @Request() req: express.Request,
        @Query() projectUuids?: string[],
        @Query() spaceUuids?: string[],
        @Query() contentTypes?: ContentType[],
    ): Promise<ApiContentResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services.getContentService().find(req.user!, {
                projectUuids,
                spaceUuids,
                contentTypes,
            }),
        };
    }
}
