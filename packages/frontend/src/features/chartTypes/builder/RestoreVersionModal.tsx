import { Stack, Text } from '@mantine/core';
import { IconRestore } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import Callout from '../../../components/common/Callout';
import MantineModal from '../../../components/common/MantineModal';
import { useRestoreAppVersion } from '../../apps/hooks/useRestoreAppVersion';

type Props = {
    projectUuid: string;
    appUuid: string;
    version: number;
    onClose: () => void;
};

const RestoreVersionModal: FC<Props> = ({
    projectUuid,
    appUuid,
    version,
    onClose,
}) => {
    const { t } = useTranslation('chartTypes');
    const {
        mutate: restoreVersion,
        isLoading: isRestoring,
        error: restoreError,
    } = useRestoreAppVersion();

    return (
        <MantineModal
            opened
            onClose={() => {
                if (isRestoring) return;
                onClose();
            }}
            title={t('restore.title', { version })}
            icon={IconRestore}
            confirmLabel={t('restore.confirm')}
            cancelDisabled={isRestoring}
            confirmLoading={isRestoring}
            onConfirm={() =>
                restoreVersion(
                    { projectUuid, appUuid, version },
                    { onSuccess: onClose },
                )
            }
        >
            <Stack gap="sm">
                <Text fz="sm">{t('restore.description')}</Text>
                {restoreError && (
                    <Callout variant="danger">
                        {restoreError.error?.message ?? t('restore.failed')}
                    </Callout>
                )}
            </Stack>
        </MantineModal>
    );
};

export default RestoreVersionModal;
