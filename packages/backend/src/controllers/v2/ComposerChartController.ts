import {
    assertRegisteredAccount,
    type ApiComposerChartResponse,
    type ApiErrorPayload,
    type CreateComposerChart,
    type UUID,
} from '@lightdash/common';
import {
    Body,
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
} from '../authentication/middlewares';
import { BaseController } from '../baseController';

@Route('/api/v2/projects/{projectUuid}/composer-charts')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Charts')
export class ComposerChartController extends BaseController {
    /**
     * Creates a composer chart owned by a dashboard: a stored pipeline and the
     * chart drawn from its terminal node. Adds no tile; add one with the
     * dashboard update. Requires the composer-charts feature flag.
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
     * can view the owning dashboard can read it.
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
}
