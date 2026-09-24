import { buildReviewNeedsReviewBlocks } from './SlackReviewMessageBlocks';

const args = {
    count: 3,
    topTitle: 'Fiscal calendar conventions',
    rootCause: 'semantic_layer',
    projectName: 'Jaffle',
    reviewUrl: 'https://app.lightdash.com/ai-agents/admin/reviews',
    actionId: 'ai_review_open',
    notificationLogUuid: 'log-1',
};

test('needs-review blocks render the summary and an open-review button', () => {
    expect(buildReviewNeedsReviewBlocks(args)).toEqual([
        {
            type: 'header',
            text: { type: 'plain_text', text: '3 context fixes need review' },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: 'Top finding: Fiscal calendar conventions\n*Root cause:* semantic_layer\n*Project:* Jaffle',
            },
        },
        {
            type: 'actions',
            elements: [
                {
                    type: 'button',
                    text: {
                        type: 'plain_text',
                        text: 'Open review',
                        emoji: true,
                    },
                    action_id: 'ai_review_open',
                    value: 'log-1',
                    url: 'https://app.lightdash.com/ai-agents/admin/reviews',
                },
            ],
        },
    ]);
});

test('drops the button when the review url is not http or https', () => {
    const blocks = buildReviewNeedsReviewBlocks({
        ...args,
        reviewUrl: 'ftp://app.lightdash.com/ai-agents/admin/reviews',
    });

    expect(blocks.map((block) => block.type)).toEqual(['header', 'section']);
});
