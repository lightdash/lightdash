import {
    ForbiddenError,
    type ApiDataAppDetectResponse,
    type ApiErrorPayload,
    type DataAppDetectRequest,
} from '@lightdash/common';
import {
    Body,
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

    private getService(): DataAppAnalysisService {
        return this.services.getDataAppAnalysisService<DataAppAnalysisService>();
    }
}
