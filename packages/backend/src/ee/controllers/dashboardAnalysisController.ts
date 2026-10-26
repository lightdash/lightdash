import {
    ForbiddenError,
    type ApiDataAppAnalysisLookupResponse,
    type ApiDataAppAnalysisResponse,
    type ApiDataAppDetectResponse,
    type ApiDataAppInvestigateResponse,
    type ApiErrorPayload,
    type DataAppDetectRequest,
    type DataAppInvestigateRequest,
    type DataAppLookupRequest,
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
import { requireOAuthScopeOperation } from '../../auth/oauthScopes/unchecked';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { DataAppAnalysisService } from '../services/DataAppAnalysisService/DataAppAnalysisService';

/**
 * Sibling of DataAppAnalysisController for classic dashboards. Prompt is
 * app-only by design (dashboards have no app code to author prompts in).
 */
@Route('/api/v2/projects/{projectUuid}/dashboards/{dashboardUuid}/analysis')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class DashboardAnalysisController extends BaseController {
    /**
     * Scan the query results behind the viewer's current view of a dashboard
     * and return notable data points with evidence. Runs under the viewer's
     * own session; sources must be queries the viewer ran.
     * @summary Detect anomalies in a dashboard view
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        requireOAuthScopeOperation('DashboardAnalysisController.detect'),
    ])
    @SuccessResponse('200', 'Success')
    @Post('/detect')
    @OperationId('detectDashboardAnomalies')
    async detect(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() dashboardUuid: UUID,
        @Body() body: DataAppDetectRequest,
    ): Promise<ApiDataAppDetectResponse> {
        if (!req.account) {
            throw new ForbiddenError('Account is required');
        }
        this.setStatus(200);
        const results = await this.getService().detect(
            req.account,
            projectUuid,
            { kind: 'dashboard', dashboardUuid },
            body,
        );
        return { status: 'ok', results };
    }

    /**
     * Find a stored analysis of exactly the rows behind the viewer's current
     * view, with its investigations. Never runs the model; null when there
     * is none.
     * @summary Look up a stored analysis for a dashboard view
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        requireOAuthScopeOperation('DashboardAnalysisController.lookup'),
    ])
    @SuccessResponse('200', 'Success')
    @Post('/lookup')
    @OperationId('lookupDashboardAnalysis')
    async lookup(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() dashboardUuid: UUID,
        @Body() body: DataAppLookupRequest,
    ): Promise<ApiDataAppAnalysisLookupResponse> {
        if (!req.account) {
            throw new ForbiddenError('Account is required');
        }
        this.setStatus(200);
        const results = await this.getService().lookup(
            req.account,
            projectUuid,
            { kind: 'dashboard', dashboardUuid },
            body,
        );
        return { status: 'ok', results };
    }

    /**
     * Queue an agent investigation of one anomaly from a persisted detection.
     * Poll `GET /api/v1/schedulers/job/{jobId}/status`; the completed job's
     * details carry `investigationId`, readable via the analysis route.
     * @summary Investigate a detected dashboard anomaly
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        requireOAuthScopeOperation('DashboardAnalysisController.investigate'),
    ])
    @SuccessResponse('202', 'Accepted')
    @Post('/{analysisId}/investigate')
    @OperationId('investigateDashboardAnomaly')
    async investigate(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() dashboardUuid: UUID,
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
            { kind: 'dashboard', dashboardUuid },
            analysisId,
            body,
        );
        return { status: 'ok', results };
    }

    /**
     * Read a persisted detection or investigation the viewer generated.
     * @summary Get a dashboard analysis
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        requireOAuthScopeOperation('DashboardAnalysisController.getAnalysis'),
    ])
    @SuccessResponse('200', 'Success')
    @Get('/{analysisId}')
    @OperationId('getDashboardAnalysis')
    async getAnalysis(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() dashboardUuid: UUID,
        @Path() analysisId: UUID,
    ): Promise<ApiDataAppAnalysisResponse> {
        if (!req.account) {
            throw new ForbiddenError('Account is required');
        }
        this.setStatus(200);
        const results = await this.getService().getAnalysis(
            req.account,
            projectUuid,
            { kind: 'dashboard', dashboardUuid },
            analysisId,
        );
        return { status: 'ok', results };
    }

    private getService(): DataAppAnalysisService {
        return this.services.getDataAppAnalysisService<DataAppAnalysisService>();
    }
}
