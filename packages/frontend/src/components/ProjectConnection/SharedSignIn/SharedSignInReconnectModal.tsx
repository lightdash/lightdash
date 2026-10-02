import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { useState, type FC } from 'react';
import { useGoogleLoginPopup } from '../../../hooks/gdrive/useGdrive';
import useToaster from '../../../hooks/toaster/useToaster';
import { useProject } from '../../../hooks/useProject';
import { useReconnectSharedSignIn } from '../../../hooks/useReconnectSharedSignIn';
import { BigQuerySSOInput } from '../WarehouseForms/BigQueryForm';

export const SharedSignInReconnectModal: FC<{
    projectUuid: string;
    onClose: () => void;
    onRestored: () => void;
}> = ({ projectUuid, onClose, onRestored }) => {
    const { data: project } = useProject(projectUuid);
    const reconnect = useReconnectSharedSignIn(projectUuid);
    const [error, setError] = useState<string | null>(null);
    const { showToastSuccess } = useToaster();
    const popup = useGoogleLoginPopup('bigquery', () => {
        reconnect.mutate(undefined, {
            onSuccess: () => {
                onClose();
                onRestored();
                showToastSuccess({ title: 'Connection restored' });
            },
            onError: (apiError) => setError(apiError.error.message),
        });
    });

    return (
        <Modal
            opened
            onClose={onClose}
            title="Sign in again to restore this project"
            size="md"
            overlayProps={{ backgroundOpacity: 0.5, blur: 5 }}
        >
            <Stack>
                <Text>
                    {project?.name ?? 'This project'}'s connection to BigQuery
                    has expired. Sign in with Google again to restore it for
                    everyone.
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
