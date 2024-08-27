import {
    friendlyName,
    LightdashPage,
    operatorActionValue,
    ThresholdOperator,
    ThresholdOptions,
} from '@lightdash/common';
import { KnownBlock, LinkUnfurls, SectionBlock } from '@slack/bolt';
import { Unfurl } from '../../services/UnfurlService/UnfurlService';
import { AttachmentUrl } from '../EmailClient/EmailClient';

type GetChartAndDashboardBlocksArgs = {
    title: string;
    name?: string;
    description?: string;
    message?: string;
    ctaUrl: string;
    imageUrl?: string;
    footerMarkdown?: string;
};

const getSectionFields = (
    fields: [string, string | undefined][],
): SectionBlock['fields'] => {
    const availableFields = fields.filter(([, text]) => Boolean(text));

    if (availableFields.length === 0) {
        // Return empty field placeholder to avoid `cannot_parse_attachment` error from Slack
        return [
            {
                type: 'mrkdwn',
                text: ' ',
            },
        ];
    }
    return availableFields.map(([title, text]) => ({
        type: 'mrkdwn',
        text: `*${title}*: \n${text}`,
    }));
};

const getBlocks = (blocks: (KnownBlock | undefined)[]): KnownBlock[] =>
    blocks.filter((block): block is KnownBlock => Boolean(block));

export const getChartAndDashboardBlocks = ({
    title,
    name,
    description,
    message,
    imageUrl,
    ctaUrl,
    footerMarkdown,
}: GetChartAndDashboardBlocksArgs): KnownBlock[] =>
    getBlocks([
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: title,
            },
        },
        message
            ? {
                  type: 'section',
                  text: {
                      type: 'mrkdwn',
                      text: message,
                  },
              }
            : undefined,
        {
            type: 'section',
            fields: getSectionFields([
                ['name', name],
                ['description', description],
            ]),
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
        imageUrl
            ? {
                  type: 'image',
                  image_url: imageUrl,
                  alt_text: title,
              }
            : undefined,
        footerMarkdown
            ? {
                  type: 'context',
                  elements: [
                      {
                          type: 'mrkdwn',
                          text: footerMarkdown,
                      },
                  ],
              }
            : undefined,
    ]);

type GetChartCsvResultsBlocksArgs = {
    name: string;
    title: string;
    description: string | undefined;
    message?: string;
    ctaUrl: string;
    csvUrl?: string;
    footerMarkdown?: string;
};
export const getChartCsvResultsBlocks = ({
    name,
    title,
    description,
    message,
    csvUrl,
    ctaUrl,
    footerMarkdown,
}: GetChartCsvResultsBlocksArgs): KnownBlock[] =>
    getBlocks([
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: title,
            },
        },
        message
            ? {
                  type: 'section',
                  text: {
                      type: 'mrkdwn',
                      text: message,
                  },
              }
            : undefined,
        {
            type: 'section',
            fields: getSectionFields([
                ['name', name],
                ['description', description],
            ]),
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

        csvUrl
            ? {
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
              }
            : {
                  type: 'section',
                  text: {
                      type: 'mrkdwn',
                      text: '*_This query returned no results_*',
                  },
              },

        footerMarkdown
            ? {
                  type: 'context',
                  elements: [
                      {
                          type: 'mrkdwn',
                          text: footerMarkdown,
                      },
                  ],
              }
            : undefined,
    ]);

type GetChartThresholdBlocksArgs = {
    name: string;

    title: string;
    message?: string;
    description: string | undefined;
    ctaUrl: string;
    imageUrl?: string;
    footerMarkdown?: string;
    thresholds: ThresholdOptions[];
};
export const getChartThresholdAlertBlocks = ({
    name,
    title,
    message,
    description,
    imageUrl,
    ctaUrl,
    thresholds,
    footerMarkdown,
}: GetChartThresholdBlocksArgs): KnownBlock[] => {
    // TODO only pass threshold conditions met
    // TODO send field name from explore or results (instead of friendly name)

    const thresholdBlocks: KnownBlock[] = thresholds.map((threshold) => ({
        type: 'section',
        text: {
            type: 'mrkdwn',
            text: `• *${friendlyName(threshold.fieldId)}* ${operatorActionValue(
                threshold.operator,
                threshold.value,
                '*',
            )}`,
        },
    }));
    return getBlocks([
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: title,
            },
        },
        message
            ? {
                  type: 'section',
                  text: {
                      type: 'mrkdwn',
                      text: message,
                  },
              }
            : undefined,

        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `Your results for the chart *${name}* triggered the following alerts:`,
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
        ...thresholdBlocks,
        imageUrl
            ? {
                  type: 'image',
                  image_url: imageUrl,
                  alt_text: title,
              }
            : undefined,
        footerMarkdown
            ? {
                  type: 'context',
                  elements: [
                      {
                          type: 'mrkdwn',
                          text: footerMarkdown,
                      },
                  ],
              }
            : undefined,
    ]);
};
type GetDashboardCsvResultsBlocksArgs = {
    title: string;
    name: string;
    description: string | undefined;
    message?: string;
    ctaUrl: string;
    csvUrls: AttachmentUrl[];
    footerMarkdown?: string;
};
export const getDashboardCsvResultsBlocks = ({
    title,
    name,
    description,
    message,
    csvUrls,
    footerMarkdown,
    ctaUrl,
}: GetDashboardCsvResultsBlocksArgs): KnownBlock[] =>
    getBlocks([
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: title,
            },
        },
        message
            ? {
                  type: 'section',
                  text: {
                      type: 'mrkdwn',
                      text: message,
                  },
              }
            : undefined,
        {
            type: 'section',
            fields: getSectionFields([
                ['name', name],
                ['description', description],
            ]),
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
        footerMarkdown
            ? {
                  type: 'context',
                  elements: [
                      {
                          type: 'mrkdwn',
                          text: footerMarkdown,
                      },
                  ],
              }
            : undefined,
    ]);

const getExploreBlocks = (
    title: string,
    ctaUrl: string,
    imageUrl: string | undefined,
): KnownBlock[] =>
    getBlocks([
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
        imageUrl
            ? {
                  type: 'image',
                  image_url: imageUrl,
                  alt_text: title,
              }
            : undefined,
    ]);

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
                      description: unfurl.description,
                      imageUrl: unfurl.imageUrl,
                      ctaUrl: originalUrl,
                  }),
    },
});

export const getNotificationChannelErrorBlocks = (
    schedulerName: string,
    error: any,
): KnownBlock[] =>
    getBlocks([
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: `❌ Error sending Scheduled Delivery: "${schedulerName}"`,
            },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*Details:*`,
            },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                // eslint-disable-next-line no-useless-concat
                text: '```' + `${error}` + '```',
            },
        },
    ]);
