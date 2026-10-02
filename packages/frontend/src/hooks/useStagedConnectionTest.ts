import {
    type ApiError,
    type CreateWarehouseCredentials,
    type WarehouseConnectionFailureCause,
    type WarehouseConnectionStagedTestResults,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { lightdashApi } from '../api';

const runStagedConnectionTest = async (
    warehouseConnection: CreateWarehouseCredentials,
) =>
    lightdashApi<WarehouseConnectionStagedTestResults>({
        url: `/org/warehouse-connection-tests`,
        method: 'POST',
        body: JSON.stringify({ warehouseConnection }),
        sensitive: true,
    });

type RepeatedFailure = {
    cause: WarehouseConnectionFailureCause;
    count: number;
};

export const useStagedConnectionTest = () => {
    const [repeatedFailure, setRepeatedFailure] =
        useState<RepeatedFailure | null>(null);
    const mutation = useMutation<
        WarehouseConnectionStagedTestResults,
        ApiError,
        CreateWarehouseCredentials
    >({
        mutationFn: runStagedConnectionTest,
        onSuccess: (results) => {
            const cause = results.failure?.cause ?? null;
            setRepeatedFailure((previous) => {
                if (cause === null) return null;
                return previous?.cause === cause
                    ? { cause, count: previous.count + 1 }
                    : { cause, count: 1 };
            });
        },
    });
    return {
        run: mutation.mutateAsync,
        isRunning: mutation.isLoading,
        results: mutation.data ?? null,
        error: mutation.error,
        sameCauseFailureCount: repeatedFailure?.count ?? 0,
    };
};
