import {
    ApiErrorPayload,
    ApiPreflightExplainResponse,
    ApiPreflightProbeResponse,
    assertRegisteredAccount,
} from '@lightdash/common';
import {
    Body,
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Post,
    Query,
    Request,
    Response,
    Route,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/preflight')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Preflight')
@Hidden()
export class PreflightController extends BaseController {
    /**
     * Read-only snapshot of the instance database's upgrade-relevant state:
     * migration lock, write counters for the given tables, and long-running
     * transactions. Call twice and diff the counters for write rates. Disabled
     * unless PREFLIGHT_PROBE_ENABLED=true; requires organization admin, and
     * refuses multi-organization instances outright.
     * On single-organization instances the activity snapshot includes in-flight
     * query text (which can embed literals from other users' queries) — the
     * audience is the instance operator.
     * @summary Preflight probe
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/probe')
    @OperationId('GetPreflightProbe')
    async getPreflightProbe(
        @Request() req: express.Request,
        @Query() tables?: string,
    ): Promise<ApiPreflightProbeResponse> {
        assertRegisteredAccount(req.account);
        const tableNames = (tables ?? '')
            .split(',')
            .map((table) => table.trim())
            .filter(Boolean);
        const results = await this.services
            .getPreflightService()
            .probe(req.account, tableNames);
        this.setStatus(200);
        return { status: 'ok', results };
    }

    /**
     * Plans one fact's backfill SQL against this instance so the preflight can
     * report how many rows a migration touches. Plain EXPLAIN plans without
     * executing; the statement must be a single read-only SELECT and runs in a
     * read-only transaction under a statement timeout. Same gates as the probe.
     * @summary Preflight EXPLAIN
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Post('/explain')
    @OperationId('PostPreflightExplain')
    async postPreflightExplain(
        @Request() req: express.Request,
        @Body() body: { sql: string },
    ): Promise<ApiPreflightExplainResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.services
            .getPreflightService()
            .explain(req.account, body.sql);
        this.setStatus(200);
        return { status: 'ok', results };
    }
}
