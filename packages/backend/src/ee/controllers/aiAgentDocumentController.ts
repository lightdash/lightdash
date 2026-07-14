import {
    ApiAiAgentDocumentResponse,
    ApiAiAgentDocumentSummaryListResponse,
    ApiCreateAiAgentDocument,
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

    /**
     * List every knowledge document in the organization.
     * @summary List AI agent documents
     */
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
            results: await this.getService().listOrganizationDocuments(
                toSessionUser(req.account),
                { projectUuid: projectUuid ?? undefined },
            ),
        };
    }

    /**
     * Create a knowledge document. The projectUuid and agentAccess body fields
     * are deprecated: scope the document by creating it on the agent route
     * instead. Without them the document is available to every agent.
     * @summary Create AI agent document
     */
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
            results: await this.getService().createOrganizationDocument(
                toSessionUser(req.account),
                body,
            ),
        };
    }

    /**
     * Delete a knowledge document anywhere in the organization.
     * @summary Delete AI agent document
     */
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
        await this.getService().deleteOrganizationDocument(
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
