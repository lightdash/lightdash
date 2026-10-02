import {
    assertRegisteredAccount,
    type ApiErrorPayload,
    type ApiGenerativeUiOperationsResponse,
} from '@lightdash/common';
import {
    Get,
    Middlewares,
    OperationId,
    Request,
    Response,
    Route,
    SuccessResponse,
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../../auth/account';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { type AiAgentService } from '../services/AiAgentService/AiAgentService';

@Route('/api/v1/ai/generative-ui')
@Response<ApiErrorPayload>('default', 'Error')
export class AiGenerativeUiController extends BaseController {
    /**
     * List the Lightdash API operations that an AI agent's generated UI card
     * may call, with their method and path template.
     * @summary List generative UI operations
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/operations')
    @OperationId('listGenerativeUiOperations')
    async listOperations(
        @Request() req: express.Request,
    ): Promise<ApiGenerativeUiOperationsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getAiAgentService<AiAgentService>()
                .listGenerativeUiOperations(toSessionUser(req.account)),
        };
    }
}
