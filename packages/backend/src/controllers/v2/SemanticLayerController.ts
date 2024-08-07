import {
    ApiErrorPayload,
    CatalogField,
    CatalogTable,
    MetricQuery,
    ResultRow,
} from '@lightdash/common';
import {
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Path,
    Post,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { allowApiKeyAuthentication, isAuthenticated } from '../authentication';
import { BaseController } from '../baseController';

@Route('/api//v2/projects/{projectId}/semantic-layer/')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'SemanticLayer')
@Hidden() // Hide this endpoint from the documentation for now
export class SemanticLayerController extends BaseController {
    /**
     * Get tables from semantic layer
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/tables')
    @OperationId('GetSemanticLayerTables')
    async getTables(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<{ status: 'ok'; results: CatalogTable[] }> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSemanticLayerService()
                .getTables(req.user!, projectUuid),
        };
    }

    /**
     * Get fields from semantic layer
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/tables/{table}/fields')
    @OperationId('getSemanticLayerFields')
    async getFields(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() table: string,
    ): Promise<{ status: 'ok'; results: CatalogField[] }> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSemanticLayerService()
                .getFields(req.user!, projectUuid, table),
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
        @Post() query: MetricQuery,
    ): Promise<{ status: 'ok'; results: ResultRow[] }> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSemanticLayerService()
                .getResults(req.user!, projectUuid, query),
        };
    }

    /**
     * Get results from semantic layer
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/results')
    @OperationId('getSemanticLayerSql')
    async getSql(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Post() query: MetricQuery,
    ): Promise<{ status: 'ok'; results: string }> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSemanticLayerService()
                .getSql(req.user!, projectUuid, query),
        };
    }
}
