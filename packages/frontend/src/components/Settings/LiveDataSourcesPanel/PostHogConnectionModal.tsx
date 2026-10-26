import { type ExternalConnection } from '@lightdash/common';
import { type FC } from 'react';
import { useCreateExternalConnection } from '../../../features/externalConnections/hooks/useCreateExternalConnection';
import { useUpdateExternalConnection } from '../../../features/externalConnections/hooks/useUpdateExternalConnection';
import MantineModal from '../../common/MantineModal';
import {
    toPostHogCreatePayload,
    toPostHogUpdatePayload,
    usePostHogConnectionForm,
} from './postHogConnection';
import { PostHogConnectionStep } from './PostHogConnectionStep';

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    connection: ExternalConnection | null;
};

export const PostHogConnectionModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    connection,
}) => {
    const form = usePostHogConnectionForm(connection);
    const createMutation = useCreateExternalConnection();
    const updateMutation = useUpdateExternalConnection();
    const isSaving = createMutation.isLoading || updateMutation.isLoading;

    const handleSave = form.onSubmit(async (values) => {
        if (connection) {
            await updateMutation.mutateAsync({
                projectUuid,
                connectionUuid: connection.externalConnectionUuid,
                data: toPostHogUpdatePayload(values),
            });
        } else {
            await createMutation.mutateAsync({
                projectUuid,
                data: toPostHogCreatePayload(values),
            });
        }
        onClose();
    });

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={connection ? 'Edit PostHog source' : 'Add PostHog source'}
            confirmLabel={connection ? 'Save' : 'Add source'}
            onConfirm={() => handleSave()}
            confirmLoading={isSaving}
            cancelDisabled={isSaving}
        >
            <PostHogConnectionStep
                projectUuid={projectUuid}
                form={form}
                isEditing={!!connection}
            />
        </MantineModal>
    );
};
