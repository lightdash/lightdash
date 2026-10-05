import {
    ApiAwsWebIdentityAudienceResponse,
    ApiAwsWebIdentityResponse,
    ApiErrorPayload,
    CreateAwsWebIdentityAudience,
} from '@lightdash/common';
import {
    Body,
    Get,
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
@Tags('AWS Web Identity')
export class AwsWebIdentityController extends BaseController {
    /**
     * Get this instance's identity for Athena web identity authentication.
     * Add the subject to the IAM role's trust policy.
     * @summary Get web identity subject
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('200', 'Success')
    @Get('')
    @OperationId('getAwsWebIdentity')
    async getIdentity(
        @Request() req: express.Request,
    ): Promise<ApiAwsWebIdentityResponse> {
        const results = await this.services
            .getAwsWebIdentityService()
            .getIdentity(req.account!);
        this.setStatus(200);
        return { status: 'ok', results };
    }

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
        @Body() body: CreateAwsWebIdentityAudience,
    ): Promise<ApiAwsWebIdentityAudienceResponse> {
        const results = await this.services
            .getAwsWebIdentityService()
            .createAudience(req.account!, body);
        this.setStatus(201);
        return { status: 'ok', results };
    }
}
