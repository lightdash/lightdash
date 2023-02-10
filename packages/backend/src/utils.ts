import { ParameterError, validateEmail } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import { CustomSamplingContext } from '@sentry/types';
import {
    DbPinnedChart,
    DbPinnedDashboard,
} from './database/entities/pinnedList';
import Logger from './logger';

export const sanitizeStringParam = (value: any) => {
    if (!value || typeof value !== 'string') {
        throw new ParameterError();
    }
    const trimmedValue = value.trim();
    if (trimmedValue.length <= 0) {
        throw new ParameterError();
    }
    return trimmedValue;
};

export const sanitizeEmailParam = (value: any) => {
    const email = sanitizeStringParam(value);
    if (!validateEmail(email)) {
        throw new ParameterError();
    }
    return email;
};

export const isDbPinnedChart = (
    data: DbPinnedChart | DbPinnedDashboard,
): data is DbPinnedChart =>
    'saved_chart_uuid' in data && !!data.saved_chart_uuid;

export const wrapSentryTransaction = async (
    name: string,
    context: CustomSamplingContext,
    funct: () => Promise<any>,
) => {
    const startTime = Date.now();
    const transaction = Sentry.getCurrentHub()?.getScope()?.getTransaction();

    Logger.debug(
        `Starting sentry transaction ${
            transaction?.spanId
        } "${name}" with context: ${JSON.stringify(context)}`,
    );

    const span =
        transaction &&
        transaction.startChild({
            op: name,
            data: context,
        });
    try {
        return await funct();
    } catch (error) {
        Logger.error(
            `Error in wrapped sentry transaction ${transaction?.spanId} "${name}": ${error}`,
        );
        Sentry.captureException(error);
        return null;
    } finally {
        Logger.debug(
            `End sentry transaction ${transaction?.spanId} "${name}", took: ${
                Date.now() - startTime
            }ms`,
        );
        if (span) span.finish();
    }
};
