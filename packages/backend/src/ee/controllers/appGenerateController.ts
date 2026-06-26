import {
    ApiErrorPayload,
    assertRegisteredAccount,
    ParameterError,
    type ApiAppImageUploadResponse,
    type ApiAppImageUrlResponse,
    type ApiAppSchedulersResponse,
    type ApiAppThumbnailUrlResponse,
    type ApiCancelAppVersionResponse,
    type ApiClarifyAppRequest,
    type ApiClarifyAppResponse,
    type ApiCreateAppSchedulerResponse,
    type ApiDeleteAppResponse,
    type ApiDuplicateAppResponse,
    type ApiEmbedProjectAppsResponse,
    type ApiGenerateAppResponse,
    type ApiGetAppResponse,
    type ApiMyAppsResponse,
    type ApiPreviewTokenResponse,
    type ApiPromoteAppDiffResponse,
    type ApiPromoteAppResponse,
    type ApiRestoreAppVersionResponse,
    type ApiSuccessEmpty,
    type ApiTogglePinnedItem,
    type ApiUpdateAppRequest,
    type ApiUpdateAppResponse,
    type GenerateAppRequestBody,
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
import { AppGenerateService } from '../services/AppGenerateService/AppGenerateService';

@Route('/api/v1/ee/projects/{projectUuid}/apps')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class AppGenerateController extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/')
    @OperationId('generateApp')
    async generateApp(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: GenerateAppRequestBody,
    ): Promise<ApiGenerateAppResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const result = await this.getAppGenerateService().generateApp(
            toSessionUser(req.account),
            projectUuid,
            body.prompt,
            body.imageIds ?? [],
            body.appUuid,
            body.charts,
            body.dashboard,
            body.template,
            body.clarifications,
            body.spaceUuid,
            body.claudeModel,
            {
                designUuidInput: body.designUuid,
                externalConnections: body.externalConnections,
            },
        );
        return {
            status: 'ok',
            results: result,
        };
    }

    /**
     * List the project's data apps (for the embed config allowlist picker).
     * @summary List project data apps
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('listProjectApps')
    async listProjectApps(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<ApiEmbedProjectAppsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const results = await this.getAppGenerateService().listAppsForProject(
            toSessionUser(req.account),
            projectUuid,
        );
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Pre-build clarifying questions. Returns 0–4 short questions whose
     * answers will materially refine the prompt before the (slow) build
     * pipeline starts. Stateless — answers are sent back as
     * `clarifications` on the eventual generate request.
     * @summary Get clarifying questions for a new app
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/clarify')
    @OperationId('clarifyApp')
    async clarifyApp(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Body() body: ApiClarifyAppRequest,
    ): Promise<ApiClarifyAppResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const result = await this.getAppGenerateService().clarifyApp(
            toSessionUser(req.account),
            projectUuid,
            body.prompt,
            body.template,
            body.charts,
            body.dashboard,
            body.imageIds,
        );
        return {
            status: 'ok',
            results: result,
        };
    }

    /**
     * Upload an image for a data app generation request.
     * Send raw image bytes with the appropriate Content-Type header.
     * The request body is streamed directly to S3 without buffering.
     * @summary Upload app image
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{appUuid}/upload-image')
    @OperationId('uploadAppImage')
    async uploadImage(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
        @Query() kind?: 'screenshot',
    ): Promise<ApiAppImageUploadResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const mimeType = req.headers['content-type'];
        if (!mimeType) {
            throw new ParameterError('Content-Type header is required');
        }
        if (!req.headers['content-length']) {
            throw new ParameterError('Content-Length header is required');
        }
        const contentLength = parseInt(req.headers['content-length'], 10);
        if (Number.isNaN(contentLength) || contentLength <= 0) {
            throw new ParameterError(
                'Content-Length must be a positive integer',
            );
        }
        const result = await this.getAppGenerateService().uploadImage(
            toSessionUser(req.account),
            projectUuid,
            mimeType,
            req,
            contentLength,
            appUuid,
            kind,
        );
        return {
            status: 'ok',
            results: result,
        };
    }

    /**
     * Get an app with its version history, paginated backwards.
     * @summary Get app with versions
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{appUuid}')
    @OperationId('getApp')
    async getApp(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
        @Query() beforeVersion?: number,
        @Query() limit?: number,
    ): Promise<ApiGetAppResponse> {
        assertRegisteredAccount(req.account);
        const result = await this.getAppGenerateService().getAppVersions(
            toSessionUser(req.account),
            projectUuid,
            appUuid,
            { beforeVersion, limit },
        );
        return {
            status: 'ok',
            results: result,
        };
    }

    /**
     * Create a new version of an existing app by iterating on it with a follow-up prompt.
     * Resumes the paused sandbox if available, otherwise creates a new one and restores source.
     * @summary Iterate on an existing app
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{appUuid}/versions')
    @OperationId('iterateApp')
    async iterateApp(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
        @Body() body: GenerateAppRequestBody,
    ): Promise<ApiGenerateAppResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const result = await this.getAppGenerateService().iterateApp(
            toSessionUser(req.account),
            projectUuid,
            appUuid,
            body.prompt,
            body.imageIds ?? [],
            body.charts,
            body.dashboard,
            body.claudeModel,
            {
                designUuidInput: body.designUuid,
                externalConnections: body.externalConnections,
            },
        );
        return {
            status: 'ok',
            results: result,
        };
    }

    /**
     * Cancel a building version, killing the sandbox and marking it as cancelled.
     * @summary Cancel app version
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{appUuid}/versions/{version}/cancel')
    @OperationId('cancelAppVersion')
    async cancelAppVersion(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
        @Path() version: number,
    ): Promise<ApiCancelAppVersionResponse> {
        assertRegisteredAccount(req.account);
        await this.getAppGenerateService().cancelVersion(
            toSessionUser(req.account),
            projectUuid,
            appUuid,
            version,
        );
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Restore an earlier ready version by duplicating it into a new ready
     * version at the head of the timeline. Fast: no sandbox work, no rebuild —
     * a single DB insert plus an S3 server-side copy of the source tarball.
     * The preview iframe can serve the restored content immediately. The
     * next generation triggered after this call resets the sandbox working
     * tree from the restored tarball.
     * @summary Restore app version
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{appUuid}/versions/{version}/restore')
    @OperationId('restoreAppVersion')
    async restoreAppVersion(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
        @Path() version: number,
    ): Promise<ApiRestoreAppVersionResponse> {
        assertRegisteredAccount(req.account);
        const result = await this.getAppGenerateService().restoreVersion(
            toSessionUser(req.account),
            projectUuid,
            appUuid,
            version,
        );
        this.setStatus(200);
        return {
            status: 'ok',
            results: result,
        };
    }

    /**
     * Duplicate an existing app into a new personal app owned by the
     * requester. Latest ready version is copied; no sandbox is created.
     * @summary Duplicate app
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{appUuid}/duplicate')
    @OperationId('duplicateApp')
    async duplicateApp(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
    ): Promise<ApiDuplicateAppResponse> {
        assertRegisteredAccount(req.account);
        const result = await this.getAppGenerateService().duplicateApp(
            toSessionUser(req.account),
            projectUuid,
            appUuid,
        );
        this.setStatus(200);
        return {
            status: 'ok',
            results: result,
        };
    }

    /**
     * Preview what promoting this app into its upstream (production) project
     * will do: create a new production app or update the linked one, and which
     * space it will land in.
     * @summary Get data app promotion diff
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{appUuid}/promoteDiff')
    @OperationId('getAppPromoteDiff')
    async getAppPromoteDiff(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
    ): Promise<ApiPromoteAppDiffResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.getAppGenerateService().getPromoteAppDiff(
            toSessionUser(req.account),
            projectUuid,
            appUuid,
        );
        this.setStatus(200);
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Promote this app from a preview project into its upstream (production)
     * project. Snapshots the latest ready version as a new production version.
     * @summary Promote data app to production
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/{appUuid}/promote')
    @OperationId('promoteApp')
    async promoteApp(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
    ): Promise<ApiPromoteAppResponse> {
        assertRegisteredAccount(req.account);
        const results = await this.getAppGenerateService().promoteApp(
            toSessionUser(req.account),
            projectUuid,
            appUuid,
        );
        this.setStatus(200);
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Update an app's name and/or description.
     * @summary Update app
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Patch('/{appUuid}')
    @OperationId('updateApp')
    async updateApp(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
        @Body() body: ApiUpdateAppRequest,
    ): Promise<ApiUpdateAppResponse> {
        assertRegisteredAccount(req.account);
        const result = await this.getAppGenerateService().updateApp(
            toSessionUser(req.account),
            projectUuid,
            appUuid,
            body,
        );
        return {
            status: 'ok',
            results: result,
        };
    }

    /**
     * Delete an app. When soft delete is enabled, the app is marked as
     * deleted and can be restored via the admin flow. Otherwise the app
     * row, every version, and all S3 artifacts are permanently removed.
     * @summary Delete app
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Delete('/{appUuid}')
    @OperationId('deleteApp')
    async deleteApp(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
    ): Promise<ApiDeleteAppResponse> {
        assertRegisteredAccount(req.account);
        await this.getAppGenerateService().deleteApp(
            toSessionUser(req.account),
            projectUuid,
            appUuid,
        );
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Pin or unpin an app to the project homepage. Toggles the current state.
     * @summary Toggle app pinning
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Patch('/{appUuid}/pinning')
    @OperationId('toggleAppPinning')
    async toggleAppPinning(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
    ): Promise<ApiTogglePinnedItem> {
        assertRegisteredAccount(req.account);
        const result = await this.getAppGenerateService().togglePinning(
            toSessionUser(req.account),
            projectUuid,
            appUuid,
        );
        return {
            status: 'ok',
            results: result,
        };
    }

    /**
     * Mints a short-lived JWT for accessing an app version preview in an iframe.
     * @summary Get preview token
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{appUuid}/versions/{version}/preview-token')
    @OperationId('getAppPreviewToken')
    async getPreviewToken(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
        @Path() version: number,
    ): Promise<ApiPreviewTokenResponse> {
        assertRegisteredAccount(req.account);
        const token = await this.getAppGenerateService().getPreviewToken(
            toSessionUser(req.account),
            projectUuid,
            appUuid,
            version,
        );
        return {
            status: 'ok',
            results: { token },
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{appUuid}/images/{imageId}')
    @OperationId('getAppImageUrl')
    async getAppImageUrl(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
        @Path() imageId: string,
    ): Promise<ApiAppImageUrlResponse> {
        assertRegisteredAccount(req.account);
        const result = await this.getAppGenerateService().getImageUrl(
            toSessionUser(req.account),
            projectUuid,
            appUuid,
            imageId,
        );
        return {
            status: 'ok',
            results: result,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{appUuid}/thumbnail')
    @OperationId('uploadAppThumbnail')
    async uploadThumbnail(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        const mimeType = req.headers['content-type'];
        if (!mimeType) {
            throw new ParameterError('Content-Type header is required');
        }
        if (!req.headers['content-length']) {
            throw new ParameterError('Content-Length header is required');
        }
        const contentLength = parseInt(req.headers['content-length'], 10);
        if (Number.isNaN(contentLength) || contentLength <= 0) {
            throw new ParameterError(
                'Content-Length must be a positive integer',
            );
        }

        await this.getAppGenerateService().uploadThumbnail(
            toSessionUser(req.account),
            projectUuid,
            mimeType,
            req,
            contentLength,
            appUuid,
        );

        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{appUuid}/thumbnail')
    @OperationId('getAppThumbnailUrl')
    async getAppThumbnailUrl(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
    ): Promise<ApiAppThumbnailUrlResponse> {
        assertRegisteredAccount(req.account);
        const result = await this.getAppGenerateService().getThumbnailUrl(
            toSessionUser(req.account),
            projectUuid,
            appUuid,
        );
        return {
            status: 'ok',
            results: result,
        };
    }

    /**
     * List schedulers for a data app
     * @summary List app schedulers
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{appUuid}/schedulers')
    @OperationId('getAppSchedulers')
    async getAppSchedulers(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
    ): Promise<ApiAppSchedulersResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSchedulerService()
                .getAppSchedulers(toSessionUser(req.account), appUuid),
        };
    }

    /**
     * Create a scheduler for a data app
     * @summary Create app scheduler
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/{appUuid}/schedulers')
    @OperationId('createAppScheduler')
    async createAppScheduler(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Path() appUuid: string,
    ): Promise<ApiCreateAppSchedulerResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSchedulerService()
                .createAppScheduler(
                    toSessionUser(req.account),
                    appUuid,
                    req.body,
                ),
        };
    }

    protected getAppGenerateService() {
        return this.services.getAppGenerateService<AppGenerateService>();
    }
}

@Route('/api/v1/ee/user/apps')
@Hidden()
@Response<ApiErrorPayload>('default', 'Error')
export class UserAppsController extends BaseController {
    /**
     * List the current user's apps with pagination.
     * @summary List my apps
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('listMyApps')
    async listMyApps(
        @Request() req: express.Request,
        @Query() page?: number,
        @Query() pageSize?: number,
        @Query() excludePreviewProjects?: boolean,
    ): Promise<ApiMyAppsResponse> {
        assertRegisteredAccount(req.account);
        const result = await this.services
            .getAppGenerateService<AppGenerateService>()
            .listMyApps(
                toSessionUser(req.account),
                page && pageSize ? { page, pageSize } : undefined,
                { excludePreviewProjects },
            );
        return {
            status: 'ok',
            results: result,
        };
    }
}
