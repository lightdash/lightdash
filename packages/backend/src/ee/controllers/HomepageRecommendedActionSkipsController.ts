import {
    assertRegisteredAccount,
    type ApiErrorPayload,
    type ApiHomepageRecommendedActionSkipsResponse,
    type ApiSuccessEmpty,
    type HomepageRecommendedActionKey,
    type SkipHomepageRecommendedActionRequest,
    type UUID,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Middlewares,
    OperationId,
    Path,
    Post,
    Query,
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
    unauthorisedInDemo,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { type HomepageRecommendedActionSkipsService } from '../services/HomepageRecommendedActionSkipsService';

@Route('/api/v1/ee/homepage/recommended-action-skips')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Homepage')
export class HomepageRecommendedActionSkipsController extends BaseController {
    private getService(): HomepageRecommendedActionSkipsService {
        return this.services.getHomepageRecommendedActionSkipsService<HomepageRecommendedActionSkipsService>();
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('listHomepageRecommendedActionSkips')
    async list(
        @Request() req: express.Request,
        @Query() projectUuid?: UUID,
    ): Promise<ApiHomepageRecommendedActionSkipsResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.getService().list(
                req.account,
                projectUuid ?? null,
            ),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/')
    @OperationId('skipHomepageRecommendedAction')
    async skip(
        @Request() req: express.Request,
        @Body() body: SkipHomepageRecommendedActionRequest,
        @Query() projectUuid?: UUID,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getService().skip(
            req.account,
            projectUuid ?? null,
            body.actionKey,
        );
        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/{actionKey}')
    @OperationId('unskipHomepageRecommendedAction')
    async unskip(
        @Request() req: express.Request,
        @Path() actionKey: HomepageRecommendedActionKey,
        @Query() projectUuid?: UUID,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getService().unskip(
            req.account,
            projectUuid ?? null,
            actionKey,
        );
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
