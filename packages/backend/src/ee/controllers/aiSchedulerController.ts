import {
    assertRegisteredAccount,
    type ApiAiSchedulerConfigResponse,
    type ApiErrorPayload,
    type ApiSuccessEmpty,
    type UpsertAiSchedulerConfig,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Middlewares,
    OperationId,
    Path,
    Put,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../../auth/account';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { type AiSchedulerService } from '../services/AiSchedulerService';

@Route('/api/v1/schedulers/{schedulerUuid}/ai-config')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Scheduler')
export class AiSchedulerController extends BaseController {
    protected getAiSchedulerService() {
        return this.services.getAiSchedulerService<AiSchedulerService>();
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('getAiSchedulerConfig')
    async getConfig(
        @Request() req: express.Request,
        @Path() schedulerUuid: string,
    ): Promise<ApiAiSchedulerConfigResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getAiSchedulerService().getConfig(
                toSessionUser(req.account),
                schedulerUuid,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Put('/')
    @OperationId('upsertAiSchedulerConfig')
    async upsertConfig(
        @Request() req: express.Request,
        @Path() schedulerUuid: string,
        @Body() body: UpsertAiSchedulerConfig,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getAiSchedulerService().upsertConfig(
            toSessionUser(req.account),
            schedulerUuid,
            body,
        );
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Delete('/')
    @OperationId('deleteAiSchedulerConfig')
    async deleteConfig(
        @Request() req: express.Request,
        @Path() schedulerUuid: string,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getAiSchedulerService().removeConfig(
            toSessionUser(req.account),
            schedulerUuid,
        );
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }
}
