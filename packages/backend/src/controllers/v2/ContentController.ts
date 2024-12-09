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
import { ContentArgs } from '../../models/ContentModel/ContentModelTypes';
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
    async listContent(
        @Request() req: express.Request,
        @Query() projectUuids?: string[],
        @Query() spaceUuids?: string[],
        @Query() contentTypes?: ContentType[],
        @Query() pageSize?: number,
        @Query() page?: number,
        @Query() search?: string,
        @Query() sortBy?: ContentArgs['sortBy'],
        @Query() sortDirection?: ContentArgs['sortDirection'],
    ): Promise<ApiContentResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services.getContentService().find(
                req.user!,
                {
                    projectUuids,
                    spaceUuids,
                    contentTypes,
                    search,
                },
                {
                    sortBy,
                    sortDirection,
                },
                {
                    page: page || 1,
                    pageSize: pageSize || 10,
                },
            ),
        };
    }
}
