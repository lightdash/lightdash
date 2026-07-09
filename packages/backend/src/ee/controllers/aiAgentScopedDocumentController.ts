import {
    ApiAiAgentDocumentResponse,
    ApiAiAgentDocumentSummaryListResponse,
    ApiCreateAgentDocument,
    ApiErrorPayload,
    ApiSuccessEmpty,
    assertRegisteredAccount,
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

@Route('/api/v1/projects/{projectUuid}/aiAgents/{agentUuid}/documents')
@Response<ApiErrorPayload>('default', 'Error')
export class AiAgentScopedDocumentController extends BaseController {
    private getService(): AiAgentDocumentService {
        return this.services.getAiAgentDocumentService<AiAgentDocumentService>();
    }

    /**
     * List the knowledge documents this agent can use: the organization level
     * documents plus the ones granted to this agent in this project.
     * @summary List agent documents
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('listAgentDocuments')
    async listDocuments(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() agentUuid: UUID,
    ): Promise<ApiAiAgentDocumentSummaryListResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.getService().listDocuments(
                toSessionUser(req.account),
                { projectUuid, agentUuid },
            ),
        };
    }

    /**
     * Create a knowledge document scoped to this project and agent.
     * @summary Create agent document
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('201', 'Created')
    @Post('/')
    @OperationId('createAgentDocument')
    async createDocument(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() agentUuid: UUID,
        @Body() body: ApiCreateAgentDocument,
    ): Promise<ApiAiAgentDocumentResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(201);
        return {
            status: 'ok',
            results: await this.getService().createDocument(
                toSessionUser(req.account),
                { projectUuid, agentUuid },
                body,
            ),
        };
    }

    /**
     * Delete a knowledge document this agent can use.
     * @summary Delete agent document
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/{documentUuid}')
    @OperationId('deleteAgentDocument')
    async deleteDocument(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() agentUuid: UUID,
        @Path() documentUuid: UUID,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.getService().deleteDocument(
            toSessionUser(req.account),
            { projectUuid, agentUuid },
            documentUuid,
        );
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
