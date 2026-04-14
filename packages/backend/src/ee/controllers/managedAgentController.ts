import {
    ApiErrorPayload,
    ManagedAgentAction,
    ManagedAgentActionType,
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
        const results = await this.getManagedAgentService().getSettings(
            req.user!,
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
        const results = await this.getManagedAgentService().updateSettings(
            req.user!,
            projectUuid,
            req.user!.userUuid,
            body,
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
    ): Promise<{ status: 'ok'; results: ManagedAgentAction[] }> {
        const results = await this.getManagedAgentService().getActions(
            req.user!,
            projectUuid,
            {
                date,
                actionType: actionType as ManagedAgentActionType | undefined,
                sessionId,
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
        const results = await this.getManagedAgentService().reverseAction(
            req.user!,
            projectUuid,
            actionUuid,
            req.user!.userUuid,
        );
        this.setStatus(200);
        return { status: 'ok', results };
    }
}
