import { InvalidUser, PaginationError, type ApiError } from '@lightdash/common';
import { captureException } from '@sentry/react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import useToaster from './toaster/useToaster';

type opts = {
    forbiddenToastTitle?: string;
    forceToastOnForbidden?: boolean;
    chartName?: string;
};

const useQueryError = ({
    forbiddenToastTitle,
    forceToastOnForbidden,
    chartName,
}: opts = {}): Dispatch<SetStateAction<ApiError | undefined>> => {
    const queryClient = useQueryClient();
    const [errorResponse, setErrorResponse] = useState<ApiError | undefined>();
    const { showToastError, addToastError } = useToaster();
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
                        addToastError({
                            title: forbiddenToastTitle ?? 'Forbidden',
                            apiError: error,
                        });
                    }
                } else if (statusCode === 401) {
                    await queryClient.invalidateQueries(['health']);
                } else if (
                    statusCode === 422 &&
                    error.name !== PaginationError.name
                ) {
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
                } else if (error.name === InvalidUser.name) {
                    if (window.location.pathname !== '/login') {
                        window.location.href = '/login';
                    }
                } else {
                    addToastError({
                        title: chartName
                            ? `Chart '${chartName}': Error`
                            : undefined,
                        apiError: error,
                    });
                }
            }
        })();
    }, [
        errorResponse,
        forbiddenToastTitle,
        forceToastOnForbidden,
        chartName,
        queryClient,
        showToastError,
        addToastError,
    ]);
    return setErrorResponse;
};

export default useQueryError;
