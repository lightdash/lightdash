import { type ApiError } from '@lightdash/common';
import { captureException } from '@sentry/react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import useToaster from './toaster/useToaster';

type opts = {
    forbiddenToastTitle?: string;
    forceToastOnForbidden?: boolean;
};

const useQueryError = ({
    forbiddenToastTitle,
    forceToastOnForbidden,
}: opts = {}): Dispatch<SetStateAction<ApiError | undefined>> => {
    const queryClient = useQueryClient();
    const [errorResponse, setErrorResponse] = useState<ApiError | undefined>();
    const { showToastError } = useToaster();
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

                    if (forceToastOnForbidden) {
                        showToastError({
                            title: forbiddenToastTitle ?? 'Forbidden',
                            subtitle: error.message,
                        });
                    }
                } else if (statusCode === 401) {
                    await queryClient.invalidateQueries(['health']);
                } else if (statusCode === 422) {
                    // validation errors
                    // Send sentry error
                    captureException(error, {
                        level: 'fatal',
                        tags: { errorType: 'validationError' },
                        extra: { data: error.data },
                    });
                    try {
                        const validationData = error.data as unknown as Record<
                            string,
                            { message: string; value: string }
                        >;
                        const values: string[] = Object.values(
                            validationData,
                        ).map(({ value }) => value);
                        const keys: string[] = Object.keys(validationData);
                        showToastError({
                            title: 'Validation error',
                            subtitle: `Invalid field ${keys} with value ${values}. The team has been already notified, we'll fix it soon`,
                        });
                    } catch (parseError) {
                        showToastError({
                            title: 'Unknown validation error',
                            subtitle: JSON.stringify(error),
                        });
                    }
                } else {
                    const { message } = error;
                    if (message !== '') {
                        const [first, ...rest] = message.split('\n');
                        showToastError({
                            title: first,
                            subtitle: rest.join('\n'),
                        });
                    } else {
                        showToastError({
                            title: `An unknown error happened`,
                            subtitle: JSON.stringify(error),
                        });
                    }
                }
            }
        })();
    }, [
        errorResponse,
        forbiddenToastTitle,
        forceToastOnForbidden,
        queryClient,
        showToastError,
    ]);
    return setErrorResponse;
};

export default useQueryError;
