import { Text } from '@mantine/core';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('aiAccess');
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
            title={t('agentConnections.revoke.title')}
            variant="delete"
            size="sm"
            onClose={() => {
                if (!submitting.current) onClose();
            }}
            confirmLabel={t('agentConnections.revoke.confirm')}
            confirmDisabled={revoke.isLoading}
            confirmLoading={revoke.isLoading}
            cancelDisabled={revoke.isLoading}
            onConfirm={() => void confirm()}
            description={t('agentConnections.revoke.description')}
        >
            <Text>{connection.name}</Text>
            {revoke.error && (
                <InlineErrorState message={revoke.error.error.message} />
            )}
        </MantineModal>
    );
};
