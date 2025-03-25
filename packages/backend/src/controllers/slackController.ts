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
        const analyticsUrl = `https://analytics.lightdash.cloud/projects/21eef0b9-5bae-40f3-851e-9554588e71a6/dashboards/c9364d94-1661-4623-be8b-2afcc8692f38?tempFilters=%7B%22dimensions%22%3A%5B%7B%22id%22%3A%22ac7cfa77-b208-4334-b3df-7e921f77cc53%22%2C%22operator%22%3A%22equals%22%2C%22target%22%3A%7B%22fieldId%22%3A%22projects_project_id%22%2C%22tableName%22%3A%22projects%22%2C%22fieldName%22%3A%22project_id%22%7D%2C%22tileTargets%22%3A%5B%5D%2C%22disabled%22%3Afalse%2C%22values%22%3A%5B%${projectUuid}%22%5D%7D%5D%2C%22metrics%22%3A%5B%5D%2C%22tableCalculations%22%3A%5B%5D%7D`;
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
*Project ID:* <${analyticsUrl}|${project?.projectUuid}>
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
        if (r.status !== 200) {
            console.error('Error sending slack message', await r.text());
        } else {
            console.log('Success sending slack message');
        }
    }
}
