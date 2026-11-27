import { NotFoundError, WarehouseQueryError } from '@lightdash/common';
import {
    getScheduledDeliveryDisableReason,
    resolveSchedulerDeliveryFailureAction,
    SchedulerDeliveryError,
} from './SchedulerDeliveryError';

const buildError = (isNonRetryable: boolean) =>
    new SchedulerDeliveryError({
        cause: isNonRetryable
            ? new NotFoundError('internal resource identifier')
            : new Error('warehouse timeout'),
        createdByUserUuid: 'user-1',
        notification: {
            organizationUuid: 'org-1',
            recipientEmail: 'creator@example.com',
            schedulerName: 'Weekly sync',
            deliveryUrl: 'https://app/scheduler',
        },
    });

describe('scheduled delivery disable reasons', () => {
    test('leaves the recurring schedule enabled for a missing BigQuery table', () => {
        expect(
            getScheduledDeliveryDisableReason(
                new WarehouseQueryError(
                    'Not found: Table example:dataset.daily_orders',
                ),
            ),
        ).toBeNull();
    });
});

describe('SchedulerDeliveryError', () => {
    // The worker re-throws `err.cause`, so preserving the original error is the
    // one constructor behaviour worth pinning down.
    test('preserves the original error as its cause', () => {
        const cause = new NotFoundError('sheet is gone');
        const err = new SchedulerDeliveryError({
            cause,
            createdByUserUuid: 'user-1',
            notification: {
                organizationUuid: 'org-1',
                recipientEmail: undefined,
                schedulerName: 'Weekly sync',
                deliveryUrl: 'https://app/scheduler',
            },
        });

        expect(err).toBeInstanceOf(SchedulerDeliveryError);
        expect(err.cause).toBe(cause);
    });
});

describe('resolveSchedulerDeliveryFailureAction', () => {
    test('does nothing when the error is not a SchedulerDeliveryError', () => {
        expect(resolveSchedulerDeliveryFailureAction(undefined, true)).toEqual({
            notify: false,
            disableReason: null,
        });
    });

    test('stays silent on a retryable, non-final attempt', () => {
        expect(
            resolveSchedulerDeliveryFailureAction(buildError(false), false),
        ).toEqual({ notify: false, disableReason: null });
    });

    test('notifies once on the final attempt of a retryable error', () => {
        expect(
            resolveSchedulerDeliveryFailureAction(buildError(false), true),
        ).toEqual({ notify: true, disableReason: null });
    });

    test('notifies and disables a non-retryable error immediately, even mid-retry', () => {
        expect(
            resolveSchedulerDeliveryFailureAction(buildError(true), false),
        ).toEqual({
            notify: true,
            disableReason:
                'A resource required by this Google Sheets sync could not be found.',
        });
    });

    test('notifies and disables a non-retryable error on the final attempt', () => {
        expect(
            resolveSchedulerDeliveryFailureAction(buildError(true), true),
        ).toEqual({
            notify: true,
            disableReason:
                'A resource required by this Google Sheets sync could not be found.',
        });
    });
});
