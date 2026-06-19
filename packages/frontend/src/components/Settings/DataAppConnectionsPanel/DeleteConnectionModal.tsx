import { type ExternalConnection } from '@lightdash/common';
import { type FC } from 'react';
import { useDeleteExternalConnection } from '../../../features/externalConnections/hooks/useDeleteExternalConnection';
import MantineModal, {
    type MantineModalProps,
} from '../../common/MantineModal';

type Props = Pick<MantineModalProps, 'opened' | 'onClose'> & {
    projectUuid: string;
    connection: ExternalConnection;
};

export const DeleteConnectionModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    connection,
}) => {
    const { mutateAsync, isLoading: isDeleting } =
        useDeleteExternalConnection();

    const handleConfirm = async () => {
        await mutateAsync({
            projectUuid,
            connectionUuid: connection.externalConnectionUuid,
        });
        onClose();
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Delete connection"
            variant="delete"
            resourceType="connection"
            resourceLabel={connection.name}
            cancelDisabled={isDeleting}
            onConfirm={handleConfirm}
            confirmLoading={isDeleting}
        />
    );
};
