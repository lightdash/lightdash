import { isAiAccessRefusal, type ApiError } from '@lightdash/common';

export const getAiAccessRefusal = (
    error: ApiError['error'] | null | undefined,
) => (isAiAccessRefusal(error?.data) ? error.data : null);

export const isAiAgentAuthorizationError = (
    error: ApiError['error'] | null | undefined,
) => error?.statusCode === 403 && !getAiAccessRefusal(error);
