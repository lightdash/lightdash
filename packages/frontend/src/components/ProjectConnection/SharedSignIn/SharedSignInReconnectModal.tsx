import {
    FeatureFlags,
    getExpiredPersonalSignInMessage,
    type PersonalSignInExpiry,
} from '@lightdash/common';
import { Alert, Stack, Text } from '@mantine/core';
import { useState, type FC } from 'react';
import { useGoogleLoginPopup } from '../../../hooks/gdrive/useGdrive';
import useToaster from '../../../hooks/toaster/useToaster';
import { useProject } from '../../../hooks/useProject';
import { useReconnectSharedSignIn } from '../../../hooks/useReconnectSharedSignIn';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import MantineModal from '../../common/MantineModal';
import { BigQuerySSOInput } from '../WarehouseForms/BigQueryForm';

export const SharedSignInReconnectModal: FC<{
    projectUuid: string;
    personalSignIn?: PersonalSignInExpiry;
    onClose: () => void;
    onRestored: () => void;
}> = ({ projectUuid, personalSignIn, onClose, onRestored }) => {
    const { data: project } = useProject(projectUuid);
    const reconnect = useReconnectSharedSignIn(projectUuid, personalSignIn);
    const [error, setError] = useState<string | null>(null);
    const { showToastSuccess } = useToaster();
    const lightFlag = useServerFeatureFlag(FeatureFlags.LightGoogleReconnect);
    const reconnectFlag = useServerFeatureFlag(
        FeatureFlags.SharedSignInReconnect,
    );
    const popup = useGoogleLoginPopup(
        'bigquery',
        () => {
            reconnect.mutate(undefined, {
                onSuccess: () => {
                    onClose();
                    onRestored();
                    showToastSuccess({ title: 'Connection restored' });
                },
                onError: (apiError) => setError(apiError.error.message),
            });
        },
        {
            light:
                lightFlag.data?.enabled === true &&
                reconnectFlag.data?.enabled === true,
            personalCredentialUuid:
                personalSignIn?.userWarehouseCredentialsUuid,
        },
    );

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={
                personalSignIn
                    ? 'Sign in again to restore your connection'
                    : 'Sign in again to restore this project'
            }
            size="md"
            cancelLabel="Not now"
            actions={
                <BigQuerySSOInput
                    isAuthenticated={false}
                    disabled={popup.isLoading || reconnect.isLoading}
                    openLoginPopup={() => {
                        setError(null);
                        popup.mutate();
                    }}
                />
            }
        >
            <Stack>
                <Text>
                    {personalSignIn
                        ? getExpiredPersonalSignInMessage(personalSignIn)
                        : `${project?.name ?? 'This project'}'s connection to BigQuery has expired. Sign in with Google again to restore it for everyone.`}
                </Text>
                {error && <Alert color="red">{error}</Alert>}
            </Stack>
        </MantineModal>
    );
};
