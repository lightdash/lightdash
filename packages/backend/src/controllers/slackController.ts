import {
    ApiErrorPayload,
    ApiSlackChannelResponse,
    ApiSlackChannelsResponse,
    ApiSlackCustomSettingsResponse,
    ApiSlackGetInstallationResponse,
    ApiSuccessEmpty,
    assertRegisteredAccount,
    getErrorMessage,
    NotFoundError,
    OpenIdIdentityIssuerType,
    SlackAppCustomSettings,
} from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { ExpressReceiver } from '@slack/bolt';
import {
    Body,
    Delete,
    Get,
    Middlewares,
    OperationId,
    Path,
    Put,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { toSessionUser } from '../auth/account';
import Logger from '../logging/logger';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/slack')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Integrations')
export class SlackController extends BaseController {
    /**
     * Get slack channels
     * @summary Get Slack channels
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/channels')
    @OperationId('getSlackChannels')
    async get(
        @Request() req: express.Request,
        @Query() search?: string,
        @Query() excludeArchived?: boolean,
        @Query() excludeDms?: boolean,
        @Query() excludeGroups?: boolean,
        @Query() forceRefresh?: boolean,
        @Query() includeChannelIds?: string,
    ): Promise<ApiSlackChannelsResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSlackIntegrationService()
                .getChannels(toSessionUser(req.account), {
                    search,
                    excludeArchived,
                    excludeDms,
                    excludeGroups,
                    forceRefresh,
                    includeChannelIds: includeChannelIds
                        ? includeChannelIds.split(',').filter(Boolean)
                        : undefined,
                }),
        };
    }

    /**
     * Look up a single Slack channel by ID. Used for on-demand fetching when
     * user pastes a channel ID not in the cache.
     * @summary Lookup channel
     * @param req express request
     * @param channelId Slack channel ID (e.g., C01234567)
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/channels/{channelId}')
    @OperationId('getSlackChannelById')
    async getChannelById(
        @Request() req: express.Request,
        @Path() channelId: string,
    ): Promise<ApiSlackChannelResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSlackIntegrationService()
                .lookupChannelById(toSessionUser(req.account), channelId),
        };
    }

    /**
     * Update slack notification channel to send notifications to scheduled jobs fail
     * @summary Update Slack custom settings
     * @param req express request
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Put('/custom-settings')
    @OperationId('UpdateCustomSettings')
    async updateCustomSettings(
        @Request() req: express.Request,
        @Body() body: SlackAppCustomSettings,
    ): Promise<ApiSlackCustomSettingsResponse> {
        assertRegisteredAccount(req.account);
        await this.services
            .getSlackIntegrationService()
            .updateAppCustomSettings(toSessionUser(req.account), body);

        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Check if the user has an OpenID identity for Slack
     * @summary Check Slack OpenID link status
     * @param req express request
     */
    @Middlewares([isAuthenticated])
    @Get('/is-authenticated')
    @OperationId('IsSlackOpenIdLinked')
    async isSlackOpenIdLinked(
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        // This will throw a 404 if not found
        await req.services
            .getUserService()
            .isOpenIdLinked(
                toSessionUser(req.account).userUuid,
                OpenIdIdentityIssuerType.SLACK,
            );

        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Get Slack installation details for the organization
     * @summary Get Slack installation
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('getSlackInstallation')
    async getInstallation(
        @Request() req: express.Request,
    ): Promise<ApiSlackGetInstallationResponse> {
        assertRegisteredAccount(req.account);
        return {
            status: 'ok',
            results: await this.services
                .getSlackIntegrationService()
                .getInstallationFromOrganizationUuid(
                    toSessionUser(req.account),
                ),
        };
    }

    /**
     * Get a Slack image by nanoId
     * @summary Get Slack image
     */
    @SuccessResponse('200', 'Success')
    @Get('/image/:nanoId')
    @OperationId('getSlackImage')
    async getImage(@Request() req: express.Request): Promise<Readable> {
        const { nanoId } = req.params;
        const { path: filePath } = await req.services
            .getDownloadFileService()
            .getDownloadFile(nanoId);
        const filename = path.basename(filePath);
        const normalizedPath = path.resolve('/tmp/', filename);
        if (!normalizedPath.startsWith('/tmp/')) {
            throw new NotFoundError(`File not found ${filename}`);
        }
        if (!fs.existsSync(normalizedPath)) {
            throw new NotFoundError(`File not found: ${filename}`);
        }

        this.setHeader('Content-Type', 'image/png');
        this.setHeader('Content-Disposition', `inline; filename="${filename}"`);

        return fs.createReadStream(normalizedPath);
    }

    /**
     * Get a Slack unfurl preview image via redirect to a fresh signed URL.
     * Falls back to a placeholder image if the preview is not found.
     * @summary Get Slack preview
     */
    @SuccessResponse('302', 'Redirect')
    @Get('/preview/{id}')
    @OperationId('getSlackPreview')
    async getPreview(
        @Path() id: string,
        @Request() req: express.Request,
    ): Promise<void> {
        const NANOID_REGEX = /^[\w-]{21}$/;

        this.setHeader('Cache-Control', 'no-store');
        this.setHeader('X-Robots-Tag', 'noindex, nofollow');

        if (!NANOID_REGEX.test(id)) {
            await SlackController.sendPlaceholder(req.res!);
            return;
        }

        try {
            const signedUrl = await this.services
                .getUnfurlService()
                .getPreviewSignedUrl(id);

            this.setStatus(302);
            this.setHeader('Location', signedUrl);
        } catch (e) {
            if (e instanceof NotFoundError) {
                Logger.info(
                    `Slack unfurl preview miss, serving placeholder: ${id}`,
                );
            } else {
                Logger.error(
                    `Slack unfurl preview failed, serving placeholder: ${id} ${getErrorMessage(
                        e,
                    )}`,
                );
                Sentry.captureException(e, {
                    tags: { feature: 'slack-unfurl-preview' },
                    extra: { previewId: id },
                });
            }
            await SlackController.sendPlaceholder(req.res!);
        }
    }

    private static sendPlaceholder(res: express.Response): Promise<void> {
        return new Promise((resolve, reject) => {
            const placeholderPath = path.resolve(
                __dirname,
                '../services/UnfurlService/assets/slack-unfurl-placeholder.png',
            );
            res.status(200);
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Cache-Control', 'public, max-age=300');
            res.setHeader('X-Robots-Tag', 'noindex, nofollow');
            const stream = fs.createReadStream(placeholderPath);
            stream.on('error', reject);
            stream.pipe(res).on('finish', resolve);
        });
    }

    /**
     * Delete the Slack installation for the organization
     * @summary Delete Slack installation
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('200', 'Success')
    @Delete('/')
    @OperationId('deleteSlackInstall')
    async deleteInstallation(
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        await this.services
            .getSlackIntegrationService()
            .deleteInstallationFromOrganizationUuid(req.account!);

        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Start the Slack installation flow
     * @summary Install Slack
     */
    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('200', 'Success')
    @Get('/install')
    @OperationId('installSlack')
    async installSlack(@Request() req: express.Request): Promise<void> {
        assertRegisteredAccount(req.account);
        try {
            const { slackOptions, metadata } = await this.services
                .getSlackIntegrationService()
                .getSlackInstallOptions(toSessionUser(req.account));

            const slackReceiver = new ExpressReceiver(slackOptions);
            await slackReceiver.installer?.handleInstallPath(
                req,
                req.res!,
                {},
                {
                    redirectUri: slackOptions.redirectUri,
                    scopes: slackOptions.scopes,
                    userScopes: slackOptions.installerOptions.userScopes,
                    metadata: JSON.stringify(metadata),
                },
            );
        } catch (error) {
            await this.services
                .getSlackIntegrationService()
                .trackInstallError(toSessionUser(req.account), error);
            throw error;
        }
    }
}
