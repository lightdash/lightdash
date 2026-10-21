import {
    ForbiddenError,
    type ApiAppSharedStateResponse,
    type ApiAppStateHistoryResponse,
    type ApiAppStateSnapshotResponse,
    type ApiAppUserStateResponse,
    type ApiErrorPayload,
    type SetAppSharedStateRequest,
    type SetAppUserStateRequest,
    type UUID,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Path,
    Put,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
} from '@tsoa/runtime';
import express from 'express';
import { requireOAuthScopeOperation } from '../../auth/oauthScopes/unchecked';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';
import { AppStateService } from '../services/AppStateService/AppStateService';

/**
 * Durable state for data apps. Every route runs as the viewer: the app posts
 * to the hosting page, which calls these with the viewer's own session (or
 * the embed JWT, which may only read).
 */
@Route('/api/v1/ee/projects/{projectUuid}/apps/{appUuid}/state')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class AppStateController extends BaseController {
    /**
     * Everything the viewer can read for this app: their own per-user values
     * and the app's shared values. Embeds get shared values only.
     * @summary Get app state
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        requireOAuthScopeOperation('AppStateController.getAppState'),
    ])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('getAppState')
    async getAppState(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() appUuid: UUID,
    ): Promise<ApiAppStateSnapshotResponse> {
        if (!req.account) {
            throw new ForbiddenError('Account is required');
        }
        this.setStatus(200);
        const results = await this.getService().getSnapshot(
            req.account,
            projectUuid,
            appUuid,
        );
        return { status: 'ok', results };
    }

    /**
     * Save a per-user value. Only the writer ever reads it back.
     * @summary Set per-user app state
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        requireOAuthScopeOperation('AppStateController.setUserState'),
    ])
    @SuccessResponse('200', 'Success')
    @Put('/user/{key}')
    @OperationId('setAppUserState')
    async setUserState(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() appUuid: UUID,
        @Path() key: string,
        @Body() body: SetAppUserStateRequest,
    ): Promise<ApiAppUserStateResponse> {
        if (!req.account) {
            throw new ForbiddenError('Account is required');
        }
        this.setStatus(200);
        const results = await this.getService().setUserState(
            req.account,
            projectUuid,
            appUuid,
            key,
            body.value,
        );
        return { status: 'ok', results };
    }

    /**
     * Remove a per-user value.
     * @summary Delete per-user app state
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        requireOAuthScopeOperation('AppStateController.deleteUserState'),
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/user/{key}')
    @OperationId('deleteAppUserState')
    async deleteUserState(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() appUuid: UUID,
        @Path() key: string,
    ): Promise<{ status: 'ok'; results: undefined }> {
        if (!req.account) {
            throw new ForbiddenError('Account is required');
        }
        await this.getService().deleteUserState(
            req.account,
            projectUuid,
            appUuid,
            key,
        );
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }

    /**
     * Save a shared value every viewer reads. The write carries the version
     * the writer last read; a stale version gets a 409 with the current value.
     * `expectedVersion: null` creates the key.
     * @summary Set shared app state
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        requireOAuthScopeOperation('AppStateController.setSharedState'),
    ])
    @SuccessResponse('200', 'Success')
    @Put('/shared/{key}')
    @OperationId('setAppSharedState')
    async setSharedState(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() appUuid: UUID,
        @Path() key: string,
        @Body() body: SetAppSharedStateRequest,
    ): Promise<ApiAppSharedStateResponse> {
        if (!req.account) {
            throw new ForbiddenError('Account is required');
        }
        this.setStatus(200);
        const results = await this.getService().setSharedState(
            req.account,
            projectUuid,
            appUuid,
            key,
            body.value,
            body.expectedVersion,
        );
        return { status: 'ok', results };
    }

    /**
     * Remove a shared value and its history. Requires manage access to the app.
     * @summary Delete shared app state
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        requireOAuthScopeOperation('AppStateController.deleteSharedState'),
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/shared/{key}')
    @OperationId('deleteAppSharedState')
    async deleteSharedState(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() appUuid: UUID,
        @Path() key: string,
    ): Promise<{ status: 'ok'; results: undefined }> {
        if (!req.account) {
            throw new ForbiddenError('Account is required');
        }
        await this.getService().deleteSharedState(
            req.account,
            projectUuid,
            appUuid,
            key,
        );
        this.setStatus(200);
        return { status: 'ok', results: undefined };
    }

    /**
     * Versions of a shared value, newest first, with who wrote each and when.
     * @summary Get shared app state history
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        requireOAuthScopeOperation('AppStateController.getSharedHistory'),
    ])
    @SuccessResponse('200', 'Success')
    @Get('/shared/{key}/history')
    @OperationId('getAppSharedStateHistory')
    async getSharedHistory(
        @Request() req: express.Request,
        @Path() projectUuid: UUID,
        @Path() appUuid: UUID,
        @Path() key: string,
        @Query() limit?: number,
        @Query() beforeVersion?: number,
    ): Promise<ApiAppStateHistoryResponse> {
        if (!req.account) {
            throw new ForbiddenError('Account is required');
        }
        this.setStatus(200);
        const results = await this.getService().getSharedHistory(
            req.account,
            projectUuid,
            appUuid,
            key,
            { limit, beforeVersion },
        );
        return { status: 'ok', results };
    }

    private getService(): AppStateService {
        return this.services.getAppStateService<AppStateService>();
    }
}
