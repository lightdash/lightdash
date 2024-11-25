import {
    ApiCatalogAnalyticsResults,
    ApiCatalogMetadataResults,
    ApiCatalogResults,
    ApiCatalogSearch,
    ApiErrorPayload,
    ApiGetMetricPeek,
    ApiMetricsCatalog,
    getItemId,
    type ApiSort,
    type ApiSuccessEmpty,
    type CatalogItemIcon,
    type KnexPaginateArgs,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Middlewares,
    OperationId,
    Patch,
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
        @Query() search?: ApiCatalogSearch['searchQuery'],
        @Query() type?: ApiCatalogSearch['type'],
        @Query() filter?: ApiCatalogSearch['filter'],
    ): Promise<{ status: 'ok'; results: ApiCatalogResults }> {
        this.setStatus(200);
        const query: ApiCatalogSearch = {
            searchQuery: search,
            type,
            filter,
        };

        const { data: results } = await this.services
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
            .getFieldAnalytics(
                req.user!,
                projectUuid,
                getItemId({
                    name: field,
                    table,
                }),
            );
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Get metrics catalog
     * @param projectUuid
     * @param query contains filters for the catalog items as well as pagination
     * - search: string
     * - page: number
     * - pageSize: number
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/metrics')
    @OperationId('getMetricsCatalog')
    async getMetricsCatalog(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() search?: ApiCatalogSearch['searchQuery'],
        @Query() page?: number,
        @Query() pageSize?: number,
        @Query() sort?: ApiSort['sort'],
        @Query() order?: ApiSort['order'],
        @Query() categories?: ApiCatalogSearch['catalogTags'],
    ): Promise<ApiMetricsCatalog> {
        this.setStatus(200);

        const paginateArgs: KnexPaginateArgs | undefined =
            page && pageSize
                ? {
                      page,
                      pageSize,
                  }
                : undefined;

        const sortArgs: ApiSort | undefined = sort
            ? {
                  sort,
                  order,
              }
            : undefined;

        const results = await this.services
            .getCatalogService()
            .getMetricsCatalog(
                req.user!,
                projectUuid,
                paginateArgs,
                {
                    searchQuery: search,
                    catalogTags: categories,
                },
                sortArgs,
            );

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Get metric by table and metric name
     * @param projectUuid
     * @param tableName
     * @param metricName
     * @returns the complete metric object
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/metrics/{tableName}/{metricName}')
    @OperationId('getMetric')
    async getMetric(
        @Path() projectUuid: string,
        @Path() tableName: string,
        @Path() metricName: string,
        @Request() req: express.Request,
    ): Promise<ApiGetMetricPeek> {
        this.setStatus(200);

        const results = await this.services
            .getCatalogService()
            .getMetric(req.user!, projectUuid, tableName, metricName);

        return {
            status: 'ok',
            results,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('{catalogSearchUuid}/categories')
    @OperationId('addCategoryToCatalogItem')
    async addCategoryToCatalogItem(
        @Path() catalogSearchUuid: string,
        @Body()
        body: {
            tagUuid: string;
        },
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        await this.services
            .getCatalogService()
            .tagCatalogItem(req.user!, catalogSearchUuid, body.tagUuid);

        this.setStatus(200);

        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Delete('{catalogSearchUuid}/categories/{tagUuid}')
    @OperationId('removeCategoryFromCatalogItem')
    async removeCategoryFromCatalogItem(
        @Path() catalogSearchUuid: string,
        @Path() tagUuid: string,
        @Request() req: express.Request,
    ) {
        await this.services
            .getCatalogService()
            .untagCatalogItem(req.user!, catalogSearchUuid, tagUuid);

        this.setStatus(200);

        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Patch('{catalogSearchUuid}/icon')
    @OperationId('updateCatalogItemIcon')
    async updateCatalogItemIcon(
        @Path() projectUuid: string,
        @Path() catalogSearchUuid: string,
        @Body() body: { icon: CatalogItemIcon | null },
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        await this.services
            .getCatalogService()
            .updateCatalogItemIcon(
                req.user!,
                projectUuid,
                catalogSearchUuid,
                body.icon,
            );

        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
