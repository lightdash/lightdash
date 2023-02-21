import { Unfurl } from '../../services/UnfurlService/UnfurlService';
import { AttachmentUrl } from '../EmailClient/EmailClient';

export const unfurlChartAndDashboard = (
    originalUrl: string,
    unfurl: Unfurl,
    withoutUrl?: boolean,
): any => {
    const blocks = [
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: unfurl.title,
            },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `${unfurl.description || '-'}`,
            },
            accessory: {
                type: 'button',
                text: {
                    type: 'plain_text',
                    text: 'Open in Lightdash',
                    emoji: true,
                },
                url: originalUrl,
                action_id: 'button-action',
            },
        },
    ];

    const imageBlock = unfurl.imageUrl && {
        type: 'image',
        image_url: unfurl.imageUrl,
        alt_text: unfurl.title,
    };

    if (withoutUrl) {
        return imageBlock ? [...blocks, imageBlock] : blocks;
    }

    return {
        [originalUrl]: {
            blocks: imageBlock ? [...blocks, imageBlock] : blocks,
        },
    };
};

export const unfurlChartCsvResults = (
    title: string,
    description: string | undefined,
    originalUrl: string,
    csvUrl: string,
): any => {
    const blocks = [
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: title,
            },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `${description || '-'}`,
            },
            accessory: {
                type: 'button',
                text: {
                    type: 'plain_text',
                    text: 'Open in Lightdash',
                    emoji: true,
                },
                url: originalUrl,
                action_id: 'button-action',
            },
        },
        {
            type: 'actions',
            elements: [
                {
                    type: 'button',
                    text: {
                        type: 'plain_text',
                        text: 'Download results',
                        emoji: true,
                    },
                    url: csvUrl,
                    action_id: 'download-results',
                },
            ],
        },
    ];

    return blocks;
};

export const unfurlDashboardCsvResults = (
    title: string,
    description: string | undefined,
    originalUrl: string,
    csvUrls: AttachmentUrl[],
): any => {
    const blocks = [
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: title,
            },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `${description || '-'}`,
            },
            accessory: {
                type: 'button',
                text: {
                    type: 'plain_text',
                    text: 'Open in Lightdash',
                    emoji: true,
                },
                url: originalUrl,
                action_id: 'button-action',
            },
        },

        ...csvUrls.map((csvUrl, index) => ({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `:black_small_square: ${csvUrl.filename}`,
            },
            accessory: {
                type: 'button',
                text: {
                    type: 'plain_text',
                    text: 'Download results',
                    emoji: true,
                },
                url: csvUrl.path,
                action_id: `download-results-${index}`,
            },
        })),
    ];

    return blocks;
};

export const unfurlExplore = (originalUrl: string, unfurl: Unfurl): any => {
    const blocks = [
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: unfurl.title,
            },
            accessory: {
                type: 'button',
                text: {
                    type: 'plain_text',
                    text: 'Open in Lightdash',
                    emoji: true,
                },
                url: originalUrl,
                action_id: 'button-action',
            },
        },
    ];
    const imageBlock = unfurl.imageUrl && {
        type: 'image',
        image_url: unfurl.imageUrl,
        alt_text: unfurl.title,
    };
    return {
        [originalUrl]: {
            blocks: imageBlock ? [...blocks, imageBlock] : blocks,
        },
    };
};
