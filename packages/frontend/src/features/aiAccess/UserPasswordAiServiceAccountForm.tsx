import {
    type WarehouseTypes,
    type AiServiceAccountSlot,
    type AiServiceAccountTestResult,
    type AiServiceAccountCredentialInput,
} from '@lightdash/common';
import { Button, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { zod4Resolver as zodResolver } from 'mantine-form-zod-resolver';
import { z } from 'zod';
import Callout from '../../components/common/Callout';
import MantineModal from '../../components/common/MantineModal';
import { useSaveAiServiceAccount, useTestAiServiceAccount } from './api';

const formSchema = z.object({
    user: z.string().trim().min(1),
    password: z.string().min(1),
});

interface UserPasswordAiServiceAccountFormCallbacks {
    projectUuid: string;
    onClose: () => void;
    onSaved: (
        slot: AiServiceAccountSlot,
        principal: string | null,
        verification: AiServiceAccountTestResult | null,
    ) => void;
}

interface UserPasswordAiServiceAccountFormProps extends UserPasswordAiServiceAccountFormCallbacks {
    warehouseType: WarehouseTypes.POSTGRES | WarehouseTypes.REDSHIFT;
    userDescription: string;
}

export const UserPasswordAiServiceAccountForm = ({
    projectUuid,
    onClose,
    onSaved,
    warehouseType,
    userDescription,
}: UserPasswordAiServiceAccountFormProps) => {
    const form = useForm({
        initialValues: { user: '', password: '' },
        validate: zodResolver(formSchema),
    });
    const save = useSaveAiServiceAccount(projectUuid);
    const test = useTestAiServiceAccount(projectUuid);
    const busy = save.isLoading || test.isLoading;
    const valid = formSchema.safeParse(form.values).success;
    const credentials: AiServiceAccountCredentialInput = {
        type: warehouseType,
        user: form.values.user.trim(),
        password: form.values.password,
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
                    onClick={() => {
                        if (valid && !busy) test.mutate({ credentials });
                    }}
                >
                    Test
                </Button>
            }
        >
            <Stack gap="sm">
                <TextInput
                    label="User"
                    description={userDescription}
                    required
                    disabled={busy}
                    value={form.values.user}
                    onChange={(event) =>
                        change('user', event.currentTarget.value)
                    }
                />
                <PasswordInput
                    label="Password"
                    required
                    autoComplete="new-password"
                    disabled={busy}
                    value={form.values.password}
                    onChange={(event) =>
                        change('password', event.currentTarget.value)
                    }
                />
                {test.data &&
                    (test.data.ok ? (
                        <Text size="sm" role="status">
                            {test.data.principal
                                ? `Signs in as ${test.data.principal}`
                                : test.data.message}
                        </Text>
                    ) : (
                        <Callout variant="danger" role="alert">
                            {test.data.message}
                        </Callout>
                    ))}
                {(save.error || test.error) && (
                    <Callout variant="danger" role="alert">
                        {(save.error ?? test.error)?.error.message}
                    </Callout>
                )}
            </Stack>
        </MantineModal>
    );
};
