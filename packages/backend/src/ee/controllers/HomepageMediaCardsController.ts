import {
    assertRegisteredAccount,
    type ApiErrorPayload,
    type ApiHomepageMediaCardsResponse,
} from '@lightdash/common';
import {
    Get,
    Middlewares,
    OperationId,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { type HomepageMediaCardsService } from '../services/HomepageMediaCardsService';

@Route('/api/v1/ee/homepage/media-cards')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Homepage')
export class HomepageMediaCardsController extends BaseController {
    private getService(): HomepageMediaCardsService {
        return this.services.getHomepageMediaCardsService<HomepageMediaCardsService>();
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('listHomepageMediaCards')
    async list(
        @Request() req: express.Request,
    ): Promise<ApiHomepageMediaCardsResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.getService().list(),
        };
    }
}
