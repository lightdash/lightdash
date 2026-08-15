import {
    LIGHTDASH_APP_PREVIEW_TOKEN_MAX_AGE_SECONDS,
    type ApiError,
} from '@lightdash/common';

const PREVIEW_TOKEN_REFRESH_MARGIN_SECONDS = 5 * 60;

export const APP_PREVIEW_TOKEN_REFRESH_INTERVAL_MS =
    (LIGHTDASH_APP_PREVIEW_TOKEN_MAX_AGE_SECONDS -
        PREVIEW_TOKEN_REFRESH_MARGIN_SECONDS) *
    1_000;
export const APP_PREVIEW_TOKEN_RETRY_INTERVAL_MS = 60 * 1_000;

const isTerminalPreviewTokenError = (
    error: ApiError | null | undefined,
): boolean =>
    error?.error?.statusCode === 403 || error?.error?.statusCode === 404;

export const getVisiblePreviewTokenError = (
    error: ApiError | null,
    hasCachedToken: boolean,
): ApiError | null =>
    hasCachedToken && !isTerminalPreviewTokenError(error) ? null : error;

export const getPreviewTokenRefetchInterval = (
    error: ApiError | null,
): number | false =>
    isTerminalPreviewTokenError(error)
        ? false
        : error
          ? APP_PREVIEW_TOKEN_RETRY_INTERVAL_MS
          : APP_PREVIEW_TOKEN_REFRESH_INTERVAL_MS;

export const previewTokenQueryOptions = {
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
} as const;
