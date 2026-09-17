import { isApiError } from '@lightdash/common';
import { captureException } from '@sentry/react';

type ChartTypeErrorType =
    | 'chartTypeLibraryLoad'
    | 'chartTypeInstall'
    | 'chartTypeRender'
    | 'dataAppDelete'
    | 'dataAppFork';

// lightdashApi throws plain ApiError objects, which Sentry groups poorly and
// flags as non-Error exceptions — wrap them and fingerprint per failure class.
export const captureChartTypeError = (
    errorType: ChartTypeErrorType,
    cause: unknown,
    extra: Record<string, unknown> = {},
): void => {
    const apiError = isApiError(cause) ? cause.error : undefined;
    const statusCode = apiError ? String(apiError.statusCode) : 'unknown';
    const error = new Error(
        apiError
            ? `${errorType}: ${apiError.name} (${statusCode})`
            : `${errorType}: ${String(cause)}`,
    );
    error.name = 'ChartTypeError';
    captureException(error, {
        fingerprint: [errorType, statusCode],
        tags: { errorType, statusCode },
        extra: { ...extra, apiErrorMessage: apiError?.message },
    });
};
