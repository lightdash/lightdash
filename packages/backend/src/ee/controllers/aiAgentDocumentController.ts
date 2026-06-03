import {
    ApiAiAgentDocumentResponse,
    ApiAiAgentDocumentSummaryListResponse,
    ApiCreateAiAgentDocument,
} from '@lightdash/ai';
import {
    ApiErrorPayload,
    ApiSuccessEmpty,
    assertRegisteredAccount,
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
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../../auth/account';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { type AiAgentDocumentService } from '../services/AiAgentDocumentService';

@Route('/api/v1/aiAgents/documents')
@Response<ApiErrorPayload>('default', 'Error')
export class AiAgentDocumentController extends BaseController {
    private getService(): AiAgentDocumentService {
        return this.services.getAiAgentDocumentService<AiAgentDocumentService>();
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('listAiAgentDocuments')
    async listDocuments(
        @Request() req: express.Request,
        @Query() projectUuid?: string,
    ): Promise<ApiAiAgentDocumentSummaryListResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().listDocuments(
                toSessionUser(req.account),
                { projectUuid: projectUuid ?? undefined },
            ),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/')
    @OperationId('createAiAgentDocument')
    async createDocument(
        @Request() req: express.Request,
        @Body() body: ApiCreateAiAgentDocument,
    ): Promise<ApiAiAgentDocumentResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(201);
        return {
            status: 'ok',
            results: await this.getService().createDocument(
                toSessionUser(req.account),
                body,
            ),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/{documentUuid}')
    @OperationId('deleteAiAgentDocument')
    async deleteDocument(
        @Request() req: express.Request,
        @Path() documentUuid: string,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getService().deleteDocument(
            toSessionUser(req.account),
            documentUuid,
        );
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
