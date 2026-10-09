import {
    type ApiError,
    type ClaimWarehouseConnectCodeRequest,
    type WarehouseConnectCode,
    type WarehouseConnectCodeClaimResult,
} from '@lightdash/common';
import { useMutation, useQuery } from '@tanstack/react-query';
import { type LightdashApi } from '../api';
import { useLightdashApi } from '../providers/LightdashApi/useLightdashApi';

const mintWarehouseConnectCode = async (lightdashApi: LightdashApi) =>
    lightdashApi<WarehouseConnectCode>({
        url: `/warehouse-connect/code`,
        method: 'POST',
        body: undefined,
    });

const claimWarehouseConnectCode = async (
    lightdashApi: LightdashApi,
    body: ClaimWarehouseConnectCodeRequest,
) =>
    lightdashApi<WarehouseConnectCodeClaimResult>({
        url: `/warehouse-connect/claim`,
        method: 'POST',
        body: JSON.stringify(body),
    });

export const useMintWarehouseConnectCode = () => {
    const lightdashApi = useLightdashApi();
    return useMutation<WarehouseConnectCode, ApiError>(() =>
        mintWarehouseConnectCode(lightdashApi),
    );
};

export const useWarehouseConnectCodeClaim = (
    code: string | null,
    enabled: boolean,
) => {
    const lightdashApi = useLightdashApi();
    return useQuery<WarehouseConnectCodeClaimResult, ApiError>(
        ['warehouse-connect-claim', code],
        () => claimWarehouseConnectCode(lightdashApi, { code: code ?? '' }),
        {
            enabled: enabled && !!code,
            refetchInterval: enabled ? 2000 : false,
            refetchOnWindowFocus: false,
            retry: false,
        },
    );
};
