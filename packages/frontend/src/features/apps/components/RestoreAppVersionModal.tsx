import { type ApiError } from '@lightdash/common';
import { Stack, Text } from '@mantine/core';
import { IconRestore } from '@tabler/icons-react';
import { type FC } from 'react';
import Callout from '../../../components/common/Callout';
import MantineModal from '../../../components/common/MantineModal';

type Props = {
    version: number;
    onClose: () => void;
    onConfirm: () => void;
    isLoading: boolean;
    error: ApiError | null;
};

/** Confirms a restore; the caller owns the mutation so the builder and the
 *  thread preview can restore through different endpoints. */
export const RestoreAppVersionModal: FC<Props> = ({
    version,
    onClose,
    onConfirm,
    isLoading,
    error,
}) => (
    <MantineModal
        opened
        onClose={() => {
            if (isLoading) return;
            onClose();
        }}
        title={`Restore version ${version}?`}
        icon={IconRestore}
        confirmLabel="Restore version"
        cancelDisabled={isLoading}
        confirmLoading={isLoading}
        onConfirm={onConfirm}
    >
        <Stack gap="sm">
            <Text fz="sm">
                This will create a new version on top of the timeline that
                duplicates the contents of version {version}. Your next prompt
                will iterate from there.
            </Text>
            {error !== null && (
                <Callout variant="danger">
                    {error.error?.message ?? 'Failed to restore version.'}
                </Callout>
            )}
        </Stack>
    </MantineModal>
);
