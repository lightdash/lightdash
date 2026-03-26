import {
    ApiErrorPayload,
    type ApiGenerateAppResponse,
    type ApiPreviewTokenResponse,
} from '@lightdash/common';
import {
    Body,
    Get,
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
import { AppGenerateService } from '../services/AppGenerateService/AppGenerateService';

type GenerateAppRequestBody = {
    prompt: string;
};

@Route('/api/v1/ee/projects/{projectUuid}/apps')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class AppGenerateController extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/')
    @OperationId('generateApp')
    async generateApp(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: GenerateAppRequestBody,
    ): Promise<ApiGenerateAppResponse> {
        this.setStatus(200);
        const result = await this.getAppGenerateService().generateApp(
            req.user!,
            projectUuid,
            body.prompt,
        );
        return {
            status: 'ok',
            results: result,
        };
    }

    /**
     * Mints a short-lived JWT for accessing an app version preview in an iframe.
     * @summary Get preview token
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{appUuid}/versions/{versionUuid}/preview-token')
    @OperationId('getAppPreviewToken')
    async getPreviewToken(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
        @Path() versionUuid: string,
    ): Promise<ApiPreviewTokenResponse> {
        const token = this.getAppGenerateService().getPreviewToken(
            req.user!,
            projectUuid,
            appUuid,
            versionUuid,
        );
        return {
            status: 'ok',
            results: { token },
        };
    }

    protected getAppGenerateService() {
        return this.services.getAppGenerateService<AppGenerateService>();
    }
}
