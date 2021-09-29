import { useEffect, useState } from 'react';
import { useQueryClient } from 'react-query';
import { useApp } from '../providers/AppProvider';

type UseQueryError = {
    showToastError: () => void;
};

const useQueryError = (props?: UseQueryError) => {
    const { showToastError } = props || {};
    const queryClient = useQueryClient();
    const [errorResponse, setErrorResponse] = useState<any>(null);
    const {
        errorLogs: { showError },
    } = useApp();
    useEffect(() => {
        (async function doIfError() {
            if (errorResponse) {
                // @ts-ignore
                const { statusCode } = errorResponse;
                if (statusCode === 401) {
                    await queryClient.invalidateQueries('health');
                } else if (showToastError) {
                    showToastError();
                } else {
                    // drawer
                    const { message } = errorResponse;
                    const [first, ...rest] = message.split('\n');
                    showError({ title: first, body: rest.join('\n') });
                }
            }
        })();
    }, [errorResponse]);
    return [errorResponse, setErrorResponse];
};

export default useQueryError;
