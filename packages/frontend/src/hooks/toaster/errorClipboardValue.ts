import { type ApiErrorDetail } from '@lightdash/common';

export const errorClipboardValue = (apiError: ApiErrorDetail) =>
    apiError.sentryEventId || apiError.sentryTraceId
        ? `${apiError.message}\nError ID: ${
              apiError.sentryEventId || 'n/a'
          }\nTrace ID: ${apiError.sentryTraceId || 'n/a'}`
        : apiError.message;
