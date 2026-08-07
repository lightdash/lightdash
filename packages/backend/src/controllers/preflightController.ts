import {
    ApiErrorPayload,
    ApiPreflightProbeResponse,
    assertRegisteredAccount,
} from '@lightdash/common';
import {
    Get,
    Hidden,
    Middlewares,
    OperationId,
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
     * transactions. Call twice and diff the counters for write rates. Requires
     * organization admin.
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
}
