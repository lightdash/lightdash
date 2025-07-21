import {
    ApiErrorPayload,
    ApiSuccess,
    type ApiGetProjectParametersResults,
} from '@lightdash/common';
import {
    Get,
    Middlewares,
    OperationId,
    Path,
    Query,
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
    @OperationId('getProjectParameters')
    async getParameters(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() names?: string[],
    ): Promise<ApiSuccess<ApiGetProjectParametersResults>> {
        const parameters = await this.services
            .getProjectParametersService()
            .findProjectParameters(projectUuid, names);

        const results: ApiGetProjectParametersResults =
            parameters.reduce<ApiGetProjectParametersResults>(
                (acc, parameter) => {
                    acc[parameter.name] = parameter.config;
                    return acc;
                },
                {},
            );

        return {
            status: 'ok',
            results,
        };
    }
}
