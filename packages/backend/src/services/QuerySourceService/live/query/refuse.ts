import {
    ParameterError,
    type LiveSourceErrorData,
    type LiveSourceRefusalCode,
} from '@lightdash/common';

/**
 * The one way an integration refuses a query it can't answer, so every
 * refusal reaches telemetry by its code rather than as our own error.
 */
export const refuseLiveQuery = (
    code: LiveSourceRefusalCode,
    message: string,
): ParameterError => {
    const data: LiveSourceErrorData = {
        liveSourceErrorCode: code,
        liveSourceErrorCodes: [code],
    };
    return new ParameterError(message, data);
};
