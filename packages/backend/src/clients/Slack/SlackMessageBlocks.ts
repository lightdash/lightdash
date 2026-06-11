import {
    AnyType,
    assertUnreachable,
    friendlyName,
    LightdashPage,
    operatorActionValue,
    PartialFailureType,
    ThresholdOptions,
    type PartialFailure,
} from '@lightdash/common';
import {
    KnownBlock,
    LinkUnfurls,
    SectionBlock,
    SectionBlockAccessory,
} from '@slack/bolt';
import { AttachmentUrl } from '../EmailClient/EmailClient';

// Slack Block Kit text and structural limits
const SLACK_LIMITS = {
    HEADER_TEXT: 150,
    SECTION_TEXT: 3000,
    SECTION_FIELD_TEXT: 2000,
    BUTTON_TEXT: 75,
    ALT_TEXT: 2000,
    URL: 3000,
} as const;

// Beyond this many per-chart download blocks, dashboard CSV deliveries collapse
// into a single grouped section to stay under Slack's 50-block message cap.
const DASHBOARD_CSV_COLLAPSE_THRESHOLD = 35;

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

// Header blocks reject empty or whitespace-only text — returning undefined lets
// the caller drop the block entirely instead of emitting a single space.
const sanitizeHeaderText = (text: string | undefined): string | undefined => {
    const trimmed = text?.trim();
    if (!trimmed) return undefined;
    return truncateText(trimmed, SLACK_LIMITS.HEADER_TEXT);
};

// Slack rejects button.url and image_url values that are malformed or longer
// than 3000 chars. Returns undefined when the URL would be rejected so callers
// can drop the surrounding block / accessory.
const safeUrl = (
    url: string | undefined,
    maxLength: number = SLACK_LIMITS.URL,
): string | undefined => {
    if (!url) return undefined;
    if (url.length > maxLength) return undefined;
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return undefined;
        }
    } catch {
        return undefined;
    }
    return url;
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

// Inline notice that replaces a block we had to drop (oversized URL,
// malformed image, etc). Better than a silent omission — the user sees
// where the content would have been and how to recover.
const unavailableSection = (message: string): KnownBlock => ({
    type: 'section',
    text: {
        type: 'mrkdwn',
        text: truncateText(`:warning: ${message}`, SLACK_LIMITS.SECTION_TEXT),
    },
});

const DOWNLOAD_UNAVAILABLE_MESSAGE =
    'Download link unavailable for this delivery (the URL was too long or invalid). Open in Lightdash to download.';
