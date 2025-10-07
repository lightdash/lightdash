import {
    ApiChangesetsResponseTSOACompat,
    ApiErrorPayload,
    ApiGetChangeResponseTSOACompat,
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

    /**
     * Get a specific change by UUID
     * @summary Get change
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/changes/{changeUuid}')
    @OperationId('getChange')
    async getChange(
        @Path() projectUuid: string,
        @Path() changeUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiGetChangeResponseTSOACompat> {
        const change = await this.services
            .getChangesetService()
            .getChange(req.user!, projectUuid, changeUuid);

        return {
            status: 'ok',
            results:
                change as unknown as ApiGetChangeResponseTSOACompat['results'],
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
