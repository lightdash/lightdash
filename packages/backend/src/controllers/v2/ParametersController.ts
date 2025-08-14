import {
    ApiErrorPayload,
    ApiSuccess,
    type ApiGetProjectParametersListResults,
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
import type { DbProjectParameter } from '../../database/entities/projectParameters';
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
    /**
     * Get a paginated list of project parameters with search and sorting capabilities.
     * @summary List project parameters
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/list')
    @OperationId('getProjectParametersList')
    async getParametersList(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() search?: string,
        @Query() sortBy?: 'name' | 'created_at',
        @Query() sortOrder?: 'asc' | 'desc',
        @Query() page?: number,
        @Query() pageSize?: number,
    ): Promise<ApiSuccess<ApiGetProjectParametersListResults>> {
        const paginateArgs =
            page !== undefined && pageSize !== undefined
                ? { page, pageSize }
                : undefined;

        const parameters = await this.services
            .getProjectParametersService()
            .findProjectParametersPaginated(
                projectUuid,
                { search, sortBy, sortOrder },
                paginateArgs,
            );

        const results: ApiGetProjectParametersListResults = {
            data: parameters.data.map((param: DbProjectParameter) => ({
                name: param.name,
                label: param.config.label,
                description: param.config.description,
                default: param.config.default,
                createdAt: param.created_at,
            })),
            pagination: parameters.pagination,
        };

        return {
            status: 'ok',
            results,
        };
    }

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
