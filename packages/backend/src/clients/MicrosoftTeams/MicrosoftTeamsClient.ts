import { MissingConfigError } from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';

type MicrosoftTeamsClientArguments = {
    lightdashConfig: LightdashConfig;
};

export type PostMicrosoftTeamsFile = {
    organizationUuid: string;
    channelId: string;
    file: Buffer;
    title: string;
    comment?: string;
    filename: string;
    fileType?: string;
};

export class MicrosoftTeamsClient {
    lightdashConfig: LightdashConfig;

    constructor({ lightdashConfig }: MicrosoftTeamsClientArguments) {
        this.lightdashConfig = lightdashConfig;
    }

    async postImageWithWebhook({
        webhookUrl,
        title,
        name,
        description,
        ctaUrl,
        image,
        footer,
    }: {
        webhookUrl: string;
        title: string;
        name: string;
        description: string | undefined;
        ctaUrl: string;
        image: string;
        footer: string;
    }): Promise<void> {
        if (!this.lightdashConfig.microsoftTeams.enabled) {
            throw new MissingConfigError('Microsoft Teams is not enabled');
        }
        console.info('Sending image to Microsoft Teams via webhook');

        // https://adaptivecards.io/explorer/
        const payload = {
            type: 'message',
            attachments: [
                {
                    contentType: 'application/vnd.microsoft.card.adaptive',
                    contentUrl: null,
                    content: {
                        $schema:
                            'http://adaptivecards.io/schemas/adaptive-card.json',
                        type: 'AdaptiveCard',
                        version: '1.2',
                        body: [
                            {
                                type: 'TextBlock',
                                text: title,
                                weight: 'bolder',
                                size: 'medium',
                            },

                            {
                                type: 'TextBlock',
                                text: name,
                            },
                            ...(description !== undefined
                                ? [
                                      {
                                          type: 'TextBlock',
                                          text: description,
                                          isSubtle: true,
                                          spacing: 'none',
                                      },
                                  ]
                                : []),
                            {
                                type: 'Image',
                                url: image,
                                size: 'Stretch',
                                altText: 'Lightdash chart',
                                selectAction: {
                                    type: 'Action.OpenUrl',
                                    tooltip: 'See image',
                                    url: image,
                                },
                            },
                            {
                                type: 'TextBlock',
                                text: footer,
                                isSubtle: true,
                                size: 'small',
                                wrap: true,
                            },
                        ],
                        actions: [
                            {
                                type: 'Action.OpenUrl',
                                title: 'Open in Lightdash',
                                url: ctaUrl,
                            },
                        ],
                    },
                },
            ],
        };

        const response = await fetch(webhookUrl, {
            method: 'POST',
            body: JSON.stringify(payload),
        });

        const responseText = await response.text();
        if (response.status !== 200 || responseText.includes('error')) {
            console.error(
                `Microsoft teams webhook returned an error: ${response.status} ${responseText}`,
            );
            console.info(
                `Microsoft teams webhook payload ${JSON.stringify(
                    payload,
                    null,
                    2,
                )}`,
            );

            throw new Error(`Microsoft teams webhook returned an error`);
        }
    }
}
