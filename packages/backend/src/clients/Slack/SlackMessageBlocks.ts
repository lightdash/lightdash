import {
    AnyType,
    friendlyName,
    LightdashPage,
    operatorActionValue,
    ThresholdOptions,
} from '@lightdash/common';
import {
    KnownBlock,
    LinkUnfurls,
    SectionBlock,
    SectionBlockAccessory,
} from '@slack/bolt';
import { AttachmentUrl } from '../EmailClient/EmailClient';

// Slack Block Kit text limits
const SLACK_LIMITS = {
    HEADER_TEXT: 150,
    SECTION_TEXT: 3000,
    SECTION_FIELD_TEXT: 2000,
    BUTTON_TEXT: 75,
    ALT_TEXT: 2000,
} as const;

// Truncate text to fit Slack limits and add ellipsis if needed
const truncateText = (text: string, maxLength: number): string => {
    if (!text || text.length <= maxLength) return text;
    return `${text.slice(0, maxLength - 3)}...`;
};

// Sanitize text to prevent invalid blocks
const sanitizeText = (text: string | undefined): string => {
    if (!text || text.trim() === '') return ' ';
    return text.trim();
};

type GetChartAndDashboardBlocksArgs = {
    title: string;
    name?: string;
    description?: string;
    message?: string;
    ctaUrl: string;
    imageUrl?: string;
    footerMarkdown?: string;
    includeLinks?: boolean;
};

