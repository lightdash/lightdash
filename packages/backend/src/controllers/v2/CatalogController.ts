import {
    AuthorizationError,
    type ApiErrorPayload,
    type ApiPaginatedMetricsWithTimeDimensionResponse,
    type KnexPaginateArgs,
} from '@lightdash/common';
import { CatalogSearchContext } from '../../models/CatalogModel/CatalogModel';
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
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../authentication/middlewares';
import { BaseController } from '../baseController';

@Route('/api/v2/projects/{projectUuid}/dataCatalog')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Catalog')
export class CatalogControllerV2 extends BaseController {
    /**
     * Get paginated metrics with time dimensions
     * @summary List metrics with time dimensions
     * @param projectUuid The uuid of the project
     * @param req express request
     * @param page page number
     * @param pageSize number of items per page
     * @param tableName optional table name filter
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/metrics-with-time-dimensions')
    @OperationId('getPaginatedMetricsWithTimeDimensions')
    async getPaginatedMetricsWithTimeDimensions(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() page?: number,
        @Query() pageSize?: number,
        @Query() tableName?: string,
    ): Promise<ApiPaginatedMetricsWithTimeDimensionResponse> {
        if (!req.user) {
            throw new AuthorizationError('User session not found');
        }

        this.setStatus(200);

        let paginateArgs: KnexPaginateArgs | undefined;
        if (page && pageSize) {
            paginateArgs = {
                page,
                pageSize,
            };
        }

        return {
            status: 'ok',
            results: await this.services
                .getCatalogService()
                .getCatalogMetricsWithTimeDimensionsPaginated(
                    req.user,
                    projectUuid,
                    CatalogSearchContext.SPOTLIGHT,
                    paginateArgs,
                    tableName,
                ),
        };
    }
}
