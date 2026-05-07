import {
    ApiErrorPayload,
    assertRegisteredAccount,
    ManagedAgentAction,
    ManagedAgentActionType,
    ManagedAgentRun,
    ManagedAgentRunsListResponse,
    ManagedAgentSettings,
    UpdateManagedAgentSettings,
} from '@lightdash/common';
import {
    Body,
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Patch,
    Path,
    Post,
    Query,
    Request,
    Response,
    Route,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../../auth/account';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { ManagedAgentService } from '../services/ManagedAgentService/ManagedAgentService';

@Route('/api/v1/projects/{projectUuid}/managed-agent')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Managed Agent')
export class ManagedAgentController extends BaseController {
    private getManagedAgentService() {
        return this.services.getManagedAgentService<ManagedAgentService>();
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/settings')
    @OperationId('getManagedAgentSettings')
    async getSettings(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<{ status: 'ok'; results: ManagedAgentSettings | null }> {
        assertRegisteredAccount(req.account);
        const results = await this.getManagedAgentService().getSettings(
            toSessionUser(req.account),
            projectUuid,
        );
        this.setStatus(200);
        return { status: 'ok', results };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Patch('/settings')
    @OperationId('updateManagedAgentSettings')
    async updateSettings(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: UpdateManagedAgentSettings,
    ): Promise<{ status: 'ok'; results: ManagedAgentSettings }> {
        assertRegisteredAccount(req.account);
        const results = await this.getManagedAgentService().updateSettings(
            toSessionUser(req.account),
            projectUuid,
            toSessionUser(req.account).userUuid,
            body,
        );
        this.setStatus(200);
        return { status: 'ok', results };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Post('/run')
    @OperationId('runManagedAgentHeartbeat')
    async runHeartbeat(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<{ status: 'ok'; results: undefined }> {
        assertRegisteredAccount(req.account);
        await this.getManagedAgentService().startHeartbeat(
            toSessionUser(req.account),
            projectUuid,
        );
        this.setStatus(202);
        return { status: 'ok', results: undefined };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/runs/latest')
    @OperationId('getLatestManagedAgentRun')
    async getLatestRun(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<{ status: 'ok'; results: ManagedAgentRun | null }> {
        assertRegisteredAccount(req.account);
        const results = await this.getManagedAgentService().getLatestRun(
            toSessionUser(req.account),
            projectUuid,
        );
        this.setStatus(200);
        return { status: 'ok', results };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/runs')
    @OperationId('getManagedAgentRuns')
    async getRuns(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Query() limit?: number,
        @Query() cursor?: string,
    ): Promise<{ status: 'ok'; results: ManagedAgentRunsListResponse }> {
        assertRegisteredAccount(req.account);
        const safeLimit = Math.min(Math.max(limit ?? 20, 1), 100);
        const results = await this.getManagedAgentService().getRuns(
            toSessionUser(req.account),
            projectUuid,
            { limit: safeLimit, cursor: cursor ?? null },
        );
        this.setStatus(200);
        return { status: 'ok', results };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Get('/actions')
    @OperationId('getManagedAgentActions')
    async getActions(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Query() date?: string,
        @Query() actionType?: string,
        @Query() sessionId?: string,
        @Query() runUuid?: string,
    ): Promise<{ status: 'ok'; results: ManagedAgentAction[] }> {
        assertRegisteredAccount(req.account);
        const results = await this.getManagedAgentService().getActions(
            toSessionUser(req.account),
            projectUuid,
            {
                date,
                actionType: actionType as ManagedAgentActionType | undefined,
                sessionId,
                runUuid,
            },
        );
        this.setStatus(200);
        return { status: 'ok', results };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @Post('/actions/{actionUuid}/reverse')
    @OperationId('reverseManagedAgentAction')
    async reverseAction(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() actionUuid: string,
    ): Promise<{ status: 'ok'; results: ManagedAgentAction }> {
        assertRegisteredAccount(req.account);
        const results = await this.getManagedAgentService().reverseAction(
            toSessionUser(req.account),
            projectUuid,
            actionUuid,
            toSessionUser(req.account).userUuid,
        );
        this.setStatus(200);
        return { status: 'ok', results };
    }
}
