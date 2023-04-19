import { LightdashPage } from '@lightdash/common';
import { KnownBlock, LinkUnfurls } from '@slack/bolt';
import { Unfurl } from '../../services/UnfurlService/UnfurlService';
import { AttachmentUrl } from '../EmailClient/EmailClient';

type GetChartAndDashboardBlocksArgs = {
    title: string;
    description: string;
    ctaUrl: string;
    imageUrl?: string;
    footerMarkdown?: string;
};
export const getChartAndDashboardBlocks = ({
    title,
    description,
    imageUrl,
    ctaUrl,
    footerMarkdown,
}: GetChartAndDashboardBlocksArgs): KnownBlock[] => {
    const blocks: KnownBlock[] = [
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
                text: `${description || ' '}`,
            },
            accessory: {
                type: 'button',
                text: {
                    type: 'plain_text',
                    text: 'Open in Lightdash',
                    emoji: true,
                },
                url: ctaUrl,
                action_id: 'button-action',
            },
        },
    ];

    if (imageUrl) {
        blocks.push({
            type: 'image',
            image_url: imageUrl,
            alt_text: title,
        });
    }

    if (footerMarkdown) {
        blocks.push({
            type: 'context',
            elements: [
                {
                    type: 'mrkdwn',
                    text: footerMarkdown,
                },
            ],
        });
    }
    return blocks;
};

type GetChartCsvResultsBlocksArgs = {
    title: string;
    description: string | undefined;
    ctaUrl: string;
    csvUrl?: string;
    footerMarkdown?: string;
};
export const getChartCsvResultsBlocks = ({
    title,
    description,
    csvUrl,
    ctaUrl,
    footerMarkdown,
}: GetChartCsvResultsBlocksArgs): KnownBlock[] => {
    const blocks: KnownBlock[] = [
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
                text: `${description || ' '}`,
            },
            accessory: {
                type: 'button',
                text: {
                    type: 'plain_text',
                    text: 'Open in Lightdash',
                    emoji: true,
                },
                url: ctaUrl,
                action_id: 'button-action',
            },
        },
    ];
    if (csvUrl) {
        blocks.push({
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
        });
    } else {
        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: '*_This query returned no results_*',
            },
        });
    }
    if (footerMarkdown) {
        blocks.push({
            type: 'context',
            elements: [
                {
                    type: 'mrkdwn',
                    text: footerMarkdown,
                },
            ],
        });
    }
    return blocks;
};

type GetDashboardCsvResultsBlocksArgs = {
    title: string;
    description: string | undefined;
    ctaUrl: string;
    csvUrls: AttachmentUrl[];
    footerMarkdown?: string;
};
export const getDashboardCsvResultsBlocks = ({
    title,
    description,
    csvUrls,
    footerMarkdown,
    ctaUrl,
}: GetDashboardCsvResultsBlocksArgs): KnownBlock[] => {
    const blocks: KnownBlock[] = [
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
                text: `${description || ''}`,
            },
            accessory: {
                type: 'button',
                text: {
                    type: 'plain_text',
                    text: 'Open in Lightdash',
                    emoji: true,
                },
                url: ctaUrl,
                action_id: 'button-action',
            },
        },

        ...csvUrls.map<KnownBlock>((csvUrl, index) => ({
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
    if (footerMarkdown) {
        blocks.push({
            type: 'context',
            elements: [
                {
                    type: 'mrkdwn',
                    text: footerMarkdown,
                },
            ],
        });
    }
    return blocks;
};

const getExploreBlocks = (
    title: string,
    ctaUrl: string,
    imageUrl: string | undefined,
): KnownBlock[] => {
    const blocks: KnownBlock[] = [
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: title,
            },
            accessory: {
                type: 'button',
                text: {
                    type: 'plain_text',
                    text: 'Open in Lightdash',
                    emoji: true,
                },
                url: ctaUrl,
                action_id: 'button-action',
            },
        },
    ];
    if (imageUrl) {
        blocks.push({
            type: 'image',
            image_url: imageUrl,
            alt_text: title,
        });
    }

    return blocks;
};

export const getUnfurlBlocks = (
    originalUrl: string,
    unfurl: Unfurl,
): LinkUnfurls => ({
    [originalUrl]: {
        blocks:
            unfurl?.pageType === LightdashPage.EXPLORE
                ? getExploreBlocks(unfurl.title, originalUrl, unfurl.imageUrl)
                : getChartAndDashboardBlocks({
                      title: unfurl.title,
                      description: unfurl.description || '',
                      imageUrl: unfurl.imageUrl,
                      ctaUrl: originalUrl,
                  }),
    },
});
