import {
    ApiErrorPayload,
    SemanticLayerField,
    SemanticLayerQuery,
    SemanticLayerResultRow,
    SemanticLayerView,
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
import { allowApiKeyAuthentication, isAuthenticated } from '../authentication';
import { BaseController } from '../baseController';

@Route('/api/v2/projects/{projectUuid}/semantic-layer/')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'SemanticLayer')
// FIXME: unhide
@Hidden() // Hide this endpoint from the documentation for now
export class SemanticLayerController extends BaseController {
    /**
     * Get views from semantic layer
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/views')
    @OperationId('GetSemanticLayerViews')
    async getViews(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<{ status: 'ok'; results: SemanticLayerView[] }> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSemanticLayerService()
                .getViews(req.user!, projectUuid),
        };
    }

    /**
     * Get fields from semantic layer
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/views/{table}/fields')
    @OperationId('getSemanticLayerFields')
    async getFields(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() table: string,
        @Query('dimensions') dimensions: string[] = [],
        @Query('timeDimensions') timeDimensions: string[] = [],
        @Query('metrics') metrics: string[] = [],
    ): Promise<{ status: 'ok'; results: SemanticLayerField[] }> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSemanticLayerService()
                .getFields(req.user!, projectUuid, table, {
                    dimensions,
                    timeDimensions,
                    metrics,
                }),
        };
    }

    /**
     * Get results from semantic layer
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/results')
    @OperationId('getSemanticLayerResults')
    async getResults(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: SemanticLayerQuery,
    ): Promise<{ status: 'ok'; results: SemanticLayerResultRow[] }> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSemanticLayerService()
                .getResults(req.user!, projectUuid, body),
        };
    }

    /**
     * Get SQL from semantic layer
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/sql')
    @OperationId('getSemanticLayerSql')
    async getSql(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: SemanticLayerQuery,
    ): Promise<{ status: 'ok'; results: string }> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSemanticLayerService()
                .getSql(req.user!, projectUuid, body),
        };
    }
}
