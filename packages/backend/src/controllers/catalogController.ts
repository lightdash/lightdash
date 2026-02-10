import {
    ApiCatalogAnalyticsResults,
    ApiCatalogMetadataResults,
    ApiCatalogResults,
    ApiCatalogSearch,
    ApiErrorPayload,
    ApiGetMetricPeek,
    ApiMetricsCatalog,
    ApiSegmentDimensionsResponse,
    CatalogOwner,
    getItemId,
    type ApiCreateMetricsTreePayload,
    type ApiCreateMetricsTreeResponse,
    type ApiFilterDimensionsResponse,
    type ApiGetAllMetricsTreeEdges,
    type ApiGetMetricsTree,
    type ApiGetMetricsTreePayload,
    type ApiGetMetricsTreesResponse,
    type ApiMetricsTreeEdgePayload,
    type ApiMetricsWithAssociatedTimeDimensionResponse,
    type ApiSort,
    type ApiSuccessEmpty,
    type CatalogCategoryFilterMode,
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
import { CatalogSearchContext } from '../models/CatalogModel/CatalogModel';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/dataCatalog')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Catalog')
export class CatalogController extends BaseController {
    /**
     * Get catalog items
     * @summary Get catalog
     * @param projectUuid
     * @param query contains filters for the catalog items
     * - search: string
     * - type: 'table' | 'field'
     * @returns ApiCatalogResults
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
            .getCatalog(
                req.user!,
                projectUuid,
                query,
                CatalogSearchContext.CATALOG,
            );

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Get catalog metadata for tables
     * @summary Get table metadata
     * @param projectUuid
     * @param table Table name to get metadata for
     * @returns ApiCatalogMetadataResults
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
     * @summary Get table analytics
     * @param projectUuid
     * @param table Table name to get analytics for
     * @returns ApiCatalogAnalyticsResults
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
     * @summary Get field analytics
     * @param projectUuid
     * @param field Field name to get analytics for
     * @param table Table where this field belongs
     * @returns ApiCatalogAnalyticsResults
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
     * @summary List metrics in catalog
     * @param projectUuid
     * @param query contains filters for the catalog items as well as pagination
     * - search: string
     * - page: number
     * - pageSize: number
     * @returns ApiMetricsCatalog
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
        @Query() categoriesFilterMode?: CatalogCategoryFilterMode,
        @Query() tables?: ApiCatalogSearch['tables'],
        @Query() ownerUserUuids?: ApiCatalogSearch['ownerUserUuids'],
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
                CatalogSearchContext.SPOTLIGHT,
                paginateArgs,
                {
                    searchQuery: search,
                    catalogTags: categories,
                    catalogTagsFilterMode: categoriesFilterMode,
                    tables,
                    ownerUserUuids,
                },
                sortArgs,
            );

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Get all edges in the metrics tree for a project
     * @summary Get all metrics tree edges
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/metrics/tree/edges')
    @OperationId('getAllMetricsTreeEdges')
    async getAllMetricsTreeEdges(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiGetAllMetricsTreeEdges> {
        this.setStatus(200);

        const results = await this.services
            .getCatalogService()
            .getAllMetricsTreeEdges(req.user!, projectUuid);

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Get metric by table and metric name
     * @summary Get metric
     * @param projectUuid
     * @param tableName
     * @param metricName
     * @returns ApiGetMetricPeek
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

    /**
     * Get metrics with time dimensions
     * @summary Get metrics with time dimensions
     * @param projectUuid
     * @returns ApiMetricsWithAssociatedTimeDimensionResponse
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/metrics-with-time-dimensions')
    @OperationId('getMetricsWithTimeDimensions')
    async getMetricsWithTimeDimensions(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() tableName?: string,
    ): Promise<ApiMetricsWithAssociatedTimeDimensionResponse> {
        this.setStatus(200);

        const results = await this.services
            .getCatalogService()
            .getAllCatalogMetricsWithTimeDimensions(
                req.user!,
                projectUuid,
                CatalogSearchContext.SPOTLIGHT,
                tableName,
            );

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Get dimensions that can be used to filter metrics
     * @summary Get filter dimensions
     * @param projectUuid
     * @param tableName
     * @returns ApiFilterDimensionsResponse
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{tableName}/filter-dimensions')
    @OperationId('getFilterDimensions')
    async getFilterDimensions(
        @Path() projectUuid: string,
        @Path() tableName: string,
        @Request() req: express.Request,
    ): Promise<ApiFilterDimensionsResponse> {
        this.setStatus(200);

        const results = await this.services
            .getCatalogService()
            .getFilterDimensions(
                req.user!,
                projectUuid,
                tableName,
                CatalogSearchContext.METRICS_EXPLORER,
            );

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Get dimensions that can be used to segment metrics
     * @summary Get segment dimensions
     * @param projectUuid
     * @param tableName
     * @returns ApiSegmentDimensionsResponse
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{tableName}/segment-dimensions')
    @OperationId('getSegmentDimensions')
    async getSegmentDimensions(
        @Path() projectUuid: string,
        @Path() tableName: string,
        @Request() req: express.Request,
    ): Promise<ApiSegmentDimensionsResponse> {
        this.setStatus(200);

        const results = await this.services
            .getCatalogService()
            .getSegmentDimensions(
                req.user!,
                projectUuid,
                tableName,
                CatalogSearchContext.METRICS_EXPLORER,
            );

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Add a category to a catalog item
     * @summary Add category to catalog item
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
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

    /**
     * Remove a category from a catalog item
     * @summary Remove category from catalog item
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
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

    /**
     * Update the icon for a catalog item
     * @summary Update catalog item icon
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
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

    /**
     * Get the metrics tree structure (deprecated, use POST instead)
     * @summary Get metrics tree
     * @deprecated Use POST /metrics/tree instead for large metric lists
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/metrics/tree')
    @OperationId('getMetricsTreeLegacy')
    async getMetricsTreeLegacy(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() metricUuids: string[],
    ): Promise<ApiGetMetricsTree> {
        this.setStatus(200);

        const results = await this.services
            .getCatalogService()
            .getMetricsTree(req.user!, projectUuid, metricUuids);

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Get the metrics tree structure
     * @summary Get metrics tree
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/metrics/tree')
    @OperationId('getMetricsTree')
    async getMetricsTree(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Body() body: ApiGetMetricsTreePayload,
    ): Promise<ApiGetMetricsTree> {
        this.setStatus(200);

        const results = await this.services
            .getCatalogService()
            .getMetricsTree(req.user!, projectUuid, body.metricUuids);

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Create an edge in the metrics tree
     * @summary Create metrics tree edge
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/metrics/tree/edges')
    @OperationId('createMetricsTreeEdge')
    async createMetricsTreeEdge(
        @Path() projectUuid: string,
        @Body() body: ApiMetricsTreeEdgePayload,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        await this.services
            .getCatalogService()
            .createMetricsTreeEdge(req.user!, projectUuid, body);

        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Delete an edge from the metrics tree
     * @summary Delete metrics tree edge
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete(
        '/metrics/tree/edges/{sourceCatalogSearchUuid}/{targetCatalogSearchUuid}',
    )
    @OperationId('deleteMetricsTreeEdge')
    async deleteMetricsTreeEdge(
        @Path() projectUuid: string,
        @Path() sourceCatalogSearchUuid: string,
        @Path() targetCatalogSearchUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        await this.services
            .getCatalogService()
            .deleteMetricsTreeEdge(req.user!, projectUuid, {
                sourceCatalogSearchUuid,
                targetCatalogSearchUuid,
            });

        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Check if there are any metrics in catalog
     * @summary Check if metrics exist in catalog
     * @param projectUuid
     * @returns boolean indicating if there are metrics
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/metrics/has')
    @OperationId('hasMetricsInCatalog')
    async hasMetricsInCatalog(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: boolean }> {
        this.setStatus(200);

        const results = await this.services
            .getCatalogService()
            .hasMetricsInCatalog(req.user!, projectUuid);

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Get distinct metric owners for filter dropdown
     * @summary List metric owners
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/metrics/owners')
    @OperationId('getMetricOwners')
    async getMetricOwners(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: CatalogOwner[] }> {
        this.setStatus(200);

        const results = await this.services
            .getCatalogService()
            .getMetricOwners(req.user!, projectUuid);

        return {
            status: 'ok',
            results,
        };
    }

    // --- Saved Metrics Trees ---

    /**
     * List saved metrics trees for a project
     * @summary List metrics trees
     * @param projectUuid
     * @param page Page number (1-indexed)
     * @param pageSize Number of trees per page
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/metrics/trees')
    @OperationId('getMetricsTrees')
    async getMetricsTrees(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() page?: number,
        @Query() pageSize?: number,
    ): Promise<ApiGetMetricsTreesResponse> {
        this.setStatus(200);

        const paginateArgs: KnexPaginateArgs | undefined =
            page && pageSize ? { page, pageSize } : undefined;

        const results = await this.services
            .getCatalogService()
            .getMetricsTrees(req.user!, projectUuid, paginateArgs);

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Create a new saved metrics tree with nodes and edges
     * @summary Create metrics tree
     * @param projectUuid
     * @param body.name Name of the metrics tree
     * @param body.slug Optional slug for the tree (auto-generated from name if omitted)
     * @param body.description Optional description
     * @param body.source Whether the tree was created from 'ui' or 'yaml' (defaults to 'ui')
     * @param body.nodes List of catalog metrics to include as nodes, with optional positions
     * @param body.edges List of edges between nodes, deduplicated against existing edges
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/metrics/trees')
    @OperationId('createMetricsTree')
    async createMetricsTree(
        @Path() projectUuid: string,
        @Body() body: ApiCreateMetricsTreePayload,
        @Request() req: express.Request,
    ): Promise<ApiCreateMetricsTreeResponse> {
        this.setStatus(201);

        const results = await this.services
            .getCatalogService()
            .createMetricsTree(req.user!, projectUuid, body);

        return {
            status: 'ok',
            results,
        };
    }
}
