import {
    AnyType,
    ApiChartSummaryListResponse,
    ApiCompiledQueryResults,
    ApiErrorPayload,
    ApiExploreResults,
    ApiExploresResults,
    ApiSetExploresResponse,
    assertRegisteredAccount,
    LightdashCliVersionHeader,
    MetricQuery,
    type ApiFormulaValidationResults,
    type ApiPreAggregateCheckResponse,
    type ParametersValuesMap,
    type PivotConfiguration,
} from '@lightdash/common';
import {
    Body,
    Get,
    Middlewares,
    OperationId,
    Path,
    Post,
    Put,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../auth/account';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/explores')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
export class ExploreController extends BaseController {
    /**
     * Set explores for a project
     * @summary Set explores
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Put('/')
    @OperationId('SetExplores')
    async SetExplores(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Body() body: AnyType[], // tsoa doesn't seem to work with explores from CLI
    ): Promise<ApiSetExploresResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const results = await this.services
            .getProjectService()
            .setExplores(
                toSessionUser(req.account),
                projectUuid,
                body,
                req.header(LightdashCliVersionHeader),
            );

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Get all explores for a project
     * @summary List explores
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('GetExplores')
    async GetExplores(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: ApiExploresResults }> {
        this.setStatus(200);
        const results: ApiExploresResults = await this.services
            .getProjectService()
            .getAllExploresSummary(
                req.account!,
                projectUuid,
                req.query.filtered === 'true',
                true,
                req.query.includePreAggregates === 'true',
            );

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Get a specific explore
     * @summary Get explore
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{exploreId}')
    @OperationId('GetExplore')
    async GetExplore(
        @Path() exploreId: string,

        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: ApiExploreResults }> {
        this.setStatus(200);
        const results = await this.services
            .getProjectService()
            .getExplore(req.account!, projectUuid, exploreId, undefined, false);

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Compile a metric query for an explore
     * @summary Compile query
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('{exploreId}/compileQuery')
    @OperationId('CompileQuery')
    async CompileQuery(
        @Path() exploreId: string,
        @Path() projectUuid: string,
        @Request() req: express.Request,
        // ! TODO: we need to fix this type
        @Body()
        body: MetricQuery & {
            parameters?: ParametersValuesMap;
            pivotConfiguration?: PivotConfiguration;
            usePreAggregateCache?: boolean;
        },
    ): Promise<{ status: 'ok'; results: ApiCompiledQueryResults }> {
        this.setStatus(200);

        const { parameterReferences, query, pivotQuery } = await this.services
            .getProjectService()
            .compileQuery({
                account: req.account!,
                body,
                projectUuid,
                exploreName: exploreId,
                usePreAggregateCache: body.usePreAggregateCache,
            });

        return {
            status: 'ok',
            results: {
                query,
                parameterReferences,
                ...(pivotQuery && { pivotQuery }),
            },
        };
    }

    /**
     * Check pre-aggregate availability for a metric query
     * @summary Check pre-aggregate
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('{exploreId}/preAggregateCheck')
    @OperationId('CheckPreAggregate')
    async CheckPreAggregate(
        @Path() exploreId: string,
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Body()
        body: MetricQuery & {
            usePreAggregateCache?: boolean;
        },
    ): Promise<ApiPreAggregateCheckResponse> {
        this.setStatus(200);

        const { usePreAggregateCache, ...metricQuery } = body;

        const result = await this.services
            .getProjectService()
            .checkPreAggregateMatch({
                account: req.account!,
                projectUuid,
                exploreName: exploreId,
                metricQuery,
                usePreAggregateCache: usePreAggregateCache ?? true,
            });

        return {
            status: 'ok',
            results: result,
        };
    }

    /**
     * Validate a spreadsheet formula against the explore's fields
     * @summary Validate formula
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('{exploreId}/validateFormula')
    @OperationId('ValidateFormula')
    async ValidateFormula(
        @Path() exploreId: string,
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Body()
        body: {
            formula: string;
            metricQuery: MetricQuery;
        },
    ): Promise<{
        status: 'ok';
        results: ApiFormulaValidationResults;
    }> {
        this.setStatus(200);

        const results = await this.services
            .getProjectService()
            .validateFormula({
                account: req.account!,
                projectUuid,
                exploreName: exploreId,
                formula: body.formula,
                metricQuery: body.metricQuery,
            });

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * List charts referencing a given explore
     * @summary List charts by explore
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{exploreId}/charts')
    @OperationId('GetChartsByExploreName')
    async getChartsByExploreName(
        @Path() exploreId: string,
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiChartSummaryListResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getProjectService()
                .getChartsByExploreName(
                    toSessionUser(req.account),
                    projectUuid,
                    exploreId,
                ),
        };
    }
}
