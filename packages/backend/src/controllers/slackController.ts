import {
    ApiErrorPayload,
    ApiSlackChannelsResponse,
    ApiSlackCustomSettingsResponse,
    ForbiddenError,
    SessionUser,
    SlackAppCustomSettings,
} from '@lightdash/common';
import {
    Body,
    Get,
    Middlewares,
    OperationId,
    Post,
    Put,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { nanoid } from 'nanoid';
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
        @Query() forceRefresh?: boolean,
    ): Promise<ApiSlackChannelsResponse> {
        this.setStatus(200);
        const organizationUuid = req.user?.organizationUuid;
        if (!organizationUuid) throw new ForbiddenError();
        return {
            status: 'ok',
            results: await req.clients
                .getSlackClient()
                .getChannels(organizationUuid, search, {
                    excludeArchived,
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
        this.setStatus(200);
        const organizationUuid = req.user?.organizationUuid;
        if (!organizationUuid) throw new ForbiddenError();
        return {
            status: 'ok',
            results: await req.clients
                .getSlackClient()
                .updateAppCustomSettings(
                    `${req.user?.firstName} ${req.user?.lastName}`,
                    organizationUuid,
                    body,
                ),
        };
    }

    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/share-support')
    @OperationId('ReportError')
    async shareSupport(
        @Request() req: express.Request,
        @Body() body: { image: string; description?: string },
    ): Promise<void> {
        this.setStatus(200);
        const base64Data = body.image.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        const imageUrl = await req.clients
            .getS3Client()
            .uploadImage(buffer, nanoid());
        console.log('image uploaded', imageUrl);

        const user = req.user as SessionUser;
        const { headers } = req;
        const organization = await this.services
            .getOrganizationService()
            .get(user);
        // Extract /project/<uuid> from referer
        const projectUuid = headers.referer
            ?.split('/projects/')[1]
            ?.split('/')[0];
        const project = projectUuid
            ? await this.services
                  .getProjectService()
                  .getProject(projectUuid, user)
            : undefined;

        const googleLogsUrl = 'https://console.cloud.google.com/logs/query';
        const blocks = {
            channel: '#test-slackbot-3',
            text: `New error report from: *${user?.firstName} ${user?.lastName} - ${organization.name}*`,
            blocks: [
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `New error report from: *${user?.firstName} ${user?.lastName} - ${organization.name}*`,
                    },
                },
                {
                    type: 'divider',
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        text: `*Description:* ${body.description}`,
                    },
                },
                {
                    type: 'section',
                    fields: [
                        {
                            type: 'mrkdwn',
                            text: `*User ID:* ${user.userUuid}
*Organization role:* ${user.role}
*Organization ID:* ${organization.organizationUuid} 
*Lightdash version:* ${headers['lightdash-version']}
*URL:* <${headers.referer}|${headers.origin}>
*Sentry trace ID:* <https://lightdash.sentry.io/traces/trace/${headers['sentry-trace']}|View trace> 
*User agent:* ${headers['user-agent']}
*Project ID:* ${project?.projectUuid}
*Project name:* ${project?.name}
*Google logs:* <${googleLogsUrl}|View logs>`,
                        },
                    ],
                },
                {
                    type: 'image',
                    title: {
                        type: 'plain_text',
                        text: 'Screenshot',
                        emoji: false,
                    },
                    image_url: imageUrl,
                    alt_text: 'screenshot',
                },
            ],
        };

        console.log('blocks', JSON.stringify(blocks, null, 2));

        const slackUrl = process.env.SLACK_SUPPORT_URL || '';
        const r = await fetch(slackUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(blocks),
        });
        console.log('r', r);
        console.log('r', await r.json());
    }
}
