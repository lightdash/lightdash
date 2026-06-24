import { ApiNotificationResourceType } from './notifications';

test('AiReview resource type is exposed', () => {
    expect(ApiNotificationResourceType.AiReview).toBe('aiReview');
});
