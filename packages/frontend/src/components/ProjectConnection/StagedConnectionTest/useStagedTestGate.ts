import {
    ConnectionInputParseKind,
    getWarehouseConnectionInputIssues,
    getWarehouseNetworkEndpoint,
    isApiError,
    LightdashMode,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { useState } from 'react';
import useToaster from '../../../hooks/toaster/useToaster';
import { useStagedConnectionTest } from '../../../hooks/useStagedConnectionTest';
import useApp from '../../../providers/App/useApp';

export const useStagedTestGate = (enabled: boolean) => {
    const stagedTest = useStagedConnectionTest();
    const { showToastApiError } = useToaster();
    const { health } = useApp();
    const [host, setHost] = useState<string | null>(null);

    const passesStagedTest = async (
        warehouseConnection: CreateWarehouseCredentials,
    ): Promise<boolean> => {
        if (!enabled) return true;
        const needsReview = getWarehouseConnectionInputIssues(
            warehouseConnection,
            { allowLocalHosts: health.data?.mode !== LightdashMode.CLOUD_BETA },
        ).some(
            ({ result }) => result.kind !== ConnectionInputParseKind.NORMALISED,
        );
        if (needsReview) return false;
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
