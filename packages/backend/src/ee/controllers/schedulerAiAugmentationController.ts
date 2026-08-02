import {
    ApiErrorPayload,
    ApiSchedulerAiAugmentationResponse,
    ApiSuccessEmpty,
    assertRegisteredAccount,
    SchedulerAiAugmentation,
    UUID,
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
    unauthorisedInDemo,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { type SchedulerAiAugmentationService } from '../services/SchedulerAiAugmentationService/SchedulerAiAugmentationService';

@Route('/api/v1/schedulers/{schedulerUuid}/ai-augmentation')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Schedulers')
export class SchedulerAiAugmentationController extends BaseController {
    private getService(): SchedulerAiAugmentationService {
        return this.services.getSchedulerAiAugmentationService<SchedulerAiAugmentationService>();
    }

    /**
     * Get the AI augmentation attached to a scheduled delivery, or null.
     * @summary Get scheduler AI augmentation
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('getSchedulerAiAugmentation')
    async getAugmentation(
        @Path() schedulerUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiSchedulerAiAugmentationResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().getAugmentation(
                toSessionUser(req.account),
                schedulerUuid,
            ),
        };
    }

    /**
     * Attach or replace the AI augmentation on a scheduled delivery.
     * @summary Upsert scheduler AI augmentation
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Put('/')
    @OperationId('upsertSchedulerAiAugmentation')
    async upsertAugmentation(
        @Path() schedulerUuid: UUID,
        @Body() body: SchedulerAiAugmentation,
        @Request() req: express.Request,
    ): Promise<ApiSchedulerAiAugmentationResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().upsertAugmentation(
                toSessionUser(req.account),
                schedulerUuid,
                body,
            ),
        };
    }

    /**
     * Remove the AI augmentation from a scheduled delivery.
     * @summary Delete scheduler AI augmentation
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/')
    @OperationId('deleteSchedulerAiAugmentation')
    async deleteAugmentation(
        @Path() schedulerUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        await this.getService().deleteAugmentation(
            toSessionUser(req.account),
            schedulerUuid,
        );
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
