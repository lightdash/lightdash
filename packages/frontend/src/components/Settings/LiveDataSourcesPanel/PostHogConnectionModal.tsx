import { type ExternalConnection } from '@lightdash/common';
import { type FC } from 'react';
import { useCreateExternalConnection } from '../../../features/externalConnections/hooks/useCreateExternalConnection';
import { useUpdateExternalConnection } from '../../../features/externalConnections/hooks/useUpdateExternalConnection';
import MantineModal from '../../common/MantineModal';
import {
    getPostHogSignInUrl,
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
    canSignIn: boolean;
};

export const PostHogConnectionModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    connection,
    canSignIn,
}) => {
    const form = usePostHogConnectionForm(connection, canSignIn);
    const createMutation = useCreateExternalConnection();
    const updateMutation = useUpdateExternalConnection();
    const isSaving = createMutation.isLoading || updateMutation.isLoading;

    const signIn = (connectionUuid: string | null) => {
        if (form.validateField('name').hasError) return;
        window.location.assign(
            getPostHogSignInUrl(projectUuid, form.values, connectionUuid),
        );
    };

    const handleSave = form.onSubmit(async (values) => {
        if (!connection && values.authMethod === 'signIn') {
            signIn(null);
            return;
        }
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
            confirmLabel={
                connection
                    ? 'Save'
                    : form.values.authMethod === 'signIn'
                      ? 'Continue to PostHog'
                      : 'Add source'
            }
            onConfirm={() => handleSave()}
            confirmLoading={isSaving}
            cancelDisabled={isSaving}
        >
            <PostHogConnectionStep
                projectUuid={projectUuid}
                form={form}
                isEditing={!!connection}
                canSignIn={canSignIn}
                onReconnect={
                    connection && canSignIn
                        ? () => signIn(connection.externalConnectionUuid)
                        : null
                }
            />
        </MantineModal>
    );
};
