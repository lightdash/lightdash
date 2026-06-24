import { buildReviewNeedsReviewBlocks } from './SlackReviewMessageBlocks';

test('needs-review blocks contain only allow-listed fields and a button', () => {
    const blocks = buildReviewNeedsReviewBlocks({
        count: 3,
        topTitle: 'Fiscal calendar conventions',
        rootCause: 'semantic_layer',
        projectName: 'Jaffle',
        reviewUrl: 'https://app.lightdash.com/ai-agents/admin/reviews',
        actionId: 'ai_review_open',
        notificationLogUuid: 'log-1',
    });

    const json = JSON.stringify(blocks);
    expect(json).toContain('3 context fixes need review');
    expect(json).toContain('action_id');
    expect(json).toContain('log-1');
    expect(json).not.toMatch(/select|from\s|where\s/i);
});
