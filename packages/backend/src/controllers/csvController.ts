import {
    ApiCsvUrlResponse,
    ApiErrorPayload,
    assertRegisteredAccount,
    UnexpectedServerError,
} from '@lightdash/common';
import {
    Get,
    Middlewares,
    OperationId,
    Path,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../auth/account';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/csv')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Exports')
export class CsvController extends BaseController {
    /**
     * Get the status/URL of a Google Sheets export job
     * @summary Get export status
     * @param jobId the jobId for the export
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{jobId}')
    @OperationId('getGsheetExportStatus')
    async get(
        @Path() jobId: string,
        @Request() req: express.Request,
    ): Promise<ApiCsvUrlResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const csvDetails = await this.services
            .getSchedulerService()
            .getGsheetExportStatus(toSessionUser(req.account), jobId);
        return {
            status: 'ok',
            results: {
                url: csvDetails.details?.fileUrl,
                status: csvDetails.status,
                truncated: !!csvDetails.details?.truncated,
            },
        };
    }
}
