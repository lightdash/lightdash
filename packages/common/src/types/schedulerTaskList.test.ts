import { EE_SCHEDULER_TASKS } from './schedulerTaskList';

test('SEND_REVIEW_NOTIFICATION task is registered', () => {
    expect(EE_SCHEDULER_TASKS.SEND_REVIEW_NOTIFICATION).toBe(
        'sendReviewNotification',
    );
});
