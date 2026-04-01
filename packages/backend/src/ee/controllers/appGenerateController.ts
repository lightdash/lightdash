import {
    ApiErrorPayload,
    type ApiCancelAppVersionResponse,
    type ApiGenerateAppResponse,
    type ApiGetAppResponse,
    type ApiPreviewTokenResponse,
    type ApiUpdateAppRequest,
    type ApiUpdateAppResponse,
} from '@lightdash/common';
import {
    Body,
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Patch,
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
     * Get an app with its version history, paginated backwards.
     * @summary Get app with versions
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{appUuid}')
    @OperationId('getApp')
    async getApp(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
        @Query() beforeVersion?: number,
        @Query() limit?: number,
    ): Promise<ApiGetAppResponse> {
        const result = await this.getAppGenerateService().getAppVersions(
            req.user!,
            projectUuid,
            appUuid,
            { beforeVersion, limit },
        );
        return {
            status: 'ok',
            results: result,
        };
    }

    /**
     * Create a new version of an existing app by iterating on it with a follow-up prompt.
     * Resumes the paused sandbox if available, otherwise creates a new one and restores source.
     * @summary Iterate on an existing app
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{appUuid}/versions')
    @OperationId('iterateApp')
    async iterateApp(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
        @Body() body: GenerateAppRequestBody,
    ): Promise<ApiGenerateAppResponse> {
        this.setStatus(200);
        const result = await this.getAppGenerateService().iterateApp(
            req.user!,
            projectUuid,
            appUuid,
            body.prompt,
        );
        return {
            status: 'ok',
            results: result,
        };
    }

    /**
     * Cancel a building version, killing the sandbox and marking it as cancelled.
     * @summary Cancel app version
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{appUuid}/versions/{version}/cancel')
    @OperationId('cancelAppVersion')
    async cancelAppVersion(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
        @Path() version: number,
    ): Promise<ApiCancelAppVersionResponse> {
        await this.getAppGenerateService().cancelVersion(
            req.user!,
            projectUuid,
            appUuid,
            version,
        );
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Update an app's name and/or description.
     * @summary Update app
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Patch('/{appUuid}')
    @OperationId('updateApp')
    async updateApp(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
        @Body() body: ApiUpdateAppRequest,
    ): Promise<ApiUpdateAppResponse> {
        const result = await this.getAppGenerateService().updateApp(
            req.user!,
            projectUuid,
            appUuid,
            body,
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
    @Get('/{appUuid}/versions/{version}/preview-token')
    @OperationId('getAppPreviewToken')
    async getPreviewToken(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
        @Path() version: number,
    ): Promise<ApiPreviewTokenResponse> {
        const token = this.getAppGenerateService().getPreviewToken(
            req.user!,
            projectUuid,
            appUuid,
            version,
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
