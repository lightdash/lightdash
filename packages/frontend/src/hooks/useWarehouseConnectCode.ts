import {
    type ApiError,
    type ClaimWarehouseConnectCodeRequest,
    type WarehouseConnectCode,
    type WarehouseConnectCodeClaimResult,
} from '@lightdash/common';
import { useMutation, useQuery } from '@tanstack/react-query';
import { lightdashApi } from '../api';

const mintWarehouseConnectCode = async () =>
    lightdashApi<WarehouseConnectCode>({
        url: `/warehouse-connect/code`,
        method: 'POST',
        body: undefined,
    });

const claimWarehouseConnectCode = async (
    body: ClaimWarehouseConnectCodeRequest,
) =>
    lightdashApi<WarehouseConnectCodeClaimResult>({
        url: `/warehouse-connect/claim`,
        method: 'POST',
        body: JSON.stringify(body),
    });

export const useMintWarehouseConnectCode = () =>
    useMutation<WarehouseConnectCode, ApiError>(mintWarehouseConnectCode);

export const useWarehouseConnectCodeClaim = (
    code: string | null,
    enabled: boolean,
) =>
    useQuery<WarehouseConnectCodeClaimResult, ApiError>(
        ['warehouse-connect-claim', code],
        () => claimWarehouseConnectCode({ code: code ?? '' }),
        {
            enabled: enabled && !!code,
            refetchInterval: enabled ? 2000 : false,
            refetchOnWindowFocus: false,
            retry: false,
        },
    );
