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
     * Resolve a project-context citation slug to the entry the agent read.
     * Resolves entries that were since edited or removed, so an old answer's
     * citations never rot. Gated on project view — project context is shared
     * knowledge, not personal memory.
     * @summary Get a project context entry by citation slug
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/entries/{slug}')
    @OperationId('getAiProjectContextEntry')
    async getAiProjectContextEntry(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() slug: string,
    ): Promise<ApiAiProjectContextEntryResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        return {
            status: 'ok',
            results: await this.services
                .getProjectContextService<ProjectContextService>()
                .getEntryBySlug(toSessionUser(req.account), projectUuid, slug),
        };
    }
}
