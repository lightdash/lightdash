import {
    getWarehouseNetworkEndpoint,
    isApiError,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { useState } from 'react';
import useToaster from '../../../hooks/toaster/useToaster';
import { useStagedConnectionTest } from '../../../hooks/useStagedConnectionTest';

export const useStagedTestGate = (enabled: boolean) => {
    const stagedTest = useStagedConnectionTest();
    const { showToastApiError } = useToaster();
    const [host, setHost] = useState<string | null>(null);

    const passesStagedTest = async (
        warehouseConnection: CreateWarehouseCredentials,
    ): Promise<boolean> => {
        if (!enabled) return true;
        setHost(getWarehouseNetworkEndpoint(warehouseConnection)?.host ?? null);
        try {
            const results = await stagedTest.run(warehouseConnection);
            return results.ok;
        } catch (error) {
            if (isApiError(error)) {
                showToastApiError({
                    title: 'The connection test could not run',
                    apiError: error.error,
                });
            }
            return false;
        }
    };

    return {
        passesStagedTest,
        panelProps: {
            isRunning: stagedTest.isRunning,
            host,
            results: stagedTest.results,
            sameCauseFailureCount: stagedTest.sameCauseFailureCount,
        },
    };
};
