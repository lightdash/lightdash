import {
    assertRegisteredAccount,
    type ApiAiProjectContextEntryResponse,
    type ApiErrorPayload,
    type UUID,
} from '@lightdash/common';
import {
    Get,
    Middlewares,
    OperationId,
    Path,
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
import { type ProjectContextService } from '../services/ProjectContextService/ProjectContextService';

@Route('/api/v1/projects/{projectUuid}/aiProjectContext')
@Response<ApiErrorPayload>('default', 'Error')
export class AiProjectContextController extends BaseController {
    /**
     * Returns one curated project-context entry, so a citation in an agent
     * answer can be resolved back to the entry the agent read.
     * @summary Get a project context entry
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/entries/{entryId}')
    @OperationId('getAiProjectContextEntry')
    async getAiProjectContextEntry(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() entryId: string,
    ): Promise<ApiAiProjectContextEntryResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        return {
            status: 'ok',
            results: await this.services
                .getProjectContextService<ProjectContextService>()
                .getEntry(toSessionUser(req.account), projectUuid, entryId),
        };
    }
}