const getSectionFields = (
    fields: [string, string | undefined][],
): SectionBlock['fields'] => {
    const availableFields = fields.filter(([, text]) => Boolean(text?.trim()));

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
        text: truncateText(
            `*${title}*: \n${sanitizeText(text)}`,
            SLACK_LIMITS.SECTION_FIELD_TEXT,
        ),
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
    includeLinks,
}: GetChartAndDashboardBlocksArgs): KnownBlock[] => {
    const lightdashLink: SectionBlockAccessory | undefined =
        includeLinks === false
            ? undefined
            : {
                  type: 'button',
                  text: {
                      type: 'plain_text',
                      text: 'Open in Lightdash',
                      emoji: true,
                  },
                  url: ctaUrl,
                  action_id: 'button-action',
              };
    return getBlocks([
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: truncateText(
                    sanitizeText(title),
                    SLACK_LIMITS.HEADER_TEXT,
                ),
            },
        },
        message?.trim()
            ? {
                  type: 'section',
                  text: {
                      type: 'mrkdwn',
                      text: truncateText(
                          sanitizeText(message),
                          SLACK_LIMITS.SECTION_TEXT,
                      ),
                  },
              }
            : undefined,
        {
            type: 'section',
            fields: getSectionFields([
                ['name', name],
                ['description', description],
            ]),
            accessory: lightdashLink,
        },
        imageUrl?.trim()
            ? {
                  type: 'image',
                  image_url: imageUrl,
                  alt_text: truncateText(
                      sanitizeText(title),
                      SLACK_LIMITS.ALT_TEXT,
                  ),
              }
            : undefined,
        footerMarkdown?.trim()
            ? {
                  type: 'context',
                  elements: [
                      {
                          type: 'mrkdwn',
                          text: truncateText(
                              sanitizeText(footerMarkdown),
                              SLACK_LIMITS.SECTION_TEXT,
                          ),
                      },
                  ],
              }
            : undefined,
    ]);
};
type GetChartCsvResultsBlocksArgs = {
    name: string;
    title: string;
    description: string | undefined;
    message?: string;
    ctaUrl: string;
    csvUrl?: string;
    footerMarkdown?: string;
    includeLinks?: boolean;
};
export const getChartCsvResultsBlocks = ({
    name,
    title,
    description,
    message,
    csvUrl,
    ctaUrl,
    footerMarkdown,
    includeLinks,
}: GetChartCsvResultsBlocksArgs): KnownBlock[] => {
    const lightdashLink: SectionBlockAccessory | undefined =
        includeLinks === false
            ? undefined
            : {
                  type: 'button',
                  text: {
                      type: 'plain_text',
                      text: 'Open in Lightdash',
                      emoji: true,
                  },
                  url: ctaUrl,
                  action_id: 'button-action',
              };
    return getBlocks([
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: truncateText(
                    sanitizeText(title),
                    SLACK_LIMITS.HEADER_TEXT,
                ),
            },
        },
        message?.trim()
            ? {
                  type: 'section',
                  text: {
                      type: 'mrkdwn',
                      text: truncateText(
                          sanitizeText(message),
                          SLACK_LIMITS.SECTION_TEXT,
                      ),
                  },
              }
            : undefined,
        {
            type: 'section',
            fields: getSectionFields([
                ['name', name],
                ['description', description],
            ]),
            accessory: lightdashLink,
        },

        csvUrl?.trim()
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

        footerMarkdown?.trim()
            ? {
                  type: 'context',
                  elements: [
                      {
                          type: 'mrkdwn',
                          text: truncateText(
                              sanitizeText(footerMarkdown),
                              SLACK_LIMITS.SECTION_TEXT,
                          ),
                      },
                  ],
              }
            : undefined,
    ]);
};
type GetChartThresholdBlocksArgs = {
    name: string;

    title: string;
    message?: string;
    description: string | undefined;
    ctaUrl: string;
    imageUrl?: string;
    footerMarkdown?: string;
    thresholds: ThresholdOptions[];
    includeLinks?: boolean;
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
    includeLinks,
}: GetChartThresholdBlocksArgs): KnownBlock[] => {
    // TODO only pass threshold conditions met
    // TODO send field name from explore or results (instead of friendly name)
    const lightdashLink: SectionBlockAccessory | undefined =
        includeLinks === false
            ? undefined
            : {
                  type: 'button',
                  text: {
                      type: 'plain_text',
                      text: 'Open in Lightdash',
                      emoji: true,
                  },
                  url: ctaUrl,
                  action_id: 'button-action',
              };
    const thresholdBlocks: KnownBlock[] = thresholds.map((threshold) => ({
        type: 'section',
        text: {
            type: 'mrkdwn',
            text: truncateText(
                `• *${friendlyName(threshold.fieldId)}* ${operatorActionValue(
                    threshold.operator,
                    threshold.value,
                    '*',
                )}`,
                SLACK_LIMITS.SECTION_TEXT,
            ),
        },
    }));
    return getBlocks([
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: truncateText(
                    sanitizeText(title),
                    SLACK_LIMITS.HEADER_TEXT,
                ),
            },
        },
        message?.trim()
            ? {
                  type: 'section',
                  text: {
                      type: 'mrkdwn',
                      text: truncateText(
                          sanitizeText(message),
                          SLACK_LIMITS.SECTION_TEXT,
                      ),
                  },
              }
            : undefined,

        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: truncateText(
                    `Your results for the chart *${sanitizeText(
                        name,
                    )}* triggered the following alerts:`,
                    SLACK_LIMITS.SECTION_TEXT,
                ),
            },
            accessory: lightdashLink,
        },
        ...thresholdBlocks,
        imageUrl?.trim()
            ? {
                  type: 'image',
                  image_url: imageUrl,
                  alt_text: truncateText(
                      sanitizeText(title),
                      SLACK_LIMITS.ALT_TEXT,
                  ),
              }
            : undefined,
        footerMarkdown?.trim()
            ? {
                  type: 'context',
                  elements: [
                      {
                          type: 'mrkdwn',
                          text: truncateText(
                              sanitizeText(footerMarkdown),
                              SLACK_LIMITS.SECTION_TEXT,
                          ),
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
    failures?: { chartName: string; error: string }[];
};
export const getDashboardCsvResultsBlocks = ({
    title,
    name,
    description,
    message,
    csvUrls,
    footerMarkdown,
    ctaUrl,
    failures,
}: GetDashboardCsvResultsBlocksArgs): KnownBlock[] => {
    const getFailureBlock = ():
        | { type: 'section'; text: { type: 'mrkdwn'; text: string } }
        | undefined => {
        if (!failures || failures.length === 0) {
            return undefined;
        }

        const allChartsFailed = csvUrls.length === 0;
        if (allChartsFailed) {
            const errorText = failures
                .map(
                    (f) =>
                        `\t• *${sanitizeText(f.chartName)}:* ${sanitizeText(
                            f.error,
                        )}`,
                )
                .join('\n');
            return {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: truncateText(
                        `:x: *Error: All charts in this scheduled delivery failed to export*\n\nNo data could be exported from this dashboard. Please check the errors below and verify your data model.\n\n${errorText}`,
                        SLACK_LIMITS.SECTION_TEXT,
                    ),
                },
            };
        }

        const errorText = failures
            .map(
                (f) =>
                    `\t• ${sanitizeText(f.chartName)}: ${sanitizeText(
                        f.error,
                    )}`,
            )
            .join('\n');
        return {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: truncateText(
                    `:warning: *Warning:* ${failures.length} chart(s) failed to export:\n${errorText}`,
                    SLACK_LIMITS.SECTION_TEXT,
                ),
            },
        };
    };

    return getBlocks([
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: truncateText(
                    sanitizeText(title),
                    SLACK_LIMITS.HEADER_TEXT,
                ),
            },
        },
        message?.trim()
            ? {
                  type: 'section',
                  text: {
                      type: 'mrkdwn',
                      text: truncateText(
                          sanitizeText(message),
                          SLACK_LIMITS.SECTION_TEXT,
                      ),
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
        ...csvUrls.map<KnownBlock>((csvUrl, index) =>
            csvUrl.path !== '#no-results'
                ? {
                      type: 'section',
                      text: {
                          type: 'mrkdwn',
                          text: truncateText(
                              `:black_small_square: ${sanitizeText(
                                  csvUrl.filename,
                              )}`,
                              SLACK_LIMITS.SECTION_TEXT,
                          ),
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
                  }
                : {
                      type: 'section',
                      text: {
                          type: 'mrkdwn',
                          text: '*_This query returned no results_*',
                      },
                  },
        ),
        getFailureBlock(),
        footerMarkdown?.trim()
            ? {
                  type: 'context',
                  elements: [
                      {
                          type: 'mrkdwn',
                          text: truncateText(
                              sanitizeText(footerMarkdown),
                              SLACK_LIMITS.SECTION_TEXT,
                          ),
                      },
                  ],
              }
            : undefined,
    ]);
};

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
                text: truncateText(
                    sanitizeText(title),
                    SLACK_LIMITS.SECTION_TEXT,
                ),
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
        imageUrl?.trim()
            ? {
                  type: 'image',
                  image_url: imageUrl,
                  alt_text: truncateText(
                      sanitizeText(title),
                      SLACK_LIMITS.ALT_TEXT,
                  ),
              }
            : undefined,
    ]);

