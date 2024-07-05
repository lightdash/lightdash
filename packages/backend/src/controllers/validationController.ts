import {
    ApiErrorPayload,
    ApiJobScheduledResponse,
    ApiValidateResponse,
    ApiValidationDismissResponse,
    getRequestMethod,
    LightdashRequestMethodHeader,
    ValidationTarget,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Middlewares,
    OperationId,
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
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/validate')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
export class ValidationController extends BaseController {
    /**
     * Validate content inside a project. This will start a validation job and return the job id.
     *
     * Validation jobs scan all charts and dashboards inside a project to find any broken references
     * to metrics or dimensions that aren't available. Results are available after the job is completed.
     * @param projectUuid the projectId for the validation
     * @param req express request
     * @param body the compiled explores to validate against an existing project, this is used in the CLI to validate a project without creating a preview
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/')
    @OperationId('ValidateProject')
    async post(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Body()
        body: { explores?: any[]; validationTargets?: ValidationTarget[] }, // TODO: This should be (Explore| ExploreError)[] but using this type will not process metrics/dimensions
    ): Promise<ApiJobScheduledResponse> {
        this.setStatus(200);
        const context = getRequestMethod(
            req.header(LightdashRequestMethodHeader),
        );

        return {
            status: 'ok',
            results: {
                jobId: await this.services
                    .getValidationService()
                    .validate(
                        req.user!,
                        projectUuid,
                        context,
                        body.explores,
                        body.validationTargets,
                    ),
            },
        };
    }

    /**
     * Get validation results for a project. This will return the results of the latest validation job.
     * @param projectUuid the projectId for the validation
     * @param req express request
     * @param fromSettings boolean to know if this request is made from the settings page, for analytics
     * @param jobId optional jobId to get results for a specific job, used on CLI
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('GetLatestValidationResults')
    async get(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() fromSettings?: boolean,
        @Query() jobId?: string,
    ): Promise<ApiValidateResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getValidationService()
                .get(req.user!, projectUuid, fromSettings, jobId),
        };
    }

    /**
     * Deletes a single validation error.
     * @param validationId the projectId for the validation
     * @param req express request
     * @param fromSettings boolean to know if this request is made from the settings page, for analytics
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Delete('/{validationId}')
    @OperationId('DeleteValidationDismiss')
    async dismiss(
        @Path() projectUuid: string,
        @Path() validationId: number,
        @Request() req: express.Request,
    ): Promise<ApiValidationDismissResponse> {
        this.setStatus(200);
        await this.services
            .getValidationService()
            .delete(req.user!, validationId);
        return {
            status: 'ok',
        };
    }
}
