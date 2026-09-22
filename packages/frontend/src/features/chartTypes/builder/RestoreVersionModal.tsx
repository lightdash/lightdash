import { Stack, Text } from '@mantine/core';
import { IconRestore } from '@tabler/icons-react';
import { type FC } from 'react';
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
            title={`Restore version ${version}?`}
            icon={IconRestore}
            confirmLabel="Restore version"
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
                <Text fz="sm">
                    Restoring creates a new latest version. Charts without a
                    pinned version will use it, clearing any selected fields
                    unavailable in that version. Pinned charts will keep their
                    current version.
                </Text>
                {restoreError && (
                    <Callout variant="danger">
                        {restoreError.error?.message ??
                            'Failed to restore version.'}
                    </Callout>
                )}
            </Stack>
        </MantineModal>
    );
};

export default RestoreVersionModal;
