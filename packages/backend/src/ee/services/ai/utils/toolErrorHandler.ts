import { getErrorMessage } from '@lightdash/common';
import * as Sentry from '@sentry/node';
import Logger from '../../../../logging/logger';

export const toolErrorHandler = (error: unknown, message: string) => {
    Sentry.captureException(error);
    Logger.debug({ message, error });

    return `${message}

\`\`\`
${getErrorMessage(error)}
\`\`\`

Try again if you believe the error can be resolved.
`;
};
