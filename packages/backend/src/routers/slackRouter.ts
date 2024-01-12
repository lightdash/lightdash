import {
    ForbiddenError,
    NotFoundError,
    SlackSettings,
} from '@lightdash/common';
import { ExpressReceiver } from '@slack/bolt';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { analytics } from '../analytics/client';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { slackOptions } from '../clients/Slack/SlackOptions';
import {
    isAuthenticated,
    unauthorisedInDemo,
} from '../controllers/authentication';
import { slackAuthenticationModel } from '../models/models';
import { UnfurlService } from '../services/UnfurlService/UnfurlService';

export const slackRouter = express.Router({ mergeParams: true });

slackRouter.get(
    '/',
    isAuthenticated,
    unauthorisedInDemo,

    async (req, res, next) => {
        try {
            const organizationUuid = req.user?.organizationUuid;
            if (!organizationUuid) throw new ForbiddenError();
            const slackAuth =
                await slackAuthenticationModel.getInstallationFromOrganizationUuid(
                    organizationUuid,
                );
            if (slackAuth === undefined) {
                res.status(404).send(
                    `Could not find an installation for organizationUuid ${organizationUuid}`,
                );
                return;
            }
            const response: SlackSettings = {
                organizationUuid,
                slackTeamName: slackAuth.slackTeamName,
                createdAt: slackAuth.createdAt,
                scopes: slackAuth.scopes,
                notificationChannel: slackAuth.notificationChannel,
            };
            res.json({
                status: 'ok',
                results: response,
            });
        } catch (error) {
            next(error);
        }
    },
);

slackRouter.get(
    '/image/:imageId',

    async (req, res, next) => {
        try {
            const { imageId } = req.params;
            if (!UnfurlService.isValidImageFileId(imageId)) {
                throw new NotFoundError(
                    `Slack image not found ${req.params.imageId}`,
                );
            }
            const sanitizedImageId = path.normalize(imageId);

            const filePath = path.join('/tmp', sanitizedImageId);
            if (!fs.existsSync(filePath)) {
                const error = `This file ${imageId} doesn't exist on this server, this may be happening if you are running multiple containers or because files are not persisted. You can check out our docs to learn more on how to enable cloud storage: https://docs.lightdash.com/self-host/customize-deployment/configure-lightdash-to-use-external-object-storage`;
                throw new NotFoundError(error);
            }
            res.sendFile(filePath);
        } catch (error) {
            next(error);
        }
    },
);

slackRouter.delete(
    '/',
    isAuthenticated,
    unauthorisedInDemo,

    async (req, res, next) => {
        try {
            analytics.track({
                event: 'share_slack.delete',
                userId: req.user?.userUuid,
                properties: {
                    organizationId: req.params.organizationUuid,
                },
            });

            const organizationUuid = req.user?.organizationUuid;
            if (!organizationUuid) throw new ForbiddenError();
            await slackAuthenticationModel.deleteInstallationFromOrganizationUuid(
                organizationUuid,
            );

            res.json({
                status: 'ok',
            });
        } catch (error) {
            next(error);
        }
    },
);

slackRouter.get(
    '/install/',
    isAuthenticated,
    unauthorisedInDemo,

    async (req, res, next) => {
        try {
            const metadata = {
                organizationUuid: req.user?.organizationUuid,
                userId: req.user?.userId,
            };
            const options = {
                redirectUri: slackOptions.redirectUri,
                scopes: slackOptions.scopes,
                userScopes: slackOptions.installerOptions.userScopes,
                metadata: JSON.stringify(metadata),
            };
            analytics.track({
                event: 'share_slack.install',
                userId: req.user?.userUuid,
                properties: {
                    organizationId: req.params.organizationUuid,
                },
            });

            const slackReceiver = new ExpressReceiver(slackOptions);

            await slackReceiver.installer?.handleInstallPath(
                req,
                res,
                {},
                options,
            );
        } catch (error) {
            analytics.track({
                event: 'share_slack.install_error',
                userId: req.user?.userUuid,
                anonymousId: !req.user?.userUuid
                    ? LightdashAnalytics.anonymousId
                    : undefined,
                properties: {
                    error: `${error}`,
                },
            });
            next(error);
        }
    },
);
