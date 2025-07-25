import {
    ApiErrorPayload,
    ApiSlackChannelsResponse,
    ApiSlackCustomSettingsResponse,
    ApiSlackGetInstallationResponse,
    ApiSuccessEmpty,
    NotFoundError,
    OpenIdIdentityIssuerType,
    SlackAppCustomSettings,
} from '@lightdash/common';
import { ExpressReceiver } from '@slack/bolt';
import {
    Body,
    Delete,
    Get,
    Middlewares,
    OperationId,
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
    ): Promise<ApiSlackChannelsResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSlackIntegrationService()
                .getChannels(req.user!, {
                    search,
                    excludeArchived,
                    excludeDms,
                    excludeGroups,
                    forceRefresh,
                }),
        };
    }

    /**
     * Update slack notification channel to send notifications to scheduled jobs fail
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
        await this.services
            .getSlackIntegrationService()
            .updateAppCustomSettings(req.user!, body);

        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Check if the user has an OpenID identity for Slack
     * @param req express request
     */
    @Middlewares([isAuthenticated])
    @Get('/is-authenticated')
    @OperationId('IsSlackOpenIdLinked')
    async isSlackOpenIdLinked(
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);

        // This will throw a 404 if not found
        await req.services
            .getUserService()
            .isOpenIdLinked(
                req.user?.userUuid!,
                OpenIdIdentityIssuerType.SLACK,
            );

        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('getSlackInstallation')
    async getInstallation(
        @Request() req: express.Request,
    ): Promise<ApiSlackGetInstallationResponse> {
        return {
            status: 'ok',
            results: await this.services
                .getSlackIntegrationService()
                .getInstallationFromOrganizationUuid(req.user!),
        };
    }

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

    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('200', 'Success')
    @Delete('/')
    @OperationId('deleteSlackInstall')
    async deleteInstallation(
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        await this.services
            .getSlackIntegrationService()
            .deleteInstallationFromOrganizationUuid(req.user!);

        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Middlewares([isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('200', 'Success')
    @Get('/install')
    @OperationId('installSlack')
    async installSlack(@Request() req: express.Request): Promise<void> {
        try {
            const { slackOptions, metadata } = await this.services
                .getSlackIntegrationService()
                .getSlackInstallOptions(req.user!);

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
                .trackInstallError(req.user!, error);
            throw error;
        }
    }
}
