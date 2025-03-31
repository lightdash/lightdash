import { AnyType, ApiErrorPayload } from '@lightdash/common';
import {
    Body,
    Hidden,
    Middlewares,
    OperationId,
    Post,
    Request,
    Response,
    Route,
    SuccessResponse,
} from '@tsoa/runtime';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { SupportService } from '../services/SupportService/SupportService';

@Route('/api/v1/support')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class SupportController extends BaseController {
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/share')
    @OperationId('ReportError')
    async shareSupport(
        @Request() req: express.Request,
        @Body()
        body: {
            image?: string | null;
            description?: string;
            canImpersonate: boolean;
            logs: AnyType[];
            network: AnyType[];
        },
    ): Promise<{ status: 'ok' }> {
        this.setStatus(200);

        await this.getSupportService().shareWithSupport(
            req.user!,
            body,
            req.headers,
        );

        return {
            status: 'ok',
        };
    }

    /**
     * Convenience method to access the support service without having
     * to specify an interface type.
     */
    protected getSupportService() {
        return this.services.getSupportService<SupportService>();
    }
}
