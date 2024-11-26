import {
    ApiErrorPayload,
    ApiJobScheduledResponse,
    ApiValidateResponse,
    ApiValidationDismissResponse,
    getRequestMethod,
    LightdashRequestMethodHeader,
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
} from '@tsoa/runtime';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/rename')
@Response<ApiErrorPayload>('default', 'Error')
export class ValidationController extends BaseController {
    /**
     * Rename a model in a project
     * This will rename all references in content (charts/dashboards/scheduler filters) for a model (aka table name)
     *
     * @param projectUuid the projectId for the validation
     * @param req express request
     * @param body the projectUuid, oldModel, and newModel
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/model')
    @OperationId('ValidateProject')
    async post(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Body()
        body: { projectUuid: string; oldModel: string; newModel: string },
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
}
