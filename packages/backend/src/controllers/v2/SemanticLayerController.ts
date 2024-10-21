import {
    ApiErrorPayload,
    ApiJobScheduledResponse,
    ApiSemanticLayerClientInfo,
    SemanticLayerField,
    SemanticLayerQuery,
    SemanticLayerView,
    type ApiSemanticViewerChartCreate,
    type ApiSemanticViewerChartGet,
    type ApiSemanticViewerChartUpdate,
    type ApiSuccessEmpty,
    type SemanticViewerChartCreate,
    type SemanticViewerChartUpdate,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Hidden,
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
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../authentication';
import { BaseController } from '../baseController';

@Route('/api/v2/projects/{projectUuid}/semantic-layer/')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'SemanticLayer')
// FIXME: unhide
@Hidden() // Hide this endpoint from the documentation for now
export class SemanticLayerController extends BaseController {
    /**
     * Get semantic layer info
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('getSemanticLayerInfo')
    async getSemanticLayerInfo(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<ApiSemanticLayerClientInfo> {
        this.setStatus(200);

        return {
            status: 'ok',
            results: await this.services
                .getSemanticLayerService()
                .getSemanticLayerClientInfo(req.user!, projectUuid),
        };
    }

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
    @Post('/views/{view}/query-fields')
    @OperationId('querySemanticLayerFields')
    async querySemanticLayerFields(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() view: string,
        @Body()
        body: Pick<
            SemanticLayerQuery,
            'dimensions' | 'timeDimensions' | 'metrics'
        >,
    ): Promise<{ status: 'ok'; results: SemanticLayerField[] }> {
        this.setStatus(200);

        return {
            status: 'ok',
            results: await this.services
                .getSemanticLayerService()
                .getFields(req.user!, projectUuid, view, body),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/run')
    @OperationId('runSemanticLayerResults')
    async runSemanticLayerResults(
        @Path() projectUuid: string,
        @Body() body: SemanticLayerQuery,
        @Request() req: express.Request,
    ): Promise<ApiJobScheduledResponse> {
        this.setStatus(200);

        return {
            status: 'ok',
            results: await this.services
                .getSemanticLayerService()
                .getStreamingResults(req.user!, projectUuid, body),
        };
    }

    /**
     * Get semantic layer results from a file
     * @param fileId the fileId for the file
     * @param projectUuid the uuid for the project
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('results/{fileId}')
    @OperationId('getSemanticLayerResults')
    async getSemanticLayerResults(
        @Path() fileId: string,
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<any> {
        this.setStatus(200);
        this.setHeader('Content-Type', 'application/json');

        const readStream = await this.services
            .getProjectService()
            .getFileStream(req.user!, projectUuid, fileId);

        const { res } = req;
        if (res) {
            readStream.pipe(res);
            await new Promise<void>((resolve, reject) => {
                readStream.on('end', () => {
                    res.end();
                    resolve();
                });
            });
        }
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

    /**
     * Create a new semantic layer chart
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/saved')
    @OperationId('createSemanticViewerChart')
    async createSemanticViewerChart(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Body() body: SemanticViewerChartCreate,
    ): Promise<ApiSemanticViewerChartCreate> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSavedSemanticViewerChartService()
                .createSemanticViewerChart(req.user!, projectUuid, body),
        };
    }

    /**
     * Get a saved semantic viewer chart
     * @param projectUuid the uuid for the project
     * @param uuid the uuid for the saved semantic layer chart
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/saved')
    @OperationId('getSavedSemanticViewerChart')
    async getSavedSemanticViewerChart(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Query() slug?: string,
        @Query() uuid?: string,
    ): Promise<ApiSemanticViewerChartGet> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSavedSemanticViewerChartService()
                .getSemanticViewerChart(req.user!, projectUuid, { uuid, slug }),
        };
    }

    /**
     * Get a saved semantic viewer chart results job
     * @param projectUuid the uuid for the project
     * @param slug the slug for the saved semantic viewer chart
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/saved/results-job')
    @OperationId('getSavedSemanticViewerChartAndResults')
    async getSavedSemanticViewerChartAndResults(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Query() slug?: string,
        @Query() uuid?: string,
    ): Promise<ApiJobScheduledResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSemanticLayerService()
                .getSemanticViewerChartResultJob(req.user!, projectUuid, {
                    uuid,
                    slug,
                }),
        };
    }

    /**
     * Update semantic viewer chart
     * @param uuid the uuid for the saved semantic viewer chart
     * @param projectUuid the uuid for the project
     * @param req express request
     * @param body the body for the update
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('/saved/{uuid}')
    @OperationId('updateSavedSemanticViewerChart')
    async updateSavedSemanticViewerChart(
        @Path() projectUuid: string,
        @Path() uuid: string,
        @Request() req: express.Request,
        @Body() body: SemanticViewerChartUpdate,
    ): Promise<ApiSemanticViewerChartUpdate> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSavedSemanticViewerChartService()
                .updateSemanticViewerChart(req.user!, projectUuid, uuid, body),
        };
    }

    /**
     * Delete a saved semantic viewer chart
     * @param uuid the uuid for the saved semantic viewer chart
     * @param projectUuid the uuid for the project
     * @param req express request
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('saved/{uuid}')
    @OperationId('deleteSavedSemanticViewerChart')
    async deleteSavedSemanticViewerChart(
        @Path() projectUuid: string,
        @Path() uuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);
        await this.services
            .getSavedSemanticViewerChartService()
            .deleteSemanticViewerChart(req.user!, projectUuid, uuid);
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
