import { Text } from '@mantine/core';
import { useRef } from 'react';
import InlineErrorState from '../../components/common/InlineErrorState';
import MantineModal from '../../components/common/MantineModal';
import { useRevokeAgentConnection } from './api';
import { type AgentConnectionRecord } from './types';

export const RevokeAgentConnectionModal = ({
    connection,
    onClose,
}: {
    connection: AgentConnectionRecord;
    onClose: () => void;
}) => {
    const revoke = useRevokeAgentConnection();
    const submitting = useRef(false);
    const confirm = async () => {
        if (submitting.current) return;
        submitting.current = true;
        try {
            await revoke.mutateAsync(connection.grantUuid);
            onClose();
        } catch {
            submitting.current = false;
        }
    };
    return (
        <MantineModal
            opened
            title="Revoke this connection?"
            variant="delete"
            size="sm"
            onClose={() => {
                if (!submitting.current) onClose();
            }}
            confirmLabel="Revoke"
            confirmDisabled={revoke.isLoading}
            confirmLoading={revoke.isLoading}
            cancelDisabled={revoke.isLoading}
            onConfirm={() => void confirm()}
            description="Its credential will stop working. Warehouse sign-ins stay connected."
        >
            <Text>{connection.name}</Text>
            {revoke.error && (
                <InlineErrorState message={revoke.error.error.message} />
            )}
        </MantineModal>
    );
};
