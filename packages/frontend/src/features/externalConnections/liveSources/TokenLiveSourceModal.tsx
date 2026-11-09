import { type ExternalConnection } from '@lightdash/common';
import {
    Button,
    Group,
    PasswordInput,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import { ConnectionTestResult } from '../components/ConnectionTestResult';
import { useCreateExternalConnection } from '../hooks/useCreateExternalConnection';
import { useTestConnectionConfig } from '../hooks/useTestConnectionConfig';
import { useUpdateExternalConnection } from '../hooks/useUpdateExternalConnection';
import {
    toTokenLiveSourceCreatePayload,
    toTokenLiveSourceUpdatePayload,
    useTokenLiveSourceForm,
    type TokenLiveSourceForm,
} from './tokenLiveSource';

type Props = {
    form: TokenLiveSourceForm;
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    connection: ExternalConnection | null;
    onCreated: (connectionUuid: string) => void;
};

export const TokenLiveSourceModal: FC<Props> = ({
    form: definition,
    opened,
    onClose,
    projectUuid,
    connection,
    onCreated,
}) => {
    const form = useTokenLiveSourceForm(definition, connection);
    const createMutation = useCreateExternalConnection();
    const updateMutation = useUpdateExternalConnection();
    const testMutation = useTestConnectionConfig();
    const isSaving = createMutation.isLoading || updateMutation.isLoading;
    const isEditing = !!connection;

    const handleTest = () => {
        if (form.validate().hasErrors) return;
        testMutation.mutate({
            projectUuid,
            config: toTokenLiveSourceCreatePayload(definition, form.values),
            ...definition.getTestRequest(
                definition.account.normalize(form.values.accountId),
            ),
        });
    };

    const handleSave = form.onSubmit(async (values) => {
        if (connection) {
            await updateMutation.mutateAsync({
                projectUuid,
                connectionUuid: connection.externalConnectionUuid,
                data: toTokenLiveSourceUpdatePayload(definition, values),
            });
            onClose();
            return;
        }
        const created = await createMutation.mutateAsync({
            projectUuid,
            data: toTokenLiveSourceCreatePayload(definition, values),
        });
        onCreated(created.externalConnectionUuid);
    });

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={`${isEditing ? 'Edit' : 'Add'} ${definition.label} source`}
            confirmLabel={isEditing ? 'Save' : 'Add source'}
            onConfirm={() => handleSave()}
            confirmLoading={isSaving}
            cancelDisabled={isSaving}
        >
            <Stack gap="sm">
                <Text c="dimmed" fz="sm">
                    {definition.description}
                </Text>
                <TextInput
                    required
                    label="Name"
                    data-autofocus
                    {...form.getInputProps('name')}
                />
                <TextInput
                    required
                    label={definition.account.label}
                    description={definition.account.description}
                    placeholder={definition.account.placeholder}
                    {...form.getInputProps('accountId')}
                />
                <PasswordInput
                    required={!isEditing}
                    label={definition.tokenLabel}
                    description={
                        isEditing
                            ? 'Leave blank to keep the current token'
                            : null
                    }
                    {...form.getInputProps('token')}
                />
                <Group>
                    <Button
                        type="button"
                        variant="default"
                        onClick={handleTest}
                        loading={testMutation.isLoading}
                        disabled={isEditing && form.values.token.trim() === ''}
                    >
                        Test connection
                    </Button>
                </Group>
                {testMutation.data && (
                    <ConnectionTestResult response={testMutation.data} />
                )}
            </Stack>
        </MantineModal>
    );
};
