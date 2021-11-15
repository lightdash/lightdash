import { ApiError } from 'common';
import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { useQueryClient } from 'react-query';
import { useApp } from '../providers/AppProvider';

const useQueryError = (): Dispatch<SetStateAction<ApiError | undefined>> => {
    const queryClient = useQueryClient();
    const [errorResponse, setErrorResponse] = useState<ApiError | undefined>();
    const {
        errorLogs: { showError },
    } = useApp();
    useEffect(() => {
        (async function doIfError() {
            const { error } = errorResponse || {};
            if (error) {
                const { statusCode } = error;
                if (statusCode === 401) {
                    await queryClient.invalidateQueries('health');
                } else {
                    // drawer
                    const { message } = error;
                    const [first, ...rest] = message.split('\n');
                    showError({ title: first, body: rest.join('\n') });
                }
            }
        })();
    }, [errorResponse, queryClient, showError]);
    return setErrorResponse;
};

export default useQueryError;
