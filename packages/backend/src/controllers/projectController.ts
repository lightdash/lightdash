import {
    ApiCalculateTotalResponse,
    ApiChartListResponse,
    ApiChartSummaryListResponse,
    ApiErrorPayload,
    ApiGetProjectGroupAccesses,
    ApiGetProjectMemberResponse,
    ApiProjectAccessListResponse,
    ApiProjectResponse,
    ApiSpaceSummaryListResponse,
    ApiSqlQueryResults,
    ApiSuccessEmpty,
    CalculateTotalFromQuery,
    CreateProjectMember,
    DbtExposure,
    UpdateMetadata,
    UpdateProjectMember,
    UserWarehouseCredentials,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Hidden,
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

@Route('/api/v1/projects')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
export class ProjectController extends BaseController {
    /**
     * Get a project of an organiztion
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{projectUuid}')
    @OperationId('GetProject')
    async getProject(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiProjectResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getProjectService()
                .getProject(projectUuid, req.user!),
        };
    }

    /**
     * List all charts in a project
     * @param projectUuid The uuid of the project to get charts for
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{projectUuid}/charts')
    @OperationId('ListChartsInProject')
    async getChartsInProject(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiChartListResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getProjectService()
                .getCharts(req.user!, projectUuid),
        };
    }

    /**
     * List all charts summaries in a project
     * @param projectUuid The uuid of the project to get charts for
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{projectUuid}/chart-summaries')
    @OperationId('ListChartSummariesInProject')
    async getChartSummariesInProject(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiChartSummaryListResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getProjectService()
                .getChartSummaries(req.user!, projectUuid),
        };
    }

    /**
     * List all spaces in a project
     * @param projectUuid The uuid of the project to get spaces for
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{projectUuid}/spaces')
    @OperationId('ListSpacesInProject')
    async getSpacesInProject(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSpaceSummaryListResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getProjectService()
                .getSpaces(req.user!, projectUuid),
        };
    }

    /**
     * Get access list for a project. This is a list of users that have been explictly granted access to the project.
     * There may be other users that have access to the project via their organization membership.
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{projectUuid}/access')
    @OperationId('GetProjectAccessList')
    @Tags('Roles & Permissions')
    async getProjectAccessList(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiProjectAccessListResponse> {
        this.setStatus(200);
        const results = await this.services
            .getProjectService()
            .getProjectAccess(req.user!, projectUuid);
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Get a project explicit member's access.
     * There may be users that have access to the project via their organization membership.
     *
     * NOTE:
     * We don't use the API on the frontend. Instead, we can call the API
     * so that we make sure of the user's access to the project.
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{projectUuid}/user/{userUuid}')
    @OperationId('GetProjectMemberAccess')
    @Tags('Roles & Permissions')
    async getProjectMember(
        @Path() projectUuid: string,
        @Path() userUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiGetProjectMemberResponse> {
        const results = await this.services
            .getProjectService()
            .getProjectMemberAccess(req.user!, projectUuid, userUuid);
        this.setStatus(200);
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Grant a user access to a project
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('{projectUuid}/access')
    @OperationId('GrantProjectAccessToUser')
    @Tags('Roles & Permissions')
    async grantProjectAccessToUser(
        @Path() projectUuid: string,
        @Body() body: CreateProjectMember,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);
        await this.services
            .getProjectService()
            .createProjectAccess(req.user!, projectUuid, body);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Update a user's access to a project
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('{projectUuid}/access/{userUuid}')
    @OperationId('UpdateProjectAccessForUser')
    @Tags('Roles & Permissions')
    async updateProjectAccessForUser(
        @Path() projectUuid: string,
        @Path() userUuid: string,
        @Body() body: UpdateProjectMember,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);
        await this.services
            .getProjectService()
            .updateProjectAccess(req.user!, projectUuid, userUuid, body);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Remove a user's access to a project
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('{projectUuid}/access/{userUuid}')
    @OperationId('RevokeProjectAccessForUser')
    @Tags('Roles & Permissions')
    async revokeProjectAccessForUser(
        @Path() projectUuid: string,
        @Path() userUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);
        await this.services
            .getProjectService()
            .deleteProjectAccess(req.user!, projectUuid, userUuid);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * List group access for projects
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{projectUuid}/groupAccesses')
    @OperationId('GetProjectGroupAccesses')
    async getProjectGroupAccesses(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiGetProjectGroupAccesses> {
        this.setStatus(200);
        const results = await this.services
            .getProjectService()
            .getProjectGroupAccesses(req.user!, projectUuid);
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Run a raw sql query against the project's warehouse connection
     * @param projectUuid The uuid of the project to run the query against
     * @param body The query to run
     * @param req express request
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('{projectUuid}/sqlQuery')
    @OperationId('RunSqlQuery')
    @Tags('Exploring')
    async runSqlQuery(
        @Path() projectUuid: string,
        @Body() body: { sql: string },
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: ApiSqlQueryResults }> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getProjectService()
                .runSqlQuery(req.user!, projectUuid, body.sql),
        };
    }

    /**
     * Calculate all metric totals from a metricQuery
     * @param projectUuid The uuid of the project to get charts for
     * @param body The metric query to calculate totals for
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('{projectUuid}/calculate-total')
    @OperationId('CalculateTotalFromQuery')
    async CalculateTotalFromQuery(
        @Path() projectUuid: string,
        @Body() body: CalculateTotalFromQuery,
        @Request() req: express.Request,
    ): Promise<ApiCalculateTotalResponse> {
        this.setStatus(200);
        const totalResult = await this.services
            .getProjectService()
            .calculateTotalFromQuery(req.user!, projectUuid, body);
        return {
            status: 'ok',
            results: totalResult,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{projectUuid}/dbt-exposures')
    @OperationId('GetDbtExposures')
    @Hidden()
    async GetDbtExposures(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: Record<string, DbtExposure> }> {
        this.setStatus(200);
        const exposures = await this.services
            .getProjectService()
            .getDbtExposures(req.user!, projectUuid);
        return {
            status: 'ok',
            results: exposures,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{projectUuid}/user-credentials')
    @OperationId('getUserWarehouseCredentialsPreference')
    async getUserWarehouseCredentialsPreference(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<{
        status: 'ok';
        results: UserWarehouseCredentials | undefined;
    }> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getProjectService()
                .getProjectCredentialsPreference(req.user!, projectUuid),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Patch('{projectUuid}/user-credentials/{userWarehouseCredentialsUuid}')
    @OperationId('updateUserWarehouseCredentialsPreference')
    async updateUserWarehouseCredentialsPreference(
        @Path() projectUuid: string,
        @Path() userWarehouseCredentialsUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);
        await this.services
            .getProjectService()
            .upsertProjectCredentialsPreference(
                req.user!,
                projectUuid,
                userWarehouseCredentialsUuid,
            );
        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{projectUuid}/custom-metrics')
    @OperationId('getCustomMetrics')
    async getCustomMetrics(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<{
        status: 'ok';
        results: {
            name: string;
            label: string;
            modelName: string;
            yml: string;
            chartLabel: string;
            chartUrl: string;
        }[];
    }> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getProjectService()
                .getCustomMetrics(req.user!, projectUuid),
        };
    }

    /**
     * Update project metadata like upstreamProjectUuid
     * not for updating warehouse or credentials
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('{projectUuid}/metadata')
    @OperationId('updateProjectMetadata')
    async updateProjectMetadata(
        @Path() projectUuid: string,
        @Path() userUuid: string,
        @Body() body: UpdateMetadata,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);
        await this.services
            .getProjectService()
            .updateMetadata(req.user!, projectUuid, body);
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
