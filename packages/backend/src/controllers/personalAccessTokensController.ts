import {
    ApiErrorPayload,
    PersonalAccessTokenWithToken,
} from '@lightdash/common';
import {
    Body,
    Middlewares,
    OperationId,
    Patch,
    Path,
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
} from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/me/personal-access-tokens')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Personal Access Tokens')
export class PersonalAccessTokensController extends BaseController {
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('/{personalAccessTokenUuid}/rotate')
    @OperationId('Rotate personal access token')
    async rotatePersonalAccessToken(
        @Path() personalAccessTokenUuid: string,
        @Request() req: express.Request,
        @Body()
        body: {
            expiresAt: Date;
        },
    ): Promise<{
        status: 'ok';
        results: PersonalAccessTokenWithToken;
    }> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getPersonalAccessTokenService()
                .rotatePersonalAccessToken(
                    req.user!,
                    personalAccessTokenUuid,
                    body,
                ),
        };
    }
}
