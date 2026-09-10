import {
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
import { toSessionUser } from '../auth/account';
import { isAuthenticated, unauthorisedInDemo } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/org/analytics-project')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Analytics project')
export class AnalyticsProjectController extends BaseController {
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
                .getAnalyticsProjectService()
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
                .getAnalyticsProjectService()
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
            .getAnalyticsProjectService()
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
            .getAnalyticsProjectService()
            .delete(toSessionUser(req.account), projectUuid);
        return { status: 'ok', results: undefined };
    }
}
