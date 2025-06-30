import {
    ApiContentActionBody,
    ApiContentBulkActionBody,
    ApiContentResponse,
    ApiErrorPayload,
    ApiSuccessEmpty,
    ContentActionMove,
    ContentType,
    ParameterError,
} from '@lightdash/common';
import {
    Body,
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
import { ContentArgs } from '../../models/ContentModel/ContentModelTypes';
import { allowApiKeyAuthentication, isAuthenticated } from '../authentication';
import { BaseController } from '../baseController';

@Route('/api/v2/content')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Content')
export class ContentController extends BaseController {
    /**
     * Get content (charts, dashboards, spaces)
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('List content')
    async listContent(
        @Request() req: express.Request,
        @Query() projectUuids?: string[],
        @Query() spaceUuids?: string[],
        @Query() parentSpaceUuid?: string,
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

    /**
     * Move a single item (Chart, Dashboard, Space) to another space
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/:projectUuid/move')
    @OperationId('Move content')
    @Tags('Content', 'Move content')
    async moveContent(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: ApiContentActionBody<ContentActionMove>,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);

        if (body.action.type !== 'move') {
            throw new ParameterError('Invalid action type');
        }

        await this.services
            .getContentService()
            .move(
                req.user!,
                projectUuid,
                body.item,
                body.action.targetSpaceUuid,
            );

        return { status: 'ok', results: undefined };
    }

    /**
     * Move multiple items (Charts, Dashboards, Spaces) to another space
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/bulk-action/:projectUuid/move')
    @OperationId('Bulk move content')
    @Tags('Content', 'Bulk action', 'Move content')
    async bulkMoveContent(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: ApiContentBulkActionBody<ContentActionMove>,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);

        if (body.action.type !== 'move') {
            throw new ParameterError('Invalid action type');
        }

        await this.services
            .getContentService()
            .bulkMove(
                req.user!,
                projectUuid,
                body.content,
                body.action.targetSpaceUuid,
            );

        return { status: 'ok', results: undefined };
    }
}
