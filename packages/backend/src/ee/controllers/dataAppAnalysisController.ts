import {
    ForbiddenError,
    type ApiDataAppAnalysisLookupResponse,
    type ApiDataAppAnalysisResponse,
    type ApiDataAppDetectResponse,
    type ApiDataAppInvestigateResponse,
    type ApiDataAppPromptResponse,
    type ApiErrorPayload,
    type DataAppDetectRequest,
    type DataAppInvestigateRequest,
    type DataAppLookupRequest,
    type DataAppPromptRequest,
    type UUID,
} from '@lightdash/common';
import {
    Body,
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
} from '@tsoa/runtime';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { DataAppAnalysisService } from '../services/DataAppAnalysisService/DataAppAnalysisService';

@Route('/api/v2/projects/{projectUuid}/apps/{appUuid}/analysis')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class DataAppAnalysisController extends BaseController {
    /**
     * Scan the query results behind the viewer's current view of a data app
     * and return notable data points with evidence. Runs under the viewer's
     * own session; sources must be queries the viewer ran.
     * @summary Detect anomalies in a data app view
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/detect')
    @OperationId('detectDataAppAnomalies')
    async detect(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
        @Body() body: DataAppDetectRequest,
    ): Promise<ApiDataAppDetectResponse> {
        if (!req.account) {
            throw new ForbiddenError('Account is required');
        }
        this.setStatus(200);
        const results = await this.getService().detect(
            req.account,
            projectUuid,
            appUuid,
            body,
        );
        return { status: 'ok', results };
    }

    /**
     * Find a stored analysis of exactly the rows behind the viewer's current
     * view, with its investigations. Never runs the model; null when there
     * is none.
     * @summary Look up a stored analysis for a data app view
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/lookup')
    @OperationId('lookupDataAppAnalysis')
    async lookup(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
        @Body() body: DataAppLookupRequest,
    ): Promise<ApiDataAppAnalysisLookupResponse> {
        if (!req.account) {
            throw new ForbiddenError('Account is required');
        }
        this.setStatus(200);
        const results = await this.getService().lookup(
            req.account,
            projectUuid,
            appUuid,
            body,
        );
        return { status: 'ok', results };
    }

    /**
     * Answer a question the app asks about the viewer's own query results.
     * Plain-text answer from the fast model; no tools, no warehouse access.
     * @summary Ask the AI about a data app view
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/prompt')
    @OperationId('promptDataAppAi')
    async prompt(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
        @Body() body: DataAppPromptRequest,
    ): Promise<ApiDataAppPromptResponse> {
        if (!req.account) {
            throw new ForbiddenError('Account is required');
        }
        this.setStatus(200);
        const results = await this.getService().prompt(
            req.account,
            projectUuid,
            appUuid,
            body,
        );
        return { status: 'ok', results };
    }

    /**
     * Queue an agent investigation of one anomaly from a persisted detection.
     * Poll `GET /api/v1/schedulers/job/{jobId}/status`; the completed job's
     * details carry `investigationId`, readable via the analysis route.
     * @summary Investigate a detected anomaly
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('202', 'Accepted')
    @Post('/{analysisId}/investigate')
    @OperationId('investigateDataAppAnomaly')
    async investigate(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
        @Path() analysisId: UUID,
        @Body() body: DataAppInvestigateRequest,
    ): Promise<ApiDataAppInvestigateResponse> {
        if (!req.account) {
            throw new ForbiddenError('Account is required');
        }
        this.setStatus(202);
        const results = await this.getService().investigate(
            req.account,
            projectUuid,
            appUuid,
            analysisId,
            body,
        );
        return { status: 'ok', results };
    }

    /**
     * Read a persisted detection or investigation the viewer generated.
     * @summary Get a data app analysis
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{analysisId}')
    @OperationId('getDataAppAnalysis')
    async getAnalysis(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
        @Path() analysisId: UUID,
    ): Promise<ApiDataAppAnalysisResponse> {
        if (!req.account) {
            throw new ForbiddenError('Account is required');
        }
        this.setStatus(200);
        const results = await this.getService().getAnalysis(
            req.account,
            projectUuid,
            appUuid,
            analysisId,
        );
        return { status: 'ok', results };
    }

    private getService(): DataAppAnalysisService {
        return this.services.getDataAppAnalysisService<DataAppAnalysisService>();
    }
}
