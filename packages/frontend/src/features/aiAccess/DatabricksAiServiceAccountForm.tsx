import {
    DatabricksAuthenticationType,
    WarehouseTypes,
    type AiServiceAccountSlot,
    type AiServiceAccountTestResult,
    type DatabricksAiServiceAccountCredentialInput,
} from '@lightdash/common';
import { Button, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import MantineModal from '../../components/common/MantineModal';
import { useSaveAiServiceAccount, useTestAiServiceAccount } from './api';

export const DatabricksAiServiceAccountForm = ({
    projectUuid,
    onClose,
    onSaved,
}: {
    projectUuid: string;
    onClose: () => void;
    onSaved: (
        slot: AiServiceAccountSlot,
        principal: string | null,
        verification: AiServiceAccountTestResult | null,
    ) => void;
}) => {
    const form = useForm({
        initialValues: { oauthClientId: '', oauthClientSecret: '' },
    });
    const save = useSaveAiServiceAccount(projectUuid);
    const test = useTestAiServiceAccount(projectUuid);
    const busy = save.isLoading || test.isLoading;
    const valid =
        form.values.oauthClientId.trim().length > 0 &&
        form.values.oauthClientSecret.trim().length > 0;
    const credentials: DatabricksAiServiceAccountCredentialInput = {
        type: WarehouseTypes.DATABRICKS,
        authenticationType: DatabricksAuthenticationType.OAUTH_M2M,
        ...form.values,
    };
    const close = () => {
        form.reset();
        test.reset();
        save.reset();
        onClose();
    };
    const change = (field: keyof typeof form.values, value: string) => {
        form.setFieldValue(field, value);
        test.reset();
        save.reset();
    };
    return (
        <MantineModal
            opened
            title="AI service account"
            onClose={() => {
                if (!busy) close();
            }}
            cancelDisabled={busy}
            confirmLabel="Test and save"
            confirmDisabled={!valid || busy}
            confirmLoading={save.isLoading}
            onConfirm={() => {
                if (!valid || busy) return;
                save.mutate(credentials, {
                    onSuccess: ({ slot, verification }) => {
                        if (slot)
                            onSaved(
                                slot,
                                verification?.ok
                                    ? verification.principal
                                    : null,
                                verification,
                            );
                        close();
                    },
                });
            }}
            actions={
                <Button
                    variant="default"
                    disabled={!valid || busy}
                    loading={test.isLoading}
                    onClick={() => test.mutate({ credentials })}
                >
                    Test
                </Button>
            }
        >
            <Stack gap="sm">
                <TextInput
                    label="Client ID"
                    required
                    disabled={busy}
                    value={form.values.oauthClientId}
                    onChange={(event) =>
                        change('oauthClientId', event.currentTarget.value)
                    }
                />
                <PasswordInput
                    label="Client secret"
                    required
                    autoComplete="new-password"
                    disabled={busy}
                    value={form.values.oauthClientSecret}
                    onChange={(event) =>
                        change('oauthClientSecret', event.currentTarget.value)
                    }
                />
                {test.data && (
                    <Text size="sm" role={test.data.ok ? 'status' : 'alert'}>
                        {test.data.ok && test.data.principal
                            ? `Signs in as ${test.data.principal}`
                            : test.data.message}
                    </Text>
                )}
                {(save.error || test.error) && (
                    <Text size="sm" c="red" role="alert">
                        {(save.error ?? test.error)?.error.message}
                    </Text>
                )}
            </Stack>
        </MantineModal>
    );
};
