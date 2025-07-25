import { getErrorMessage } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import Logger from '../../../../logging/logger';
import { serializeData } from './serializeData';

export const toolErrorHandler = (error: unknown, message: string) => {
    Sentry.captureException(error);

    const errorMessage = `${message}

${serializeData(getErrorMessage(error), 'raw')}

Try again if you believe the error can be resolved.
`;

    Logger.error(`[AiAgent][Tool Error Handler] ${errorMessage}`);

    return errorMessage;
};
