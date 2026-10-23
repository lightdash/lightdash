import {
    getExpiredPersonalSignInMessage,
    type PersonalSignInExpiry,
} from '@lightdash/common';
import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { useEffect, useRef, useState, type FC } from 'react';
import { useGoogleLoginPopup } from '../../../hooks/gdrive/useGdrive';
import { useProject } from '../../../hooks/useProject';
import { useReconnectSharedSignIn } from '../../../hooks/useReconnectSharedSignIn';
import {
    isWarehouseSignInTargetCurrent,
    type WarehouseSignInTarget,
} from '../../NavBar/warehouseSignInPreflight';
import { BigQuerySSOInput } from '../WarehouseForms/BigQueryForm';

export const SharedSignInReconnectModal: FC<{
    projectUuid: string;
    personalSignIn?: PersonalSignInExpiry;
    target?: WarehouseSignInTarget;
    onClose: () => void;
}> = ({ projectUuid, personalSignIn, target, onClose }) => {
    const { data: project } = useProject(projectUuid);
    const reconnect = useReconnectSharedSignIn(
        projectUuid,
        personalSignIn,
        target,
    );
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    const isCurrent = () =>
        mounted.current && (!target || isWarehouseSignInTargetCurrent(target));
    const [error, setError] = useState<string | null>(null);
    const popup = useGoogleLoginPopup(
        'bigquery',
        () => {
            if (!isCurrent()) return;
            reconnect.mutate(undefined, {
                onError: (apiError) => {
                    if (isCurrent()) setError(apiError.error.message);
                },
            });
        },
        {
            light: true,
            personalCredentialUuid:
                personalSignIn?.userWarehouseCredentialsUuid,
        },
    );

    return (
        <Modal
            opened
            onClose={onClose}
            title={
                personalSignIn
                    ? 'Sign in again to restore your connection'
                    : 'Sign in again to restore this project'
            }
            size="md"
            overlayProps={{ backgroundOpacity: 0.5, blur: 5 }}
        >
            <Stack>
                <Text>
                    {personalSignIn
                        ? getExpiredPersonalSignInMessage(personalSignIn)
                        : `${project?.name ?? 'This project'}'s connection to BigQuery has expired. Sign in with Google again to restore it for everyone.`}
                </Text>
                {error && <Alert color="red">{error}</Alert>}
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>
                        Not now
                    </Button>
                    <BigQuerySSOInput
                        isAuthenticated={false}
                        disabled={popup.isLoading || reconnect.isLoading}
                        openLoginPopup={() => {
                            setError(null);
                            popup.mutate();
                        }}
                    />
                </Group>
            </Stack>
        </Modal>
    );
};
