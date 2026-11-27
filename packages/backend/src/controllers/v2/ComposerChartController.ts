import {
    assertRegisteredAccount,
    QueryExecutionContext,
    type ApiComposerChartResponse,
    type ApiComposerChartRunResponse,
    type ApiErrorPayload,
    type ComposerChartRunRequest,
    type CreateComposerChart,
    type UUID,
} from '@lightdash/common';
import {
    Body,
    Deprecated,
    Extension,
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
     * Gets a composer chart's current version, pipeline included. Anyone who
     * can view charts in its owning dashboard or space can read it.
     * @summary Get composer chart
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{composerChartUuid}')
    @OperationId('getComposerChart')
    async get(
        @Path() projectUuid: UUID,
        @Path() composerChartUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiComposerChartResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getComposerChartService()
            .get(req.account, projectUuid, composerChartUuid);
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Deprecated — use the v2 Execute dashboard composer chart endpoint instead.
     *
     * This endpoint was deprecated on 27 November 2026 and will be removed after 27 February 2027. It runs a composer chart where a dashboard tile shows it; Execute dashboard composer chart takes the same request with composerChartUuid in the body.
     * @summary Run composer chart
     * @deprecated Use POST /api/v2/projects/{projectUuid}/query/dashboard-composer-chart instead
     */
    @Extension('x-mint', {
        content: `<Warning>
**This endpoint is deprecated and will be removed after 27 February 2027.**

Use [Execute dashboard composer chart](https://docs.lightdash.com/api-reference/v2/execute-dashboard-composer-chart) (\`POST /api/v2/projects/{projectUuid}/query/dashboard-composer-chart\`) instead: the same request with \`composerChartUuid\` in the body, and the same response.
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
