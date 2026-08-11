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

@Route('/api/v1/projects/{projectUuid}/aiProjectContextEntries')
@Response<ApiErrorPayload>('default', 'Error')
export class AiProjectContextEntriesController extends BaseController {
    /**
     * Resolves a project-context citation slug to the exact entry content the
     * agent read, including entries since edited or removed from the file.
     * @summary Get a project context entry
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{slug}')
    @OperationId('getAiProjectContextEntryBySlug')
    async getAiProjectContextEntryBySlug(
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
