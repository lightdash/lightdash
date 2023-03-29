import { ApiCsvUrlResponse, ApiErrorPayload } from '@lightdash/common';
import { Post } from '@tsoa/runtime';
import express from 'express';
import {
    Body,
    Controller,
    Middlewares,
    OperationId,
    Path,
    Request,
    Response,
    Route,
    SuccessResponse,
} from 'tsoa';
import { schedulerService } from '../services/services';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';

@Route('/api/v1/csv')
@Response<ApiErrorPayload>('default', 'Error')
export class CsvController extends Controller {
    /**
     * Get a Csv
     * @param jobId the jobId for the CSV
     * @param token the token for the CSV assigned to the jobId
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('{jobId}')
    @OperationId('getScheduler')
    async get(
        @Body() body: { token: string },
        @Path() jobId: string,
        @Request() req: express.Request,
    ): Promise<ApiCsvUrlResponse> {
        this.setStatus(200);
        const csvDetails = await schedulerService.getCsvUrl(
            req.user!,
            jobId,
            body.token,
        );
        return {
            status: 'ok',
            results: {
                url: csvDetails.details?.fileUrl,
                status: csvDetails.status,
            },
        };
    }
}
