import {
    ApiErrorPayload,
    ApiSuccess,
    type ApiGetParametersResults,
} from '@lightdash/common';
import {
    Get,
    Middlewares,
    OperationId,
    Path,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { allowApiKeyAuthentication, isAuthenticated } from '../authentication';
import { BaseController } from '../baseController';

@Route('/api/v2/projects/{projectUuid}/parameters')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Parameters')
export class ParametersController extends BaseController {
    // eslint-disable-next-line class-methods-use-this
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('getParameters')
    async getParameters(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccess<ApiGetParametersResults>> {
        const parameters: ApiGetParametersResults = {
            my_parameter: {
                options: ['value1', 'value2'],
            },
        };
        return {
            status: 'ok',
            results: parameters,
        };
    }
}
