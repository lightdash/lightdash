import {
    assertRegisteredAccount,
    type ApiDashboardParametersResponse,
    type ApiDashboardResponse,
    type ApiDashboardTileParameterReferencesResponse,
    type ApiErrorPayload,
    type ApiGetComments,
    type ApiSuccessEmpty,
    type DashboardTileParameterReferencesRequest,
    type UpdateDashboard,
    type UuidOrSlug,
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
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../../auth/account';
import { requireOAuthScopeOperation } from '../../auth/oauthScopes/unchecked';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../authentication/middlewares';
import { BaseController } from '../baseController';

@Route('/api/v2/projects/{projectUuid}/dashboards')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Dashboards')
export class ProjectDashboardControllerV2 extends BaseController {
    /**
     * Get a dashboard by uuid or slug within a project.
     * Pass includeUnpublishedDraft=true to see your own unpublished draft
     * applied on top; omitted, the published dashboard is returned. Rendered
     * and machine-driven reads must omit it so a draft never reaches an
     * export or a scheduled delivery.
     * @summary Get dashboard
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{dashboardUuidOrSlug}')
    @OperationId('getProjectDashboard')
    async get(
        @Path() projectUuid: string,
        @Path() dashboardUuidOrSlug: string,
        @Request() req: express.Request,
        @Query() includeUnpublishedDraft?: boolean,
    ): Promise<ApiDashboardResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const dashboardService = this.services.getDashboardService();
        const user = toSessionUser(req.account);
        return {
            status: 'ok',
            results: await (includeUnpublishedDraft === true
                ? dashboardService.getByIdOrSlugForViewer(
                      user,
                      dashboardUuidOrSlug,
                      { projectUuid },
                  )
                : dashboardService.getByIdOrSlug(user, dashboardUuidOrSlug, {
                      projectUuid,
                  })),
        };
    }

    /**
     * List the parameters each dashboard tile uses, read from its saved query
     * without running it. Tiles that can't be loaded or viewed report an error.
     * The dashboard calls this while it is edited; in view mode each tile
     * reports its parameters with its own query results.
     *
     * Embed tokens can call this with the `Lightdash-Embed-Token` header. The
     * token must embed a dashboard: only that dashboard's tiles are listed,
     * with the charts saved on it (request chart uuids are ignored), and a
     * tile not on it reports an error.
     * @summary Get tile parameter references
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/tile-parameter-references')
    @OperationId('getDashboardTileParameterReferences')
    async getTileParameterReferences(
        @Path() projectUuid: string,
        @Body() body: DashboardTileParameterReferencesRequest,
        @Request() req: express.Request,
    ): Promise<ApiDashboardTileParameterReferencesResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getDashboardService()
                .getTileParameterReferences(
                    req.account!,
                    projectUuid,
                    body.tiles,
                ),
        };
    }

    /**
     * List the parameters a dashboard's tiles use: each one's definition
     * (label, type, options, default), its current value (saved on the
     * dashboard, else the default), whether it is defined in the project or a
     * model, and which tiles use it. Read from the saved queries without
     * running them; tiles the user can't view are left out.
     *
     * Run the dashboard's charts with other values by passing `parameters` to
     * the v2 query endpoints.
     * @summary Get dashboard parameters
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{dashboardUuidOrSlug}/parameters')
    @OperationId('getProjectDashboardParameters')
    async getParameters(
        @Path() projectUuid: string,
        @Path() dashboardUuidOrSlug: UuidOrSlug,
        @Request() req: express.Request,
    ): Promise<ApiDashboardParametersResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getDashboardService()
                .getDashboardParameters(
                    req.account,
                    projectUuid,
                    dashboardUuidOrSlug,
                ),
        };
    }

    /**
     * Update a dashboard by uuid or slug within a project
     * @summary Update dashboard
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
        requireOAuthScopeOperation('ProjectDashboardControllerV2.update'),
    ])
    @SuccessResponse('200', 'Success')
    @Patch('/{dashboardUuidOrSlug}')
    @OperationId('updateProjectDashboard')
    async update(
        @Path() projectUuid: string,
        @Path() dashboardUuidOrSlug: string,
        @Body() body: UpdateDashboard,
        @Request() req: express.Request,
    ): Promise<ApiDashboardResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getDashboardService()
                .updateFromAccount(req.account!, dashboardUuidOrSlug, body, {
                    projectUuid,
                }),
        };
    }

    /**
     * Delete a dashboard by uuid or slug within a project
     * @summary Delete dashboard
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/{dashboardUuidOrSlug}')
    @OperationId('deleteProjectDashboard')
    async delete(
        @Path() projectUuid: string,
        @Path() dashboardUuidOrSlug: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getDashboardService()
            .delete(toSessionUser(req.account), dashboardUuidOrSlug, {
                projectUuid,
            });
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Gets all comments for a dashboard within a project
     * @summary Get comments
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{dashboardUuidOrSlug}/comments')
    @OperationId('getProjectDashboardComments')
    async getComments(
        @Path() projectUuid: string,
        @Path() dashboardUuidOrSlug: string,
        @Request() req: express.Request,
        @Query() resolved?: boolean,
    ): Promise<ApiGetComments> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getCommentService()
                .findCommentsForDashboard(
                    toSessionUser(req.account),
                    dashboardUuidOrSlug,
                    {
                        projectUuid,
                        resolved,
                    },
                ),
        };
    }
}
