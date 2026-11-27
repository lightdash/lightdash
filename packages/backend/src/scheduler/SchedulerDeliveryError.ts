import {
    FieldReferenceError,
    ForbiddenError,
    getErrorMessage,
    MissingConfigError,
    NotFoundError,
    ParameterError,
    UnexpectedGoogleSheetsError,
    WarehouseConnectionError,
} from '@lightdash/common';

const warehouseConnectionReason =
    'The delivery could not connect to the warehouse. Check the project connection.';

export function getScheduledDeliveryDisableReason(
    error: unknown,
): string | null {
    if (error instanceof FieldReferenceError)
        return 'The delivery references a field that is no longer available.';
    if (error instanceof WarehouseConnectionError)
        return warehouseConnectionReason;
    if (error instanceof ParameterError)
        return 'The delivery has an invalid setting. Review its configuration.';
    return null;
}

function getSheetsDisableReason(error: unknown): string | null {
    if (error instanceof NotFoundError)
        return 'A resource required by this Google Sheets sync could not be found.';
    if (error instanceof ForbiddenError)
        return 'This Google Sheets sync does not have access to a required resource.';
    if (error instanceof MissingConfigError)
        return 'Configuration required by this Google Sheets sync is missing.';
    if (error instanceof UnexpectedGoogleSheetsError)
        return 'Google Sheets rejected the upload.';
    if (error instanceof WarehouseConnectionError)
        return warehouseConnectionReason;
    return null;
}

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
    readonly disableReason: string | null;

    get isNonRetryable(): boolean {
        return this.disableReason !== null;
    }

    readonly createdByUserUuid: string;

    readonly notification: SchedulerDeliveryNotificationContext;

    constructor(args: {
        cause: unknown;
        createdByUserUuid: string;
        notification: SchedulerDeliveryNotificationContext;
    }) {
        super(getErrorMessage(args.cause), { cause: args.cause });
        this.name = 'SchedulerDeliveryError';
        this.disableReason = getSheetsDisableReason(args.cause);
        this.createdByUserUuid = args.createdByUserUuid;
        this.notification = args.notification;
    }
}

export type SchedulerDeliveryFailureAction = {
    notify: boolean;
    disableReason: string | null;
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
        return { notify: false, disableReason: null };
    }
    const { isNonRetryable } = deliveryError;
    return {
        notify: isNonRetryable || isFinalAttempt,
        disableReason: deliveryError.disableReason,
    };
};
