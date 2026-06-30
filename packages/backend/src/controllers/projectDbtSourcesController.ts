import {
    ApiCreateProjectDbtSource,
    ApiErrorPayload,
    ApiProjectDbtSourceResponse,
    ApiProjectDbtSourcesResponse,
    ApiProjectDbtSourceWithConnectionResponse,
    ApiSuccessEmpty,
    ApiUpdateProjectDbtSource,
    assertRegisteredAccount,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Middlewares,
    OperationId,
    Patch,
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
     * Get a single dbt source including its connection, with credentials
     * stripped — used to pre-fill the edit form.
     * @summary Get dbt source
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{projectDbtSourceUuid}')
    @OperationId('GetProjectDbtSource')
    async getProjectDbtSource(
        @Path() projectUuid: string,
        @Path() projectDbtSourceUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiProjectDbtSourceWithConnectionResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const results = await this.services
            .getProjectDbtSourcesService()
            .getProjectDbtSource(
                req.account,
                projectUuid,
                projectDbtSourceUuid,
            );
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Update an additional dbt source's name or connection.
     * @summary Update dbt source
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('/{projectDbtSourceUuid}')
    @OperationId('UpdateProjectDbtSource')
    async updateProjectDbtSource(
        @Path() projectUuid: string,
        @Path() projectDbtSourceUuid: string,
        @Body() body: ApiUpdateProjectDbtSource,
        @Request() req: express.Request,
    ): Promise<ApiProjectDbtSourceResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const results = await this.services
            .getProjectDbtSourcesService()
            .updateProjectDbtSource(
                req.account,
                projectUuid,
                projectDbtSourceUuid,
                body,
            );
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
