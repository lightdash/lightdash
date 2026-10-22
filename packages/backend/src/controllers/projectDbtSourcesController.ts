import {
    ApiCreateProjectDbtSource,
    ApiErrorPayload,
    ApiProjectDbtSourceResponse,
    ApiProjectDbtSourcesResponse,
    ApiProjectDbtSourceWithConnectionResponse,
    ApiSuccessEmpty,
    ApiUpdateProjectDbtSource,
    assertRegisteredAccount,
    type AddSharedDbtSource,
    type DbtRepositorySummary,
    type PeerDbtSourceSummary,
    type UpdatePeerDbtSource,
    type UUID,
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
import { requireOAuthScopeOperation } from '../auth/oauthScopes/unchecked';
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
        @Path() projectUuid: UUID,
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
        @Path() projectUuid: UUID,
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

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/peers')
    @OperationId('ListProjectDbtPeers')
    async listProjectDbtPeers(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: PeerDbtSourceSummary[] }> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getPeerDbtSourcesService()
                .listPeers(req.account, projectUuid),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Patch('/peers/{sourceUuid}')
    @OperationId('UpdateProjectDbtPeer')
    async updateProjectDbtPeer(
        @Path() projectUuid: UUID,
        @Path() sourceUuid: UUID,
        @Body() body: UpdatePeerDbtSource,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getPeerDbtSourcesService()
            .updatePeer(req.account, projectUuid, sourceUuid, body);
        return { status: 'ok', results: undefined };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/shared')
    @OperationId('ListSharedDbtRepositories')
    async listSharedDbtRepositories(
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: DbtRepositorySummary[] }> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getPeerDbtSourcesService()
                .listShared(req.account, projectUuid),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Post('/shared')
    @SuccessResponse('201', 'Created')
    @OperationId('AddSharedDbtRepository')
    async addSharedDbtRepository(
        @Path() projectUuid: UUID,
        @Body() body: AddSharedDbtSource,
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: string }> {
        assertRegisteredAccount(req.account);
        this.setStatus(201);
        return {
            status: 'ok',
            results: await this.services
                .getPeerDbtSourcesService()
                .addShared(req.account, projectUuid, body),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @Patch('/repositories/{repositoryUuid}')
    @OperationId('ShareDbtRepository')
    async shareDbtRepository(
        @Path() projectUuid: UUID,
        @Path() repositoryUuid: UUID,
        @Body() body: { isShared: boolean },
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getPeerDbtSourcesService()
            .setShared(req.account, projectUuid, repositoryUuid, body.isShared);
        return { status: 'ok', results: undefined };
    }

    /**
     * Get a single dbt source including its connection, with credentials
     * stripped — used to pre-fill the edit form.
     * @summary Get dbt source
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        requireOAuthScopeOperation(
            'ProjectDbtSourcesController.getProjectDbtSource',
        ),
    ])
    @SuccessResponse('200', 'Success')
    @Get('/{projectDbtSourceUuid}')
    @OperationId('GetProjectDbtSource')
    async getProjectDbtSource(
        @Path() projectUuid: UUID,
        @Path() projectDbtSourceUuid: UUID,
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
        @Path() projectUuid: UUID,
        @Path() projectDbtSourceUuid: UUID,
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
        @Path() projectUuid: UUID,
        @Path() projectDbtSourceUuid: UUID,
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
