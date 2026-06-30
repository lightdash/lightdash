import {
    ApiCreateProjectDbtSource,
    ApiErrorPayload,
    ApiProjectDbtSourceResponse,
    ApiProjectDbtSourcesResponse,
    ApiSuccessEmpty,
    assertRegisteredAccount,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
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

@Route('/api/v1/projects/{projectUuid}/dbt-sources')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
export class ProjectDbtSourcesController extends BaseController {
    /**
     * List the dbt sources connected to a project (the primary source plus any
     * additional sources), without credentials.
     * @summary List dbt sources
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('ListProjectDbtSources')
    async listProjectDbtSources(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiProjectDbtSourcesResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const results = await this.services
            .getProjectDbtSourcesService()
            .getProjectDbtSources(req.account, projectUuid);
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Add an additional dbt source to a project.
     * @summary Add dbt source
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/')
    @OperationId('CreateProjectDbtSource')
    async createProjectDbtSource(
        @Path() projectUuid: string,
        @Body() body: ApiCreateProjectDbtSource,
        @Request() req: express.Request,
    ): Promise<ApiProjectDbtSourceResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(201);
        const results = await this.services
            .getProjectDbtSourcesService()
            .createProjectDbtSource(req.account, projectUuid, body);
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Remove an additional dbt source from a project. The primary source cannot
     * be removed.
     * @summary Remove dbt source
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/{projectDbtSourceUuid}')
    @OperationId('DeleteProjectDbtSource')
    async deleteProjectDbtSource(
        @Path() projectUuid: string,
        @Path() projectDbtSourceUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        await this.services
            .getProjectDbtSourcesService()
            .deleteProjectDbtSource(
                req.account,
                projectUuid,
                projectDbtSourceUuid,
            );
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
