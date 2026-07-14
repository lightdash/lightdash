import {
    type ApiError,
    type ConnectionDiagnosticResult,
    type CreateWarehouseCredentials,
    type TestOnboardingConnectionRequest,
} from '@lightdash/common';
import { useMutation } from '@tanstack/react-query';
import { lightdashApi } from '../../../api';

const testConnection = async (
    warehouseConnection: CreateWarehouseCredentials,
): Promise<ConnectionDiagnosticResult> => {
    const body: TestOnboardingConnectionRequest = { warehouseConnection };
    return lightdashApi<ConnectionDiagnosticResult>({
        url: `/onboarding/connection/test`,
        method: 'POST',
        body: JSON.stringify(body),
    });
};

export const useConnectionTest = () =>
    useMutation<
        ConnectionDiagnosticResult,
        ApiError,
        CreateWarehouseCredentials
    >({
        mutationKey: ['onboarding', 'connection-test'],
        mutationFn: testConnection,
    });
