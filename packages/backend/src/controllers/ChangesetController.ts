import {
    ApiChangesetsResponseTSOACompat,
    ApiErrorPayload,
    ApiRevertChangeResponse,
} from '@lightdash/common';
import {
    Get,
    Middlewares,
    OperationId,
    Path,
    Post,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/changesets')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Changesets')
export class ChangesetController extends BaseController {
    /**
     * Get active changeset for a project
     * @summary List changesets
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get()
    @OperationId('listActiveChangesetWithChanges')
    async listActiveChangesetWithChanges(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiChangesetsResponseTSOACompat> {
        const changesets = await this.services
            .getChangesetService()
            .findActiveChangesetWithChangesByProjectUuid(
                req.user!,
                projectUuid,
            );

        return {
            status: 'ok',
            results:
                changesets as unknown as ApiChangesetsResponseTSOACompat['results'],
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/changes/{changeUuid}/revert')
    @OperationId('revertChange')
    async revertChange(
        @Path() projectUuid: string,
        @Path() changeUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiRevertChangeResponse> {
        await this.services
            .getChangesetService()
            .revertChange(req.user!, projectUuid, changeUuid);

        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/revert-all')
    @OperationId('revertAllChanges')
    async revertAllChanges(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiRevertChangeResponse> {
        await this.services
            .getChangesetService()
            .revertAllChanges(req.user!, projectUuid);

        return {
            status: 'ok',
            results: undefined,
        };
    }
}
