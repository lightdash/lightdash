import {
    ForbiddenError,
    NotFoundError,
    SlackSettings,
} from '@lightdash/common';
import { ExpressReceiver } from '@slack/bolt';
import express from 'express';
import * as fs from 'fs';
import path from 'path';
import { analytics } from '../analytics/client';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { slackOptions } from '../clients/Slack/SlackOptions';
import {
    deleteInstallationFromOrganizationUuid,
    getInstallationFromOrganizationUuid,
} from '../clients/Slack/SlackStorage';
import {
    isAuthenticated,
    unauthorisedInDemo,
} from '../controllers/authentication';

export const slackRouter = express.Router({ mergeParams: true });

slackRouter.get(
    '/',
    isAuthenticated,
    unauthorisedInDemo,

    async (req, res, next) => {
        try {
            const organizationUuid = req.user?.organizationUuid;
            if (!organizationUuid) throw new ForbiddenError();
            const slackAuth = await getInstallationFromOrganizationUuid(
                organizationUuid,
            );
            const response: SlackSettings = {
                organizationUuid,
                slackTeamName: slackAuth.installation?.team?.name || 'Slack',
                createdAt: slackAuth.createdAt,
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
        if (!req.params.imageId.startsWith('slack-image')) {
            throw new NotFoundError(`File not found ${req.params.imageId}`);
        }
        try {
            const filePath = path.join('/tmp', req.params.imageId);
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
            const organizationUuid = req.user?.organizationUuid;
            if (!organizationUuid) throw new ForbiddenError();
            await deleteInstallationFromOrganizationUuid(organizationUuid);

            res.json({
                status: 'ok',
            });
        } catch (error) {
            next(error);
        }
    },
);

slackRouter.get(
    '/install/:organizationUuid',
    isAuthenticated,
    unauthorisedInDemo,

    async (req, res, next) => {
        try {
            const metadata = {
                organizationUuid: req.params.organizationUuid,
                userId: req.user?.userId,
            };
            const options = {
                redirectUri: slackOptions.redirectUri,
                scopes: slackOptions.scopes,
                userScopes: ['files:write'],
                metadata: JSON.stringify(metadata),
            };
            analytics.track({
                event: 'share_slack.install',
                userId: req.user?.userUuid,
                anonymousId: !req.user?.userUuid
                    ? LightdashAnalytics.anonymousId
                    : undefined,
                properties: {
                    organizationUuid: req.params.organizationUuid,
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
