import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('projectConnection');
    const { data: project } = useProject(projectUuid);
    const reconnect = useReconnectSharedSignIn(projectUuid);
    const [error, setError] = useState<string | null>(null);
    const { showToastSuccess } = useToaster();
    const popup = useGoogleLoginPopup('bigquery', () => {
        reconnect.mutate(undefined, {
            onSuccess: () => {
                onClose();
                onRestored();
                showToastSuccess({ title: t('sharedSignIn.restored') });
            },
            onError: (apiError) => setError(apiError.error.message),
        });
    });

    return (
        <Modal
            opened
            onClose={onClose}
            title={t('sharedSignIn.modalTitle')}
            size="md"
            overlayProps={{ backgroundOpacity: 0.5, blur: 5 }}
        >
            <Stack>
                <Text>
                    {project?.name
                        ? t('sharedSignIn.expiredNamed', { name: project.name })
                        : t('sharedSignIn.expired')}
                </Text>
                {error && <Alert color="red">{error}</Alert>}
                <Group justify="flex-end">
                    <Button variant="default" onClick={onClose}>
                        {t('sharedSignIn.notNow')}
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
