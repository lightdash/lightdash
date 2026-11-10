import {
    AnalyticsHistoryBackfillStatus,
    AnalyticsProjectStatus,
    ApiErrorPayload,
    ApiSuccess,
    ApiSuccessEmpty,
    assertRegisteredAccount,
    EnsureAnalyticsProjectResult,
    UUID,
} from '@lightdash/common';
import {
    Delete,
    Get,
    Middlewares,
    OperationId,
    Path,
    Post,
    Request,
    Response,
    Route,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../../auth/account';
import {
    isAuthenticated,
    unauthorisedInDemo,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { type AnalyticsProjectService } from '../services/AnalyticsProjectService/AnalyticsProjectService';

@Route('/api/v1/org/analytics-project')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Analytics project')
export class AnalyticsProjectController extends BaseController {
    /** @summary Check Analytics history backfill completion */
    @Get('/backfill')
    @Middlewares([isAuthenticated])
    @OperationId('GetAnalyticsHistoryBackfillStatus')
    async getBackfillStatus(
        @Request() req: express.Request,
    ): Promise<ApiSuccess<AnalyticsHistoryBackfillStatus>> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAnalyticsProjectService<AnalyticsProjectService>()
                .getBackfillStatus(toSessionUser(req.account)),
        };
    }

    /** @summary Backfill retained Analytics history */
    @Post('/backfill')
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @OperationId('BackfillAnalyticsHistory')
    async backfill(@Request() req: express.Request): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getAnalyticsProjectService<AnalyticsProjectService>()
            .backfill(toSessionUser(req.account));
        return { status: 'ok', results: undefined };
    }

    /** @summary Get internal analytics project status */
    @Get()
    @Middlewares([isAuthenticated])
    @OperationId('GetAnalyticsProjectStatus')
    async getAnalyticsProjectStatus(
        @Request() req: express.Request,
    ): Promise<ApiSuccess<AnalyticsProjectStatus>> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAnalyticsProjectService<AnalyticsProjectService>()
                .getStatus(toSessionUser(req.account)),
        };
    }

    /** @summary Ensure internal analytics project */
    @Post()
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @OperationId('EnsureAnalyticsProject')
    async ensure(
        @Request() req: express.Request,
    ): Promise<ApiSuccess<EnsureAnalyticsProjectResult>> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getAnalyticsProjectService<AnalyticsProjectService>()
                .ensure(toSessionUser(req.account)),
        };
    }

    /** @summary Install sample charts and dashboard in the internal analytics project */
    @Post('/sample-content')
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @OperationId('InstallAnalyticsSampleContent')
    async installSampleContent(
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getAnalyticsProjectService<AnalyticsProjectService>()
            .installSampleContent(toSessionUser(req.account));
        return { status: 'ok', results: undefined };
    }

    /** @summary Delete the organization's internal analytics project */
    @Delete('/{projectUuid}')
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @OperationId('DeleteAnalyticsProject')
    async delete(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getAnalyticsProjectService<AnalyticsProjectService>()
            .delete(toSessionUser(req.account), projectUuid);
        return { status: 'ok', results: undefined };
    }
}
