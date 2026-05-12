import {
    AnyType,
    assertUnreachable,
    friendlyName,
    GoogleChatError,
    operatorActionValue,
    PartialFailureType,
    sanitizeHtml,
    ThresholdOptions,
    type PartialFailure,
} from '@lightdash/common';
import Logger from '../../logging/logger';
import { AttachmentUrl } from '../EmailClient/EmailClient';

/* eslint-disable class-methods-use-this */
export class GoogleChatClient {
    private async sendWebhook(webhookUrl: string, payload: AnyType) {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=UTF-8',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const responseText = await response.text();
            Logger.error(
                `Google Chat webhook returned an error: ${response.status} ${responseText}`,
            );
            Logger.debug(
                `Google Chat webhook payload ${JSON.stringify(
                    payload,
                    null,
                    2,
                )}`,
            );

            throw new GoogleChatError(`Google Chat webhook returned an error`);
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
        Logger.info('Sending image to Google Chat via webhook');

        const widgets: AnyType[] = [
            {
                image: {
                    imageUrl: image,
                    altText: name,
                    onClick: {
                        openLink: { url: image },
                    },
                },
            },
        ];

        if (description !== undefined) {
            widgets.push({
                textParagraph: {
                    text: description,
                },
            });
        }

        if (thresholds.length > 0) {
            const thresholdText = thresholds
                .map(
                    (threshold) =>
                        `- <b>${friendlyName(
                            threshold.fieldId,
                        )}</b> ${operatorActionValue(
                            threshold.operator,
                            threshold.value,
                            '<b>',
                        ).replace(/<b>([^<]*)<b>/, '<b>$1</b>')}`,
                )
                .join('\n');

            widgets.push({
                textParagraph: {
                    text: `Your results for this chart triggered the following alerts:\n${thresholdText}`,
                },
            });
        }

        widgets.push({
            textParagraph: {
                text: footer,
            },
        });

        const buttons: AnyType[] = [
            {
                text: 'Open in Lightdash',
                onClick: {
                    openLink: { url: ctaUrl },
                },
            },
        ];

        if (pdfUrl) {
            buttons.push({
                text: 'Download PDF',
                onClick: {
                    openLink: { url: pdfUrl },
                },
            });
        }

        widgets.push({
            buttonList: { buttons },
        });

        const payload = {
            cardsV2: [
                {
                    cardId: 'lightdash-scheduled-delivery',
                    card: {
                        header: {
                            title,
                            subtitle: name,
                        },
                        sections: [{ widgets }],
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
        Logger.info('Sending chart CSV to Google Chat via webhook');

        const widgets: AnyType[] = [];

        if (description !== undefined) {
            widgets.push({
                textParagraph: {
                    text: description,
                },
            });
        }

        widgets.push({
            textParagraph: {
                text: footer,
            },
        });

        widgets.push({
            buttonList: {
                buttons: [
                    {
                        text: 'Download results',
                        onClick: {
                            openLink: { url: csvUrl.path },
                        },
                    },
                    {
                        text: 'Open in Lightdash',
                        onClick: {
                            openLink: { url: ctaUrl },
                        },
                    },
                ],
            },
        });

        const payload = {
            cardsV2: [
                {
                    cardId: 'lightdash-scheduled-delivery',
                    card: {
                        header: {
                            title,
                            subtitle: name,
                        },
                        sections: [{ widgets }],
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
        failures,
    }: {
        webhookUrl: string;
        title: string;
        name: string;
        description: string | undefined;
        ctaUrl: string;
        csvUrls: AttachmentUrl[];
        footer: string;
        failures?: PartialFailure[];
    }): Promise<void> {
        Logger.info('Sending dashboard CSVs to Google Chat via webhook');

        const widgets: AnyType[] = [];

        if (description !== undefined) {
            widgets.push({
                textParagraph: {
                    text: description,
                },
            });
        }

        if (csvUrls.length > 0) {
            const downloadLinks = csvUrls
                .map(
                    (csvUrl) =>
                        `- <a href="${csvUrl.path}">${csvUrl.filename}</a>`,
                )
                .join('\n');
            widgets.push({
                textParagraph: {
                    text: `Download results:\n${downloadLinks}`,
                },
            });
        }

        if (failures && failures.length > 0) {
            const allChartsFailed = csvUrls.length === 0;
            const failureLines = failures
                .map((f) => {
                    switch (f.type) {
                        case PartialFailureType.DASHBOARD_CHART:
                        case PartialFailureType.DASHBOARD_SQL_CHART:
                            return `- <b>${f.chartName}:</b> ${f.error}`;
                        case PartialFailureType.MISSING_TARGETS:
                            return `- <b>No targets found for this scheduled delivery</b>`;
                        default:
                            return assertUnreachable(
                                f,
                                'Unknown partial failure type',
                            );
                    }
                })
                .join('\n');

            if (allChartsFailed) {
                widgets.push({
                    textParagraph: {
                        text: `❌ <b>Error: All charts in this scheduled delivery failed to export</b>\nNo data could be exported from this dashboard. Please check the errors below and verify your data model.\n${failureLines}`,
                    },
                });
            } else {
                widgets.push({
                    textParagraph: {
                        text: `⚠️ <b>Warning:</b> ${failures.length} chart(s) failed to export\n${failureLines}`,
                    },
                });
            }
        }

        widgets.push({
            textParagraph: {
                text: footer,
            },
        });

        widgets.push({
            buttonList: {
                buttons: [
                    {
                        text: 'Open in Lightdash',
                        onClick: {
                            openLink: { url: ctaUrl },
                        },
                    },
                ],
            },
        });

        const payload = {
            cardsV2: [
                {
                    cardId: 'lightdash-scheduled-delivery',
                    card: {
                        header: {
                            title,
                            subtitle: name,
                        },
                        sections: [{ widgets }],
                    },
                },
            ],
        };

        await this.sendWebhook(webhookUrl, payload);
    }

    async postDeliveryFailureNotificationToRecipient({
        webhookUrl,
        contentName,
        contactSentence,
    }: {
        webhookUrl: string;
        contentName: string | null;
        contactSentence: string | null;
    }): Promise<void> {
        // Google Chat renders a subset of HTML in textParagraph.text, so
        // strip any markup from admin-supplied strings before interpolating
        // into the template (which uses static <b> tags around contentName).
        const safeContentName = contentName
            ? sanitizeHtml(contentName, {
                  allowedTags: [],
                  allowedAttributes: {},
              })
            : null;
        const safeContactSentence = contactSentence
            ? sanitizeHtml(contactSentence, {
                  allowedTags: [],
                  allowedAttributes: {},
              })
            : null;
        const baseSentence = safeContentName
            ? `The scheduled delivery for <b>"${safeContentName}"</b> failed to run, and the delivery owner has been notified.`
            : 'A scheduled delivery failed to run, and the delivery owner has been notified.';
        const appended = safeContactSentence ? ` ${safeContactSentence}` : '';

        const payload = {
            cardsV2: [
                {
                    cardId: 'lightdash-scheduled-delivery-failure',
                    card: {
                        header: {
                            title: 'Scheduled delivery failure',
                            ...(safeContentName && {
                                subtitle: safeContentName,
                            }),
                        },
                        sections: [
                            {
                                widgets: [
                                    {
                                        textParagraph: {
                                            text: `${baseSentence}${appended}`,
                                        },
                                    },
                                ],
                            },
                        ],
                    },
                },
            ],
        };

        await this.sendWebhook(webhookUrl, payload);
    }
}
