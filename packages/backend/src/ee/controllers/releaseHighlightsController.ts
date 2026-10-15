import {
    ApiReleaseHighlights,
    assertRegisteredAccount,
} from '@lightdash/common';
import {
    Get,
    Hidden,
    Middlewares,
    Request,
    Route,
    SuccessResponse,
} from '@tsoa/runtime';
import express from 'express';
import { isAuthenticated } from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { ReleaseHighlightsService } from '../services/ReleaseHighlightsService/ReleaseHighlightsService';

@Route('/api/v1/ai/release-highlights')
@Hidden()
export class ReleaseHighlightsController extends BaseController {
    @Middlewares([isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    async getReleaseHighlights(
        @Request() req: express.Request,
    ): Promise<ApiReleaseHighlights> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getReleaseHighlightsService<ReleaseHighlightsService>()
                .getHighlights(req.account),
        };
    }
}
