import {
    AnyType,
    friendlyName,
    MissingConfigError,
    MsTeamsError,
    operatorActionValue,
    ThresholdOptions,
} from '@lightdash/common';
import { LightdashConfig } from '../../config/parseConfig';
import Logger from '../../logging/logger';
import { AttachmentUrl } from '../EmailClient/EmailClient';

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

    private async sendWebhook(webhookUrl: string, payload: AnyType) {
        if (!this.lightdashConfig.microsoftTeams.enabled) {
            throw new MissingConfigError('Microsoft Teams is not enabled');
        }
        const response = await fetch(webhookUrl, {
            method: 'POST',
            body: JSON.stringify(payload),
        });

        const responseText = await response.text();
        if (response.status !== 200 || responseText.includes('error')) {
            Logger.error(
                `Microsoft teams webhook returned an error: ${response.status} ${responseText}`,
            );
            Logger.info(
                `Microsoft teams webhook payload ${JSON.stringify(
                    payload,
                    null,
                    2,
                )}`,
            );

            throw new MsTeamsError(`Microsoft teams webhook returned an error`);
        }
    }

    async postImageWithWebhook({
        webhookUrl,
        title,
        name,
        description,
        ctaUrl,
        image,
        footer,
        pdfUrl,
        thresholds = [],
    }: {
        webhookUrl: string;
        title: string;
        name: string;
        description: string | undefined;
        ctaUrl: string;
        image: string;
        footer: string;
        pdfUrl?: string;

        thresholds?: ThresholdOptions[];
    }): Promise<void> {
        if (!this.lightdashConfig.microsoftTeams.enabled) {
            throw new MissingConfigError('Microsoft Teams is not enabled');
        }
        Logger.info('Sending image to Microsoft Teams via webhook');

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
                            ...(thresholds.length > 0
                                ? [
                                      {
                                          type: 'TextBlock',
                                          text: `Your results for this chart triggered the following alerts:`,
                                      },
                                      {
                                          type: 'TextBlock',
                                          text: thresholds
                                              .map(
                                                  (threshold) =>
                                                      `- **${friendlyName(
                                                          threshold.fieldId,
                                                      )}** ${operatorActionValue(
                                                          threshold.operator,
                                                          threshold.value,
                                                          '**',
                                                      )}`,
                                              )
                                              .join('\n'),
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
                            ...(pdfUrl
                                ? [
                                      {
                                          type: 'Action.OpenUrl',
                                          title: 'Download PDF',
                                          url: pdfUrl,
                                      },
                                  ]
                                : []),
                        ],
                    },
                },
            ],
        };

        await this.sendWebhook(webhookUrl, payload);
    }

    async postCsvWithWebhook({
        webhookUrl,
        title,
        name,
        description,
        ctaUrl,
        csvUrl,
        footer,
    }: {
        webhookUrl: string;
        title: string;
        name: string;
        description: string | undefined;
        ctaUrl: string;
        csvUrl: AttachmentUrl;
        footer: string;
    }): Promise<void> {
        if (!this.lightdashConfig.microsoftTeams.enabled) {
            throw new MissingConfigError('Microsoft Teams is not enabled');
        }
        Logger.info(`Sending chart CSV to Microsoft Teams via webhook`);

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
                                title: 'Download results',
                                url: csvUrl.path,
                            },
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
        await this.sendWebhook(webhookUrl, payload);
    }

    async postCsvsWithWebhook({
        webhookUrl,
        title,
        name,
        description,
        ctaUrl,
        csvUrls,
        footer,
    }: {
        webhookUrl: string;
        title: string;
        name: string;
        description: string | undefined;
        ctaUrl: string;
        csvUrls: AttachmentUrl[];
        footer: string;
    }): Promise<void> {
        if (!this.lightdashConfig.microsoftTeams.enabled) {
            throw new MissingConfigError('Microsoft Teams is not enabled');
        }
        Logger.info(`Sending chart CSV to Microsoft Teams via webhook`);

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
                                type: 'TextBlock',
                                text: 'Download results:',
                            },
                            ...csvUrls.map((csvUrl) => ({
                                type: 'TextBlock',
                                text: `- [${csvUrl.filename}](${csvUrl.path})`,
                                isSubtle: true,
                                spacing: 'none',
                            })),
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
        await this.sendWebhook(webhookUrl, payload);
    }
}
