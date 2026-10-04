import {
    ApiAwsWebIdentityAudienceResponse,
    ApiErrorPayload,
} from '@lightdash/common';
import {
    Middlewares,
    OperationId,
    Post,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { isAuthenticated, unauthorisedInDemo } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/aws/web-identity')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
export class AwsWebIdentityController extends BaseController {
    /**
     * Generate an audience for Athena web identity authentication. Add it to
     * the IAM role's trust policy as accounts.google.com:oaud.
     * @summary Generate web identity audience
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('201', 'Success')
    @Post('audiences')
    @OperationId('createAwsWebIdentityAudience')
    async createAudience(
        @Request() req: express.Request,
    ): Promise<ApiAwsWebIdentityAudienceResponse> {
        const results = await this.services
            .getAwsWebIdentityService()
            .createAudience(req.account!);
        this.setStatus(201);
        return { status: 'ok', results };
    }
}
