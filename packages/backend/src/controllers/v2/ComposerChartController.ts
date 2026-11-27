import {
    assertRegisteredAccount,
    QueryExecutionContext,
    type ApiComposerChartDashboardsResponse,
    type ApiComposerChartDetailsResponse,
    type ApiComposerChartParametersResponse,
    type ApiComposerChartResponse,
    type ApiComposerChartRunResponse,
    type ApiErrorPayload,
    type ApiSuccessEmpty,
    type ComposerChartRunRequest,
    type CreateComposerChart,
    type UpdateComposerChart,
    type UUID,
    type UuidOrSlug,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Deprecated,
    Extension,
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
import { getDeprecatedRouteMiddleware } from '../authentication';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../authentication/middlewares';
import { BaseController } from '../baseController';

@Route('/api/v2/projects/{projectUuid}/composer-charts')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Charts')
export class ComposerChartController extends BaseController {
    /**
     * Creates a composer chart: a stored pipeline and the chart drawn from its
     * terminal node. If you pass `dashboardUuid`, that dashboard owns the
     * chart and `spaceUuid` is ignored; otherwise the space in `spaceUuid`
     * owns it. Adds no tile; add one with the dashboard update. Requires the
     * composer-charts feature flag and permission to save charts on the owner.
     * @summary Create composer chart
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/')
    @OperationId('createComposerChart')
    async create(
        @Path() projectUuid: UUID,
        @Body() body: CreateComposerChart,
        @Request() req: express.Request,
    ): Promise<ApiComposerChartResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getComposerChartService()
            .create(req.account, projectUuid, body);
        this.setStatus(201);
        return { status: 'ok', results };
    }

    /**
     * Gets the current version of a composer chart, including its pipeline.
     * The response also includes the chart's space and the user who last
     * changed it. Takes the chart's UUID or slug. Anyone who can view charts
     * in the chart's dashboard or space can read it.
     * @summary Get composer chart
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{composerChartUuidOrSlug}')
    @OperationId('getComposerChart')
    async get(
        @Path() projectUuid: UUID,
        @Path() composerChartUuidOrSlug: UuidOrSlug,
        @Request() req: express.Request,
    ): Promise<ApiComposerChartDetailsResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getComposerChartService()
            .getWithDetails(req.account, projectUuid, composerChartUuidOrSlug);
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Renames a composer chart that a space owns, or changes its description.
     * Does not create a new version and keeps the slug. Omitted fields keep
     * their current value. Requires permission to save charts in the chart's
     * space. Returns 400 for a composer chart that a dashboard owns, because
     * that chart is edited through its dashboard.
     * @summary Update composer chart
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('/{composerChartUuid}')
    @OperationId('updateComposerChart')
    async update(
        @Path() projectUuid: UUID,
        @Path() composerChartUuid: UUID,
        @Body() body: UpdateComposerChart,
        @Request() req: express.Request,
    ): Promise<ApiComposerChartResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getComposerChartService()
            .update(req.account, projectUuid, composerChartUuid, body);
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Deletes a composer chart that a space owns. With soft delete on, the
     * server keeps the chart marked as deleted. With soft delete off, it
     * deletes the chart permanently. Dashboard tiles that show the chart stay and
     * show it as deleted. Requires permission to delete charts in the
     * chart's space. Returns 400 for a composer chart that a dashboard owns,
     * because deleting its tile deletes that chart.
     * @summary Delete composer chart
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/{composerChartUuid}')
    @OperationId('deleteComposerChart')
    async delete(
        @Path() projectUuid: UUID,
        @Path() composerChartUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getComposerChartService()
            .delete(req.account, projectUuid, composerChartUuid);
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }

    /**
     * Lists the dashboards whose latest version has a tile that shows the
     * composer chart. Leaves out dashboards the caller cannot view. Anyone
     * who can view the chart can read the list.
     * @summary List dashboards showing composer chart
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{composerChartUuid}/dashboards')
    @OperationId('getComposerChartDashboards')
    async getDashboards(
        @Path() projectUuid: UUID,
        @Path() composerChartUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiComposerChartDashboardsResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getComposerChartService()
            .getDashboardsShowing(req.account, projectUuid, composerChartUuid);
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Lists the parameters that a composer chart's nodes reference. Each
     * parameter includes its definition, from the project or from the
     * referencing node's model. Anyone who can view the chart can read them.
     * @summary Get composer chart parameters
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{composerChartUuid}/parameters')
    @OperationId('getComposerChartParameters')
    async getParameters(
        @Path() projectUuid: UUID,
        @Path() composerChartUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiComposerChartParametersResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getComposerChartService()
            .getParameters(req.account, projectUuid, composerChartUuid);
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Deprecated — use the v2 Execute dashboard composer chart endpoint instead.
     *
     * This endpoint was deprecated on 27 November 2026 and will be removed after 27 February 2027. It runs a composer chart shown on a dashboard tile. Execute dashboard composer chart takes the same request with composerChartUuid in the body.
     * @summary Run composer chart
     * @deprecated Use POST /api/v2/projects/{projectUuid}/query/dashboard-composer-chart instead
     */
    @Extension('x-mint', {
        content: `<Warning>
**This endpoint is deprecated and will be removed after 27 February 2027.**

Use [Execute dashboard composer chart](https://docs.lightdash.com/api-reference/v2/execute-dashboard-composer-chart), \`POST /api/v2/projects/{projectUuid}/query/dashboard-composer-chart\`, instead. It takes the same request with \`composerChartUuid\` in the body and returns the same response.
</Warning>`,
    })
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        getDeprecatedRouteMiddleware(new Date('2026-11-27'), {
            suffixMessage:
                'Use POST /api/v2/projects/{projectUuid}/query/dashboard-composer-chart instead.',
        }),
    ])
    @SuccessResponse('200', 'Success')
    @Post('/{composerChartUuid}/run')
    @OperationId('runComposerChart')
    @Deprecated()
    async run(
        @Path() projectUuid: UUID,
        @Path() composerChartUuid: UUID,
        @Body() body: ComposerChartRunRequest,
        @Request() req: express.Request,
    ): Promise<ApiComposerChartRunResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getComposerChartService()
            .run(
                req.account,
                projectUuid,
                composerChartUuid,
                body,
                QueryExecutionContext.DASHBOARD,
            );
        this.setStatus(200);
        return { status: 'ok', results };
    }
}
