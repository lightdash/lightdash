import {
    ApiCatalogResults,
    ApiCatalogSearch,
    ApiErrorPayload,
} from '@lightdash/common';
import {
    Get,
    Middlewares,
    OperationId,
    Path,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/dataCatalog')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Catalog')
export class CatalogController extends BaseController {
    /**
     * Get catalog items
     * @param projectUuid
     * @param query contains filters for the catalog items
     * - search: string
     * - allTables: boolean
     * - allFields: boolean
     * @returns
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('getCatalog')
    async getCatalog(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() search?: ApiCatalogSearch['search'],
        @Query() allTables?: ApiCatalogSearch['allTables'],
        @Query() allFields?: ApiCatalogSearch['allFields'],
    ): Promise<{ status: 'ok'; results: ApiCatalogResults }> {
        this.setStatus(200);
        const query: ApiCatalogSearch = {
            search,
            allTables,
            allFields,
        };

        const results = await this.services
            .getCatalogService()
            .getCatalog(req.user!, projectUuid, query);
        return {
            status: 'ok',
            results,
        };
    }
}