const PREVIEW_UNAVAILABLE_MESSAGE =
    'Chart preview unavailable (the image URL was too long or invalid). Open in Lightdash to view.';

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
    const safeCtaUrl = includeLinks === false ? undefined : safeUrl(ctaUrl);
    const lightdashLink: SectionBlockAccessory | undefined = safeCtaUrl
        ? {
              type: 'button',
              text: {
                  type: 'plain_text',
                  text: 'Open in Lightdash',
                  emoji: true,
              },
              url: safeCtaUrl,
              action_id: 'button-action',
          }
        : undefined;
    const headerText = sanitizeHeaderText(title);
    const hasImageUrl = Boolean(imageUrl?.trim());
    const safeImageUrl = safeUrl(imageUrl);
    const buildImageBlock = (): KnownBlock | undefined => {
        if (safeImageUrl) {
            return {
                type: 'image',
                image_url: safeImageUrl,
                alt_text: truncateText(
                    sanitizeText(title),
                    SLACK_LIMITS.ALT_TEXT,
                ),
            };
        }
        if (hasImageUrl) {
            return unavailableSection(PREVIEW_UNAVAILABLE_MESSAGE);
        }
        return undefined;
    };
    return getBlocks([
        headerText
            ? {
                  type: 'header',
                  text: {
                      type: 'plain_text',
                      text: headerText,
                  },
              }
            : undefined,
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
        buildImageBlock(),
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
    const safeCtaUrl = includeLinks === false ? undefined : safeUrl(ctaUrl);
    const lightdashLink: SectionBlockAccessory | undefined = safeCtaUrl
        ? {
              type: 'button',
              text: {
                  type: 'plain_text',
                  text: 'Open in Lightdash',
                  emoji: true,
              },
              url: safeCtaUrl,
              action_id: 'button-action',
          }
        : undefined;
    const headerText = sanitizeHeaderText(title);
    const hasCsvUrl = Boolean(csvUrl?.trim());
    const safeCsvUrl = safeUrl(csvUrl);
    const buildDownloadActions = (): KnownBlock | undefined => {
        if (safeCsvUrl) {
            return {
                type: 'actions',
                elements: [
                    {
                        type: 'button',
                        text: {
                            type: 'plain_text',
                            text: 'Download results',
                            emoji: true,
                        },
                        url: safeCsvUrl,
                        action_id: 'download-results',
                    },
                ],
            };
        }
        if (!hasCsvUrl) {
            return {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '*_This query returned no results_*',
                },
            };
        }
        return unavailableSection(DOWNLOAD_UNAVAILABLE_MESSAGE);
    };
    const downloadActions = buildDownloadActions();
    return getBlocks([
        headerText
            ? {
                  type: 'header',
                  text: {
                      type: 'plain_text',
                      text: headerText,
                  },
              }
            : undefined,
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
        downloadActions,
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
    const safeCtaUrl = includeLinks === false ? undefined : safeUrl(ctaUrl);
    const lightdashLink: SectionBlockAccessory | undefined = safeCtaUrl
        ? {
              type: 'button',
              text: {
                  type: 'plain_text',
                  text: 'Open in Lightdash',
                  emoji: true,
              },
              url: safeCtaUrl,
              action_id: 'button-action',
          }
        : undefined;
    const headerText = sanitizeHeaderText(title);
    const hasImageUrl = Boolean(imageUrl?.trim());
    const safeImageUrl = safeUrl(imageUrl);
    const buildImageBlock = (): KnownBlock | undefined => {
        if (safeImageUrl) {
            return {
                type: 'image',
                image_url: safeImageUrl,
                alt_text: truncateText(
                    sanitizeText(title),
                    SLACK_LIMITS.ALT_TEXT,
                ),
            };
        }
        if (hasImageUrl) {
            return unavailableSection(PREVIEW_UNAVAILABLE_MESSAGE);
        }
        return undefined;
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
        headerText
            ? {
                  type: 'header',
                  text: {
                      type: 'plain_text',
                      text: headerText,
                  },
              }
            : undefined,
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
        buildImageBlock(),
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
    failures?: PartialFailure[];
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
                .map((f) => {
                    switch (f.type) {
                        case PartialFailureType.DASHBOARD_CHART:
                        case PartialFailureType.DASHBOARD_SQL_CHART:
                            return `\t• *${sanitizeText(
                                f.chartName,
                            )}:* ${sanitizeText(f.error)}`;
                        case PartialFailureType.MISSING_TARGETS:
                            return `\t• No targets found for this scheduled delivery`;
                        default:
                            return assertUnreachable(
                                f,
                                'Unknown partial failure type',
                            );
                    }
                })
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
            .map((f) => {
                switch (f.type) {
                    case PartialFailureType.DASHBOARD_CHART:
                    case PartialFailureType.DASHBOARD_SQL_CHART:
                        return `\t• ${sanitizeText(
                            f.chartName,
                        )}: ${sanitizeText(f.error)}`;
                    case PartialFailureType.MISSING_TARGETS:
                        return `\t• No targets found for this scheduled delivery`;
                    default:
                        return assertUnreachable(
                            f,
                            'Unknown partial failure type',
                        );
                }
            })
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

    const safeCtaUrl = safeUrl(ctaUrl);
    const headerText = sanitizeHeaderText(title);

    const perChartBlock = (
        csvUrl: AttachmentUrl,
        index: number,
    ): KnownBlock => {
        if (csvUrl.path === '#no-results') {
            return {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: '*_This query returned no results_*',
                },
            };
        }
        const safeDownloadUrl = safeUrl(csvUrl.path);
        if (safeDownloadUrl) {
            return {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: truncateText(
                        `:black_small_square: ${sanitizeText(csvUrl.filename)}`,
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
                    url: safeDownloadUrl,
                    action_id: `download-results-${index}`,
                },
            };
        }
        return {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: truncateText(
                    `:warning: ${sanitizeText(
                        csvUrl.filename,
                    )} — download unavailable. Open in Lightdash to access this result.`,
                    SLACK_LIMITS.SECTION_TEXT,
                ),
            },
        };
    };

    // When the dashboard has too many charts, n per-chart blocks would push
    // the message past Slack's 50-block hard cap. Collapse into a single
    // grouped section listing each filename as a clickable mrkdwn link to its
    // download URL, with one CTA so delivery still succeeds.
    //
    // The budget leaves headroom for the trailing "+ N more" summary line plus
    // mrkdwn syntax so we never need to truncate mid-link (which would emit
    // malformed mrkdwn and re-trigger invalid_blocks).
    const COLLAPSE_TEXT_BUDGET = SLACK_LIMITS.SECTION_TEXT - 200;
    const buildCsvRow = (u: AttachmentUrl): string => {
        const filename = sanitizeText(u.filename);
        const downloadUrl = safeUrl(u.path);
        return downloadUrl
            ? `:black_small_square: <${downloadUrl}|${filename}>`
            : `:warning: ${filename} — download unavailable`;
    };
    const buildCollapsedSection = (): KnownBlock => {
        const lines: string[] = [];
        let used = 0;
        let included = 0;
        for (const u of csvUrls) {
            const line = buildCsvRow(u);
            const cost = line.length + 1; // +1 for the joining newline
            if (used + cost > COLLAPSE_TEXT_BUDGET) break;
            lines.push(line);
            used += cost;
            included += 1;
        }
        const remaining = csvUrls.length - included;
        if (remaining > 0) {
            lines.push(
                `\n+ ${remaining} more — open in Lightdash to access all downloads.`,
            );
        }
        return {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: truncateText(lines.join('\n'), SLACK_LIMITS.SECTION_TEXT),
            },
            ...(safeCtaUrl
                ? {
                      accessory: {
                          type: 'button',
                          text: {
                              type: 'plain_text',
                              text: 'Open in Lightdash',
                              emoji: true,
                          },
                          url: safeCtaUrl,
                          action_id: 'open-in-lightdash',
                      },
                  }
                : {}),
        };
    };
    const csvSections: KnownBlock[] =
        csvUrls.length > DASHBOARD_CSV_COLLAPSE_THRESHOLD
            ? [buildCollapsedSection()]
            : csvUrls.map<KnownBlock>(perChartBlock);

    return getBlocks([
        headerText
            ? {
                  type: 'header',
                  text: {
                      type: 'plain_text',
                      text: headerText,
                  },
              }
            : undefined,
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
            ...(safeCtaUrl
                ? {
                      accessory: {
                          type: 'button',
                          text: {
                              type: 'plain_text',
                              text: 'Open in Lightdash',
                              emoji: true,
                          },
                          url: safeCtaUrl,
                          action_id: 'button-action',
                      },
                  }
                : {}),
        },
        ...csvSections,
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
): KnownBlock[] => {
    const safeCtaUrl = safeUrl(ctaUrl);
    const safeImageUrl = safeUrl(imageUrl);
    return getBlocks([
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: truncateText(
                    sanitizeText(title),
                    SLACK_LIMITS.SECTION_TEXT,
                ),
            },
            ...(safeCtaUrl
                ? {
                      accessory: {
                          type: 'button',
                          text: {
                              type: 'plain_text',
                              text: 'Open in Lightdash',
                              emoji: true,
                          },
                          url: safeCtaUrl,
                          action_id: 'button-action',
                      },
                  }
                : {}),
        },
        safeImageUrl
            ? {
                  type: 'image',
                  image_url: safeImageUrl,
                  alt_text: truncateText(
                      sanitizeText(title),
                      SLACK_LIMITS.ALT_TEXT,
                  ),
              }
            : undefined,
    ]);
};

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
    loomTileUuids?: (string | null)[];
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

