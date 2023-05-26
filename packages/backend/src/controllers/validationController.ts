import {
    ApiErrorPayload,
    ApiJobScheduledResponse,
    ApiValidateResponse,
    ValidateProjectPayload,
} from '@lightdash/common';
import { Get, Post, Query } from '@tsoa/runtime';
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
import { validationService } from '../services/services';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';

@Route('/api/v1/projects/{projectUuid}/validate')
@Response<ApiErrorPayload>('default', 'Error')
export class ValidationController extends Controller {
    /**
     * Validate a project
     * @param projectUuid the projectId for the validation
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/')
    @OperationId('postValidate')
    async post(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() context?: ValidateProjectPayload['context'],
    ): Promise<ApiJobScheduledResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: {
                jobId: await validationService.validate(
                    req.user!,
                    projectUuid,
                    context,
                ),
            },
        };
    }

    /**
     * Get validation for a project
     * @param projectUuid the projectId for the validation
     * @param req express request
     * @param fromSettings boolean to know if this request is made from the settings page, for analytics
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('getValidate')
    async get(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() fromSettings?: boolean,
    ): Promise<ApiValidateResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await validationService.get(
                req.user!,
                projectUuid,
                fromSettings,
            ),
        };
    }
}
