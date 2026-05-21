import {
    ApiAiDashboardSummaryResponse,
    ApiAiGenerateChartMetadataResponse,
    ApiAiGenerateCustomVizResponse,
    ApiAiGenerateFormulaTableCalculationResponse,
    ApiAiGenerateTableCalculationResponse,
    ApiAiGenerateTooltipResponse,
    ApiAiGetDashboardSummaryResponse,
    ApiErrorPayload,
    assertRegisteredAccount,
    DashboardSummary,
    GenerateChartMetadataRequest,
    GenerateFormulaTableCalculationRequest,
    GenerateTableCalculationRequest,
    GenerateTooltipRequest,
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
import { toSessionUser } from '../../auth/account';
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
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiService().createDashboardSummary(
                toSessionUser(req.account),
                projectUuid,
                dashboardUuid,
                body,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/dashboard/:dashboardUuidOrSlug/summary')
    @OperationId('getDashboardSummary')
    async getDashboardSummary(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() dashboardUuidOrSlug: string,
    ): Promise<ApiAiGetDashboardSummaryResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiService().getDashboardSummary(
                toSessionUser(req.account),
                projectUuid,
                dashboardUuidOrSlug,
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
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiService().generateCustomViz({
                user: toSessionUser(req.account),
                projectUuid,
                ...body,
            }),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/chart/generate-metadata')
    @OperationId('generateChartMetadata')
    async generateChartMetadata(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: GenerateChartMetadataRequest,
    ): Promise<ApiAiGenerateChartMetadataResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiService().generateChartMetadata(
                toSessionUser(req.account),
                projectUuid,
                body,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/table-calculation/generate')
    @OperationId('generateTableCalculation')
    async generateTableCalculation(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: GenerateTableCalculationRequest,
    ): Promise<ApiAiGenerateTableCalculationResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiService().generateTableCalculation(
                toSessionUser(req.account),
                projectUuid,
                body,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/formula-table-calculation/generate')
    @OperationId('generateFormulaTableCalculation')
    async generateFormulaTableCalculation(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: GenerateFormulaTableCalculationRequest,
    ): Promise<ApiAiGenerateFormulaTableCalculationResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiService().generateFormulaTableCalculation(
                toSessionUser(req.account),
                projectUuid,
                body,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/tooltip/generate')
    @OperationId('generateTooltip')
    async generateTooltip(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: GenerateTooltipRequest,
    ): Promise<ApiAiGenerateTooltipResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiService().generateTooltip(
                toSessionUser(req.account),
                projectUuid,
                body,
            ),
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
