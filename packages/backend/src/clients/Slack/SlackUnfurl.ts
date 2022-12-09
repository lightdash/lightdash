import { Unfurl } from '../../services/UnfurlService/UnfurlService';

export const unfurlChartAndDashboard = (
    originalUrl: string,
    unfurl: Unfurl,
): any => ({
    [originalUrl]: {
        blocks: [
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
                    originalUrl,
                    action_id: 'button-action',
                },
            },
            {
                type: 'image',
                image_url: unfurl.imageUrl,
                alt_text: unfurl.title,
            },
        ],
    },
});

export const unfurlExplore = (originalUrl: string, unfurl: Unfurl): any => ({
    [originalUrl]: {
        blocks: [
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
                    originalUrl,
                    action_id: 'button-action',
                },
            },
            {
                type: 'image',
                image_url: unfurl.imageUrl,
                alt_text: unfurl.title,
            },
        ],
    },
});
