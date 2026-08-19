import {
    ApiContentActionBody,
    ApiContentBulkActionBody,
    ApiContentBulkDeleteResponse,
    ApiContentResponse,
    ApiDeletedContentResponse,
    ApiErrorPayload,
    ApiPermanentlyDeleteContentBody,
    ApiRestoreContentBody,
    ApiSuccessEmpty,
    assertRegisteredAccount,
    ContentActionDelete,
    ContentActionMove,
    ContentType,
    ParameterError,
} from '@lightdash/common';
import {
    Body,
    Delete,
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
import { getAccountApiAccessContext, toSessionUser } from '../../auth/account';
import { ContentArgs } from '../../models/ContentModel/ContentModelTypes';
import { allowApiKeyAuthentication, isAuthenticated } from '../authentication';
import { BaseController } from '../baseController';

@Route('/api/v2/content')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Content')
export class ContentController extends BaseController {
    /**
     * Get content (charts, dashboards, spaces)
     * @summary List content
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('List content')
    async listContent(
        @Request() req: express.Request,
        @Query() projectUuids?: string[],
        @Query() spaceUuids?: string[],
        @Query() uuids?: string[],
        @Query() parentSpaceUuid?: string,
        @Query() contentTypes?: ContentType[],
        @Query() pageSize?: number,
        @Query() page?: number,
        @Query() search?: string,
        @Query() sortBy?: ContentArgs['sortBy'],
        @Query() sortDirection?: ContentArgs['sortDirection'],
        @Query() includePersonalDataApps?: boolean,
        @Query() dataAppVizsFilter?: 'exclude' | 'only',
    ): Promise<ApiContentResponse> {
        const { user } = getAccountApiAccessContext(req.account!);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services.getContentService().find(
                user,
                {
                    projectUuids,
                    spaceUuids,
                    uuids,
                    contentTypes,
                    search,
                    includePersonalDataApps,
                    dataAppVizsFilter,
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
     * @summary Move content
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
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        if (body.action.type !== 'move') {
            throw new ParameterError('Invalid action type');
        }

        await this.services
            .getContentService()
            .move(
                toSessionUser(req.account),
                projectUuid,
                body.item,
                body.action.targetSpaceUuid,
            );

        return { status: 'ok', results: undefined };
    }

    /**
     * Move multiple items (Charts, Dashboards, Spaces) to another space
     * @summary Bulk move content
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
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        if (body.action.type !== 'move') {
            throw new ParameterError('Invalid action type');
        }

        await this.services
            .getContentService()
            .bulkMove(
                toSessionUser(req.account),
                projectUuid,
                body.content,
                body.action.targetSpaceUuid,
            );

        return { status: 'ok', results: undefined };
    }

    /**
     * Delete a single item (Chart, Dashboard, Space). Soft-deletes when the
     * instance has soft delete enabled, otherwise deletes permanently.
     * @summary Delete content
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/:projectUuid/delete')
    @OperationId('Delete content')
    @Tags('Content', 'Delete content')
    async deleteContent(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: ApiContentActionBody<ContentActionDelete>,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        if (body.action.type !== 'delete') {
            throw new ParameterError('Invalid action type');
        }

        await this.services
            .getContentService()
            .delete(toSessionUser(req.account), projectUuid, body.item);

        return { status: 'ok', results: undefined };
    }

    /**
     * Delete multiple items (Charts, Dashboards, Spaces). Items the caller
     * cannot delete are skipped and reported in the response.
     * @summary Bulk delete content
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/bulk-action/:projectUuid/delete')
    @OperationId('Bulk delete content')
    @Tags('Content', 'Bulk action', 'Delete content')
    async bulkDeleteContent(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: ApiContentBulkActionBody<ContentActionDelete>,
    ): Promise<ApiContentBulkDeleteResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        if (body.action.type !== 'delete') {
            throw new ParameterError('Invalid action type');
        }

        return {
            status: 'ok',
            results: await this.services
                .getContentService()
                .bulkDelete(
                    toSessionUser(req.account),
                    projectUuid,
                    body.content,
                ),
        };
    }

    /**
     * Get deleted content (soft-deleted charts, dashboards, etc.)
     * @summary List deleted content
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/deleted')
    @OperationId('List deleted content')
    async listDeletedContent(
        @Request() req: express.Request,
        @Query() projectUuids: string[],
        @Query() pageSize?: number,
        @Query() page?: number,
        @Query() search?: string,
        @Query() contentTypes?: ContentType[],
        @Query() deletedByUserUuids?: string[],
    ): Promise<ApiDeletedContentResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services.getContentService().findDeleted(
                toSessionUser(req.account),
                {
                    projectUuids,
                    search,
                    contentTypes,
                    deletedByUserUuids,
                },
                {
                    page: page || 1,
                    pageSize: pageSize || 10,
                },
            ),
        };
    }

    /**
     * Restore a soft-deleted item (chart, dashboard, etc.)
     * @summary Restore content
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/:projectUuid/restore')
    @OperationId('Restore content')
    async restoreContent(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: ApiRestoreContentBody,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        await this.services
            .getContentService()
            .restoreContent(toSessionUser(req.account), projectUuid, body.item);
        return { status: 'ok', results: undefined };
    }

    /**
     * Permanently delete a soft-deleted item (chart, dashboard, etc.)
     * @summary Permanently delete content
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Delete('/:projectUuid/permanent')
    @OperationId('Permanently delete content')
    async permanentlyDeleteContent(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: ApiPermanentlyDeleteContentBody,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        await this.services
            .getContentService()
            .permanentlyDeleteContent(
                toSessionUser(req.account),
                projectUuid,
                body.item,
            );
        return { status: 'ok', results: undefined };
    }
}