export type Unfurl = {
    title: string;
    description?: string;
    chartType?: string;
    imageUrl: string | undefined;
    pageType: LightdashPage;
    minimalUrl: string;
    organizationUuid: string;
    resourceUuid: string | undefined;
    chartTileUuids?: (string | null)[];
    sqlChartTileUuids?: (string | null)[];
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
                      description: unfurl.description,
                      imageUrl: unfurl.imageUrl,
                      ctaUrl: originalUrl,
                  }),
    },
});

export const getNotificationChannelErrorBlocks = (
    schedulerName: string,
    error: AnyType,
    resourceUrl: string,
    type: 'Scheduled delivery' | 'Google Sync' = 'Scheduled delivery',
    isDisabled: boolean = false,
): KnownBlock[] =>
    getBlocks([
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: truncateText(
                    `❌ Error sending ${type}: "${sanitizeText(
                        schedulerName,
                    )}"`,
                    SLACK_LIMITS.HEADER_TEXT,
                ),
            },
        },

        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*Details:*`,
            },
            accessory: {
                type: 'button',
                text: {
                    type: 'plain_text',
                    text: 'Open in Lightdash',
                    emoji: true,
                },
                url: resourceUrl,
                action_id: 'button-action',
            },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: truncateText(
                    `\`\`\`${sanitizeText(String(error))}\`\`\``,
                    SLACK_LIMITS.SECTION_TEXT,
                ),
            },
        },
        isDisabled
            ? {
                  type: 'context',
                  elements: [
                      {
                          type: 'mrkdwn',
                          text: truncateText(
                              `Due to this error, this scheduler has been automatically disabled.\nYou can re-enable it from the ${type} settings once the issue is resolved.`,
                              SLACK_LIMITS.SECTION_TEXT,
                          ),
                      },
                  ],
              }
            : undefined,
    ]);
