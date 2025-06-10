import {
    ApiAiDashboardSummaryResponse,
    ApiAiGenerateCustomVizResponse,
    ApiAiGetDashboardSummaryResponse,
    ApiErrorPayload,
    DashboardSummary,
    ItemsMap,
} from '@lightdash/common';
import {
    Body,
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Path,
    Post,
    Request,
    Response,
    Route,
    SuccessResponse,
} from '@tsoa/runtime';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { AiService } from '../services/AiService/AiService';

@Route('/api/v1/ai/:projectUuid')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class AiController extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/dashboard/:dashboardUuid/summary')
    @OperationId('createDashboardSummary')
    async createDashboardSummary(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() dashboardUuid: string,
        @Body() body: Pick<DashboardSummary, 'context' | 'tone' | 'audiences'>,
    ): Promise<ApiAiDashboardSummaryResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiService().createDashboardSummary(
                req.user!,
                projectUuid,
                dashboardUuid,
                body,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/dashboard/:dashboardUuid/summary')
    @OperationId('getDashboardSummary')
    async getDashboardSummary(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() dashboardUuid: string,
    ): Promise<ApiAiGetDashboardSummaryResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiService().getDashboardSummary(
                req.user!,
                projectUuid,
                dashboardUuid,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/custom-viz')
    @OperationId('generateCustomViz')
    async generateCustomViz(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body()
        body: {
            prompt: string;
            itemsMap: ItemsMap;
            sampleResults: {
                [k: string]: unknown;
            }[];
            currentVizConfig: string;
        },
    ): Promise<ApiAiGenerateCustomVizResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiService().generateCustomViz({
                user: req.user!,
                projectUuid,
                ...body,
            }),
        };
    }

    /**
     * Convenience method to access the ai service without having
     * to specify an interface type.
     */
    protected getAiService() {
        return this.services.getAiService<AiService>();
    }
}
