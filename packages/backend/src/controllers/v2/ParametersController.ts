import {
    ApiErrorPayload,
    ApiSuccess,
    type ApiGetProjectParametersResults,
    type LightdashProjectConfig,
} from '@lightdash/common';
import {
    Body,
    Get,
    Middlewares,
    OperationId,
    Path,
    Put,
    Query,
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
} from '../authentication';
import { BaseController } from '../baseController';

@Route('/api/v2/projects/{projectUuid}/parameters')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Parameters')
export class ParametersController extends BaseController {
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

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Put('/')
    @OperationId('replaceProjectParameters')
    async replaceParameters(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Body() parameters: LightdashProjectConfig['parameters'],
    ): Promise<ApiSuccess<undefined>> {
        await this.services.getProjectService().replaceProjectParameters({
            user: req.user!,
            projectUuid,
            parameters,
        });

        return {
            status: 'ok',
            results: undefined,
        };
    }
}
