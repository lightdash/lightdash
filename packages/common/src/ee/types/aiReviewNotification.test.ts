import {
    AiReviewNotificationChannel,
    AiReviewNotificationEvent,
} from './aiReviewNotification';

test('event and channel enums expose stable string values', () => {
    expect(AiReviewNotificationEvent.NeedsReview).toBe('needs_review');
    expect(AiReviewNotificationChannel.SlackDm).toBe('slack_dm');
});
