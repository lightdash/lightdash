import { type KnownBlock } from '@slack/bolt';
import { safeUrl, sanitizeText, truncateText } from './SlackMessageBlocks';

const SECTION_TEXT_LIMIT = 3000;
const HEADER_TEXT_LIMIT = 150;
const BUTTON_TEXT_LIMIT = 75;

type ReviewButtonArgs = {
    reviewUrl: string;
    actionId: string;
    notificationLogUuid: string;
};

const buildReviewButton = ({
    reviewUrl,
    actionId,
    notificationLogUuid,
}: ReviewButtonArgs) => {
    const url = safeUrl(reviewUrl);
    if (!url) {
        return undefined;
    }

    return {
        type: 'button' as const,
        text: {
            type: 'plain_text' as const,
            text: truncateText('Open review', BUTTON_TEXT_LIMIT),
            emoji: true,
        },
        action_id: actionId,
        value: notificationLogUuid,
        url,
    };
};

const buildBlocks = (args: {
    header: string;
    body: string;
    rootCause: string;
    projectName: string;
    reviewUrl: string;
    actionId: string;
    notificationLogUuid: string;
}): KnownBlock[] => {
    const button = buildReviewButton(args);
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
                text: truncateText(
                    [
                        sanitizeText(args.body),
                        `*Root cause:* ${sanitizeText(args.rootCause)}`,
                        `*Project:* ${sanitizeText(args.projectName)}`,
                    ].join('\n'),
                    SECTION_TEXT_LIMIT,
                ),
            },
        },
    ];

    if (button) {
        blocks.push({
            type: 'actions',
            elements: [button],
        });
    }

    return blocks;
};

export const buildReviewNeedsReviewBlocks = (args: {
    count: number;
    topTitle: string;
    rootCause: string;
    projectName: string;
    reviewUrl: string;
    actionId: string;
    notificationLogUuid: string;
}): KnownBlock[] =>
    buildBlocks({
        header: `${args.count} context fixes need review`,
        body: `Top finding: ${args.topTitle}`,
        rootCause: args.rootCause,
        projectName: args.projectName,
        reviewUrl: args.reviewUrl,
        actionId: args.actionId,
        notificationLogUuid: args.notificationLogUuid,
    });

export const buildReviewAssignedBlocks = (args: {
    title: string;
    rootCause: string;
    projectName: string;
    reviewUrl: string;
    actionId: string;
    notificationLogUuid: string;
}): KnownBlock[] =>
    buildBlocks({
        header: 'AI review finding assigned',
        body: `Finding: ${args.title}`,
        rootCause: args.rootCause,
        projectName: args.projectName,
        reviewUrl: args.reviewUrl,
        actionId: args.actionId,
        notificationLogUuid: args.notificationLogUuid,
    });
