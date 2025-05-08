import {
    ApiErrorPayload,
    ApiJobScheduledResponse,
    ApiRenameBody,
    getRequestMethod,
    LightdashRequestMethodHeader,
} from '@lightdash/common';
import {
    Body,
    Middlewares,
    OperationId,
    Path,
    Post,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/rename')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
export class RenameController extends BaseController {
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/')
    @OperationId('rename')
    async post(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Body() body: ApiRenameBody,
    ): Promise<ApiJobScheduledResponse> {
        this.setStatus(200);
        const context = getRequestMethod(
            req.header(LightdashRequestMethodHeader),
        );

        const scheduledJob = await this.services
            .getRenameService()
            .scheduleRenameResources({
                user: req.user!,
                projectUuid,
                context,
                ...body,
            });

        return {
            status: 'ok',
            results: scheduledJob,
        };
    }
}
