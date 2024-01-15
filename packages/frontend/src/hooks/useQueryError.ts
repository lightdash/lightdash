import { ApiError } from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { useErrorLogs } from '../providers/ErrorLogsProvider';

const useQueryError = (): Dispatch<SetStateAction<ApiError | undefined>> => {
    const queryClient = useQueryClient();
    const [errorResponse, setErrorResponse] = useState<ApiError | undefined>();
    const { appendError } = useErrorLogs();
    useEffect(() => {
        (async function doIfError() {
            const { error } = errorResponse || {};
            if (error) {
                const { statusCode } = error;
                if (statusCode === 403) {
                    // Forbidden error
                    // This will be expected for some users like member
                    // So don't show the error popup there,
                    // we will handle this on pages showing a nice message
                } else if (statusCode === 401) {
                    await queryClient.invalidateQueries(['health']);
                } else {
                    const { message } = error;
                    const [first, ...rest] = message.split('\n');
                    appendError({ title: first, body: rest.join('\n') });
                }
            }
        })();
    }, [errorResponse, queryClient, appendError]);
    return setErrorResponse;
};

export default useQueryError;
