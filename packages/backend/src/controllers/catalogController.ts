import {
    ApiCatalogAnalyticsResults,
    ApiCatalogMetadataResults,
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
     * - type: 'table' | 'field'
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
        @Query() type?: ApiCatalogSearch['type'],
    ): Promise<{ status: 'ok'; results: ApiCatalogResults }> {
        this.setStatus(200);
        const query: ApiCatalogSearch = {
            search,
            type,
        };

        const results = await this.services
            .getCatalogService()
            .getCatalog(req.user!, projectUuid, query);
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Get catalog metadata for tables
     * @param projectUuid
     * @param table Table name to get metadata for
     * @returns
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{table}/metadata')
    @OperationId('getMetadata')
    async getMetadata(
        @Path() projectUuid: string,
        @Path() table: string,
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: ApiCatalogMetadataResults }> {
        this.setStatus(200);

        const results = await this.services
            .getCatalogService()
            .getMetadata(req.user!, projectUuid, table);
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Get catalog analytics for tables
     * @param projectUuid
     * @param table Table name to get analytics for
     * @returns
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{table}/analytics')
    @OperationId('getAnalytics')
    async getAnalytics(
        @Path() projectUuid: string,
        @Path() table: string,
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: ApiCatalogAnalyticsResults }> {
        this.setStatus(200);

        const results = await this.services
            .getCatalogService()
            .getAnalytics(req.user!, projectUuid, table);
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Get catalog analytics for fields
     * @param projectUuid
     * @param field Field name to get analytics for
     * @param table Table where this field belongs
     * @returns
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{table}/analytics/{field}')
    @OperationId('getAnalyticsField')
    async getAnalyticsField(
        @Path() projectUuid: string,
        @Path() table: string,
        @Path() field: string,
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: ApiCatalogAnalyticsResults }> {
        this.setStatus(200);
        const results = await this.services
            .getCatalogService()
            .getFieldAnalytics(req.user!, projectUuid, table, field);
        return {
            status: 'ok',
            results,
        };
    }
}
