import { type KnownBlock } from '@slack/bolt';
import { safeUrl, sanitizeText, truncateText } from './SlackMessageBlocks';

const SECTION_TEXT_LIMIT = 3000;
const HEADER_TEXT_LIMIT = 150;
const BUTTON_TEXT_LIMIT = 75;

type ContentReviewBlockArgs = {
    header: string;
    body: string;
    note: string | null;
    projectName: string;
    requestUrl: string;
    buttonLabel: string;
};

export const buildContentReviewBlocks = (
    args: ContentReviewBlockArgs,
): KnownBlock[] => {
    const url = safeUrl(args.requestUrl);
    const blocks: KnownBlock[] = [
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: truncateText(
                    sanitizeText(args.header),
                    HEADER_TEXT_LIMIT,
                ),
            },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: truncateText(sanitizeText(args.body), SECTION_TEXT_LIMIT),
            },
        },
    ];
    if (args.note !== null && args.note.trim().length > 0) {
        blocks.push({
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: truncateText(
                    `> ${sanitizeText(args.note)}`,
                    SECTION_TEXT_LIMIT,
                ),
            },
        });
    }
    blocks.push({
        type: 'context',
        elements: [
            {
                type: 'mrkdwn',
                text: truncateText(
                    `Project: ${sanitizeText(args.projectName)}`,
                    SECTION_TEXT_LIMIT,
                ),
            },
        ],
    });
    if (url) {
        blocks.push({
            type: 'actions',
            elements: [
                {
                    type: 'button',
                    text: {
                        type: 'plain_text',
                        text: truncateText(args.buttonLabel, BUTTON_TEXT_LIMIT),
                        emoji: true,
                    },
                    url,
                    action_id: 'content_review_open',
                },
            ],
        });
    }
    return blocks;
};
