import { ApiErrorPayload, ApiSuccessEmpty } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import {
    Body,
    Hidden,
    OperationId,
    Post,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import Logger from '../logging/logger';
import { BaseController } from './baseController';

@Route('/api/v1/csp-report')
@Response<ApiErrorPayload>('default', 'Error')
@Hidden()
export class CspReportController extends BaseController {
    @SuccessResponse('200', 'Success')
    @Post('/')
    @OperationId('Report CSP Violation')
    async report(@Body() body: any): Promise<ApiSuccessEmpty> {
        const error = new Error(
            `CSP violation reported: ${JSON.stringify(body)}`,
        );
        Logger.error(error);
        Sentry.captureException(error);
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
