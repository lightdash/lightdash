import {
    ApiErrorPayload,
    ApiSlackChannelsResponse,
    ApiSlackCustomSettingsResponse,
    ForbiddenError,
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
        @Body() body: { image: string },
    ): Promise<void> {
        this.setStatus(200);
        const base64Data = body.image.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');

        const imageUrl = await req.clients
            .getS3Client()
            .uploadImage(buffer, nanoid());
        console.log('image uploaded', imageUrl);
        const blocks = {
            // "channel": "#test-slackbot-3",
            text: `${req.user?.firstName} ${req.user?.lastName} Shared an error`,
            blocks: [
                /* {
                    "type": "section",
                    "text": {
                        "type": "mrkdwn",
                        "text": `${JSON.stringify(req.headers)}`
                    }
                },
                {
                    "type": "section",
                    "block_id": "section567",
                    "text": {
                        "type": "mrkdwn",
                        "text": "Error screenshot"
                    },
                    "accessory": {
                        "type": "image",
                        "image_url": imageUrl,
                        "alt_text": "error screenshot"
                    }
                }, */
                {
                    type: 'image',
                    title: {
                        type: 'plain_text',
                        text: 'Screenshot',
                    },
                    block_id: 'image4',
                    image_url: imageUrl,
                    alt_text: 'Error report.',
                },
                {
                    type: 'section',
                    text: {
                        type: 'mrkdwn',
                        // "text": `${JSON.stringify(req.headers)}`
                        text: `${req.user?.firstName} ${req.user?.lastName} Shared an error`,
                    },
                },
            ],
        };
        const r = await fetch(
            'https://hooks.slack.com/services/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',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(blocks),
            },
        );
        console.log('r', r);
    }
}
