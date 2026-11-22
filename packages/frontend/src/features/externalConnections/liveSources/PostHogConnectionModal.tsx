import { ApiConnectorType, type ExternalConnection } from '@lightdash/common';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import {
    LIVE_SOURCE_CREATE_MESSAGES,
    useCreateExternalConnection,
} from '../hooks/useCreateExternalConnection';
import { useNewSourceId } from '../hooks/useNewSourceId';
import {
    LIVE_SOURCE_UPDATE_MESSAGES,
    useUpdateExternalConnection,
} from '../hooks/useUpdateExternalConnection';
import {
    getPostHogSignInUrl,
    toPostHogCreatePayload,
    toPostHogUpdatePayload,
    usePostHogConnectionForm,
} from './postHogConnection';
import { PostHogConnectionStep } from './PostHogConnectionStep';
import { SourceIdField } from './SourceIdField';

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    connection: ExternalConnection | null;
    canSignIn: boolean;
    onCreated: (connectionUuid: string) => void;
};

export const PostHogConnectionModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    connection,
    canSignIn,
    onCreated,
}) => {
    const form = usePostHogConnectionForm(connection, canSignIn);
    const createMutation = useCreateExternalConnection(
        LIVE_SOURCE_CREATE_MESSAGES,
    );
    const updateMutation = useUpdateExternalConnection(
        LIVE_SOURCE_UPDATE_MESSAGES,
    );
    const sourceId = useNewSourceId({
        projectUuid,
        connector: ApiConnectorType.POSTHOG,
        name: form.values.name,
        enabled: opened && !connection,
    });
    const isSaving = createMutation.isLoading || updateMutation.isLoading;

    const signIn = (connectionUuid: string | null) => {
        if (form.validateField('name').hasError) return;
        window.location.assign(
            getPostHogSignInUrl(
                projectUuid,
                form.values,
                connectionUuid,
                'settings',
                connectionUuid ? undefined : sourceId.value,
            ),
        );
    };

    const handleSave = form.onSubmit(async (values) => {
        if (sourceId.isBlocked) return;
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
            onClose();
            return;
        }
        const created = await createMutation.mutateAsync({
            projectUuid,
            data: toPostHogCreatePayload(values, sourceId.value),
        });
        onCreated(created.externalConnectionUuid);
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
            confirmDisabled={sourceId.isBlocked}
            cancelDisabled={isSaving}
        >
            <PostHogConnectionStep
                showIntro
                projectUuid={projectUuid}
                form={form}
                isEditing={!!connection}
                canSignIn={canSignIn}
                onReconnect={
                    connection && canSignIn
                        ? () => signIn(connection.externalConnectionUuid)
                        : null
                }
                sourceIdField={
                    <SourceIdField
                        connection={connection}
                        sourceId={sourceId}
                    />
                }
            />
        </MantineModal>
    );
};