export const getDeliveryFailureRecipientBlocks = (
    contentName: string | null,
    contactSentence: string | null,
): KnownBlock[] => {
    const baseSentence = contentName
        ? `The scheduled delivery for *"${sanitizeText(
              contentName,
          )}"* failed to run, and the delivery owner has been notified.`
        : 'A scheduled delivery failed to run, and the delivery owner has been notified.';
    const appended = contactSentence ? ` ${sanitizeText(contactSentence)}` : '';
    return [
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: truncateText(
                    `${baseSentence}${appended}`,
                    SLACK_LIMITS.SECTION_TEXT,
                ),
            },
        },
    ];
};

export const getNotificationChannelErrorBlocks = (
    schedulerName: string,
    error: AnyType,
    resourceUrl: string,
    type: 'Scheduled delivery' | 'Google Sync' = 'Scheduled delivery',
    isDisabled: boolean = false,
): KnownBlock[] => {
    const headerText = sanitizeHeaderText(
        `❌ Error sending ${type}: "${sanitizeText(schedulerName)}"`,
    );
    const safeResourceUrl = safeUrl(resourceUrl);
    return getBlocks([
        headerText
            ? {
                  type: 'header',
                  text: {
                      type: 'plain_text',
                      text: headerText,
                  },
              }
            : undefined,

        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*Details:*`,
            },
            ...(safeResourceUrl
                ? {
                      accessory: {
                          type: 'button',
                          text: {
                              type: 'plain_text',
                              text: 'Open in Lightdash',
                              emoji: true,
                          },
                          url: safeResourceUrl,
                          action_id: 'button-action',
                      },
                  }
                : {}),
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
};
