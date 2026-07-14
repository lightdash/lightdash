import {
    type ApiError,
    type GrantScriptRequest,
    type GrantScriptResult,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const getGrantScript = async (
    body: GrantScriptRequest,
): Promise<GrantScriptResult> =>
    lightdashApi<GrantScriptResult>({
        url: `/onboarding/connection/grant-script`,
        method: 'POST',
        body: JSON.stringify(body),
    });

export const useGrantScript = () =>
    useMutation<GrantScriptResult, ApiError, GrantScriptRequest>({
        mutationKey: ['onboarding', 'grant-script'],
        mutationFn: getGrantScript,
    });
