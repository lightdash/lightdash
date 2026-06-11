import { getErrorMessage } from '@lightdash/common';

export type SchedulerDeliveryNotificationContext = {
    organizationUuid: string | undefined;
    recipientEmail: string | undefined;
    schedulerName: string;
    deliveryUrl: string;
};

/**
 * Carries a delivery failure (and the context needed to notify) from the task to
 * the worker. `cause` is the original error and is what the worker re-throws —
 * the envelope never reaches graphile, so logs/Sentry keep the real error type.
 */
export class SchedulerDeliveryError extends Error {
    readonly isNonRetryable: boolean;

    readonly createdByUserUuid: string;

    readonly notification: SchedulerDeliveryNotificationContext;

    constructor(args: {
        cause: unknown;
        isNonRetryable: boolean;
        createdByUserUuid: string;
        notification: SchedulerDeliveryNotificationContext;
    }) {
        super(getErrorMessage(args.cause), { cause: args.cause });
        this.name = 'SchedulerDeliveryError';
        this.isNonRetryable = args.isNonRetryable;
        this.createdByUserUuid = args.createdByUserUuid;
        this.notification = args.notification;
    }
}

export type SchedulerDeliveryFailureAction = {
    notify: boolean;
    disable: boolean;
};

/**
 * Notify only on a terminal outcome — non-retryable, or the final attempt — so
 * transient failures that later recover stay silent. A non-envelope error
 * (thrown before the task could classify it) is treated as retryable and silent.
 */
export const resolveSchedulerDeliveryFailureAction = (
    deliveryError: SchedulerDeliveryError | undefined,
    isFinalAttempt: boolean,
): SchedulerDeliveryFailureAction => {
    if (!deliveryError) {
        return { notify: false, disable: false };
    }
    const { isNonRetryable } = deliveryError;
    return {
        notify: isNonRetryable || isFinalAttempt,
        disable: isNonRetryable,
    };
};
