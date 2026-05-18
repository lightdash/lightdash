import {
    ApiAiAgentDocumentContentResponse,
    ApiAiAgentDocumentResponse,
    ApiAiAgentDocumentSummaryListResponse,
    ApiCreateAiAgentDocument,
    ApiErrorPayload,
    ApiSuccessEmpty,
    ApiUpdateAiAgentDocument,
    assertRegisteredAccount,
} from '@lightdash/common';
import {
    Body,
    Delete,
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
@Hidden()
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

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{documentUuid}')
    @OperationId('getAiAgentDocument')
    async getDocument(
        @Request() req: express.Request,
        @Path() documentUuid: string,
    ): Promise<ApiAiAgentDocumentResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().getDocument(
                toSessionUser(req.account),
                documentUuid,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{documentUuid}/content')
    @OperationId('getAiAgentDocumentContent')
    async getDocumentContent(
        @Request() req: express.Request,
        @Path() documentUuid: string,
    ): Promise<ApiAiAgentDocumentContentResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().getDocumentContent(
                toSessionUser(req.account),
                documentUuid,
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
    @Patch('/{documentUuid}')
    @OperationId('updateAiAgentDocument')
    async updateDocument(
        @Request() req: express.Request,
        @Path() documentUuid: string,
        @Body() body: ApiUpdateAiAgentDocument,
    ): Promise<ApiAiAgentDocumentResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().updateDocument(
                toSessionUser(req.account),
                documentUuid,
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
