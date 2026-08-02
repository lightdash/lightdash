import {
    type ApiError,
    type RedshiftAwsSsoCompleteRequest,
    type RedshiftAwsSsoCompleteResults,
    type RedshiftAwsSsoStartRequest,
    type RedshiftAwsSsoStartResults,
    type UserWarehouseCredentials,
} from '@lightdash/common';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { lightdashApi } from '../api';
import useToaster from './toaster/useToaster';

type RedshiftAwsSsoLoginRequest = RedshiftAwsSsoStartRequest &
    RedshiftAwsSsoCompleteRequest;

const sleep = (ms: number) =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

const startRedshiftAwsSsoLogin = async (data: RedshiftAwsSsoStartRequest) =>
    lightdashApi<RedshiftAwsSsoStartResults>({
        url: `/user/warehouseCredentials/redshift/aws-sso/start`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const completeRedshiftAwsSsoLogin = async (
    data: RedshiftAwsSsoCompleteRequest,
) =>
    lightdashApi<RedshiftAwsSsoCompleteResults>({
        url: `/user/warehouseCredentials/redshift/aws-sso/complete`,
        method: 'POST',
        body: JSON.stringify(data),
    });

const triggerRedshiftAwsSsoLogin = async (
    data: RedshiftAwsSsoLoginRequest,
): Promise<UserWarehouseCredentials> => {
    const start = await startRedshiftAwsSsoLogin({
        projectUuid: data.projectUuid,
        startUrl: data.startUrl,
        region: data.region,
    });

    const popupWindow = window.open(
        start.verificationUriComplete,
        'aws-sso-login-popup',
        'width=600,height=700',
    );

    if (!popupWindow) {
        throw new Error('Failed to open AWS sign-in window');
    }

    const intervalMs = Math.max(start.interval, 1) * 1000;
    const expiresAt = Date.now() + start.expiresIn * 1000;

    while (Date.now() < expiresAt) {
        await sleep(intervalMs);
        const result = await completeRedshiftAwsSsoLogin({
            accountId: data.accountId,
            roleName: data.roleName,
            projectUuid: data.projectUuid,
            projectName: data.projectName,
            credentialsName: data.credentialsName,
            databaseUser: data.databaseUser,
        });

        if (result.status === 'authenticated') {
            popupWindow.close();
            return result.credentials;
        }
    }

    popupWindow.close();
    throw new Error('AWS sign-in expired. Please try again.');
};

export function useRedshiftAwsSsoLoginPopup({
    onLogin: _onLogin,
}: {
    onLogin: (credentials: UserWarehouseCredentials) => Promise<void>;
}) {
    const { showToastError } = useToaster();
    const queryClient = useQueryClient();
    const ssoMutation = useMutation<
        UserWarehouseCredentials,
        ApiError | Error,
        RedshiftAwsSsoLoginRequest
    >({
        mutationFn: triggerRedshiftAwsSsoLogin,
        onSuccess: async (credentials) => {
            await queryClient.invalidateQueries(['user_warehouse_credentials']);
            await queryClient.invalidateQueries([
                'project_user_warehouse_credentials',
            ]);
            await _onLogin(credentials);
        },
        onError: (error) => {
            showToastError({
                title: 'AWS sign-in failed',
                subtitle:
                    error instanceof Error
                        ? error.message
                        : error.error.message || 'Please try again',
            });
        },
    });

    return useMemo(() => {
        return {
            ...ssoMutation,
        };
    }, [ssoMutation]);
}
