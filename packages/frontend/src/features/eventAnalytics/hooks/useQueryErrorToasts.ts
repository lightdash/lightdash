import { type ApiErrorDetail } from '@lightdash/common';
import { type SerializedError } from '@reduxjs/toolkit';
import { useEffect, useRef } from 'react';
import useToaster from '../../../hooks/toaster/useToaster';

export type QueryError = ApiErrorDetail | SerializedError | null;

export type QueryErrorSource = {
    title: string;
    error: QueryError;
};

const isApiErrorDetail = (
    error: NonNullable<QueryError>,
): error is ApiErrorDetail => 'statusCode' in error;

/** Shows a toast for each error once, keyed by the error instance. */
export function useQueryErrorToasts(sources: QueryErrorSource[]) {
    const { showToastApiError, showToastError } = useToaster();
    const shown = useRef(new WeakSet<object>());

    useEffect(() => {
        sources.forEach(({ title, error }) => {
            if (!error || shown.current.has(error)) return;
            shown.current.add(error);
            if (isApiErrorDetail(error)) {
                showToastApiError({ title, apiError: error });
            } else {
                showToastError({
                    title,
                    subtitle:
                        error.message ?? 'Something went wrong. Try again.',
                });
            }
        });
    }, [sources, showToastApiError, showToastError]);
}
