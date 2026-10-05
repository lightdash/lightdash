import { Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import MantineModal from '../common/MantineModal';
import { EgressIpList } from './EgressIpNotice';
import {
    describeEgressIps,
    type EgressIpCheckpoint,
} from './useEgressIpCheckpoint';

export const EgressIpCheckpointModal: FC<{
    checkpoint: EgressIpCheckpoint;
    title: string;
    onClose: () => void;
}> = ({ checkpoint, title, onClose }) => {
    const { noun, pronoun } = describeEgressIps(checkpoint.ips.length);

    return (
        <MantineModal
            opened={checkpoint.isOpen}
            onClose={onClose}
            title={title}
            confirmLabel="Continue"
            onConfirm={checkpoint.confirm}
            cancelLabel="Back"
            onCancel={checkpoint.back}
        >
            <Stack gap="md">
                <Text size="sm">
                    Lightdash connects to your warehouse from {noun}. Add{' '}
                    {pronoun} to your firewall or allowlist before you continue.
                </Text>
                <EgressIpList ips={checkpoint.ips} />
            </Stack>
        </MantineModal>
    );
};
