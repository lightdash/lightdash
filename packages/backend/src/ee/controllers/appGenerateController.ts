import { ApiErrorPayload } from '@lightdash/common';
import {
    Body,
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

export type ApiGenerateAppResponse = {
    status: 'ok';
    results: {
        appUuid: string;
        versionUuid: string;
    };
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

    protected getAppGenerateService() {
        return this.services.getAppGenerateService<AppGenerateService>();
    }
}
