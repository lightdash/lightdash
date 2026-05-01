import {
    ApiErrorPayload,
    assertRegisteredAccount,
    type ApiPaginatedMetricsWithTimeDimensionResponse,
    type ApiSort,
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
import { toSessionUser } from '../../auth/account';
import { CatalogSearchContext } from '../../models/CatalogModel/CatalogModel';
import { allowApiKeyAuthentication, isAuthenticated } from '../authentication';
import { BaseController } from '../baseController';

// Subset of sortable catalog fields relevant to this endpoint.
// Written as a literal union because TSOA cannot resolve utility types.
type CatalogSortField =
    | 'name'
    | 'label'
    | 'chartUsage'
    | 'tableLabel'
    | 'owner';

@Route('/api/v2/projects/{projectUuid}/dataCatalog')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Catalog')
export class CatalogV2Controller extends BaseController {
    /**
     * Get paginated metrics that have time dimensions available
     * @summary List metrics with time dimensions
     * @param projectUuid
     * @param page
     * @param pageSize
     * @param sort
     * @param order
     * @param tableName
     * @param categories Spotlight category yaml references to filter by (OR mode)
     * @param tags dbt tag names to filter by (OR mode)
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/metrics-with-time-dimensions')
    @OperationId('getPaginatedMetricsWithTimeDimensions')
    async getPaginatedMetricsWithTimeDimensions(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() page: number = 1,
        @Query() pageSize: number = 50,
        @Query() sort?: CatalogSortField,
        @Query() order?: 'asc' | 'desc',
        @Query() tableName?: string,
        @Query() categories?: string[],
        @Query() tags?: string[],
    ): Promise<ApiPaginatedMetricsWithTimeDimensionResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        const sortArgs: ApiSort | undefined = sort
            ? { sort, order }
            : undefined;

        const results = await this.services
            .getCatalogService()
            .getPaginatedMetricsWithTimeDimensions(
                toSessionUser(req.account),
                projectUuid,
                CatalogSearchContext.SPOTLIGHT,
                { page, pageSize },
                sortArgs,
                tableName,
                categories,
                tags,
            );

        return {
            status: 'ok',
            results,
        };
    }
}
