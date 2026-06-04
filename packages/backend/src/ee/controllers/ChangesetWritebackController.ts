import {
    assertRegisteredAccount,
    type ApiAiWritebackResponse,
    type ApiErrorPayload,
} from '@lightdash/common';
import {
    Hidden,
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
import { ChangesetWritebackService } from '../services/ChangesetWritebackService/ChangesetWritebackService';

@Route('/api/v1/ee/projects/{projectUuid}/changesets')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class ChangesetWritebackController extends BaseController {
    /**
     * Write back every change in the project's active changeset to the dbt
     * project in a single pull request. Synchronous — the request is held open
     * until the writeback run completes.
     * @summary Write back all changeset changes
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/writeback')
    @OperationId('writebackChangeset')
    async writebackChangeset(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<ApiAiWritebackResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const results = await this.services
            .getChangesetWritebackService<ChangesetWritebackService>()
            .writebackActiveChangeset(toSessionUser(req.account), projectUuid);
        return {
            status: 'ok',
            results,
        };
    }
}
