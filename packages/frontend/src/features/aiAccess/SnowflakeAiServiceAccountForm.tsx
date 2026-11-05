import {
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type AiServiceAccountSlot,
    type ApiError,
    type AiServiceAccountTestResult,
    type SnowflakeAiServiceAccountCredentialInput,
} from '@lightdash/common';
import {
    Button,
    FileInput,
    Input,
    PasswordInput,
    SegmentedControl,
    Stack,
    Text,
    Textarea,
    TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useEffect, useId, useRef, useState } from 'react';
import Callout from '../../components/common/Callout';
import MantineModal from '../../components/common/MantineModal';
import { useSaveAiServiceAccount, useTestAiServiceAccount } from './api';
import { getSnowflakeAiPrincipal } from './snowflakeAiPrincipal';

const SnowflakeAiServiceAccountFeedback = ({
    result,
    error,
}: {
    result: AiServiceAccountTestResult | null;
    error: ApiError | null;
}) => {
    const principal = getSnowflakeAiPrincipal(result);
    return (
        <>
            {result &&
                (result.ok ? (
                    <Text size="sm" role="status">
                        {principal
                            ? `Signs in as ${principal}`
                            : result.message}
                    </Text>
                ) : (
                    <Callout variant="danger" role="alert">
                        {result.message}
                    </Callout>
                ))}
            {error && (
                <Callout variant="danger" role="alert">
                    {error.error.message}
                </Callout>
            )}
        </>
    );
};

export const SnowflakeAiServiceAccountForm = ({
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
    const privateKeyId = useId();
    const save = useSaveAiServiceAccount(projectUuid);
    const test = useTestAiServiceAccount(projectUuid);
    const [mode, setMode] = useState('file');
    const [file, setFile] = useState<File | null>(null);
    const [reading, setReading] = useState(false);
    const [fileError, setFileError] = useState<string | null>(null);
    const reader = useRef<FileReader | null>(null);
    const form = useForm({
        initialValues: {
            user: '',
            privateKey: '',
            privateKeyPass: '',
            role: '',
            warehouse: '',
        },
        onValuesChange: () => {
            test.reset();
            save.reset();
        },
        validate: {
            user: (value) => (value.trim() ? null : 'Enter a user.'),
            role: (value) => (value.trim() ? null : 'Enter a role.'),
            warehouse: (value) => (value.trim() ? null : 'Enter a warehouse.'),
            privateKey: (value) =>
                /^-----BEGIN (PRIVATE KEY|ENCRYPTED PRIVATE KEY|RSA PRIVATE KEY)-----\s+\S[\s\S]*?\s+-----END \1-----$/.test(
                    value.trim(),
                )
                    ? null
                    : 'Enter a PEM private key.',
        },
    });
    useEffect(
        () => () => {
            const current = reader.current;
            reader.current = null;
            current?.abort();
        },
        [],
    );
    const busy = save.isLoading || test.isLoading;
    const credentials = (): SnowflakeAiServiceAccountCredentialInput => ({
        type: WarehouseTypes.SNOWFLAKE,
        authenticationType: SnowflakeAuthenticationType.PRIVATE_KEY,
        ...form.values,
        privateKeyPass: form.values.privateKeyPass || null,
    });
    const close = () => {
        if (busy) return;
        reader.current?.abort();
        reader.current = null;
        form.reset();
        save.reset();
        test.reset();
        onClose();
    };
    const readFile = (next: File | null) => {
        const previous = reader.current;
        reader.current = null;
        previous?.abort();
        setFile(next);
        setReading(false);
        setFileError(null);
        form.setFieldValue('privateKey', '');
        if (!next) return;
        if (!/\.(p8|pem)$/i.test(next.name)) {
            setFileError('Choose a .p8 or .pem file.');
            return;
        }
        const current = new FileReader();
        reader.current = current;
        setReading(true);
        current.onload = () => {
            if (reader.current !== current) return;
            reader.current = null;
            setReading(false);
            if (typeof current.result === 'string')
                form.setFieldValue('privateKey', current.result);
            else setFileError('Could not read the private key file.');
        };
        current.onerror = () => {
            if (reader.current !== current) return;
            reader.current = null;
            setReading(false);
            setFileError('Could not read the private key file.');
        };
        current.readAsText(next);
    };
    return (
        <MantineModal
            opened
            title="Shared agent account"
            onClose={close}
            withCloseButton={!busy}
            cancelDisabled={busy}
            confirmLabel={
                save.isLoading ? 'Checking and saving…' : 'Test and save'
            }
            confirmLoading={save.isLoading}
            confirmDisabled={busy || reading || !form.isValid()}
            onConfirm={() => {
                if (form.validate().hasErrors || busy || reading) return;
                save.mutate(credentials(), {
                    onSuccess: ({ slot, verification }) => {
                        if (slot)
                            onSaved(
                                slot,
                                getSnowflakeAiPrincipal(verification),
                                verification,
                            );
                        form.reset();
                        save.reset();
                        test.reset();
                        onClose();
                    },
                });
            }}
            actions={
                <Button
                    variant="default"
                    disabled={busy || reading || !form.isValid()}
                    loading={test.isLoading}
                    onClick={() => {
                        if (!form.validate().hasErrors)
                            test.mutate({ credentials: credentials() });
                    }}
                >
                    Test
                </Button>
            }
        >
            <Stack gap="sm">
                <TextInput
                    label="User"
                    required
                    disabled={busy}
                    {...form.getInputProps('user')}
                />
                <Input.Wrapper label="Private key" id={privateKeyId} required>
                    <Stack gap="xs">
                        <SegmentedControl
                            aria-label="Private key input"
                            value={mode}
                            disabled={busy}
                            data={[
                                { value: 'file', label: 'Upload file' },
                                { value: 'paste', label: 'Paste key' },
                            ]}
                            onChange={(next) => {
                                readFile(null);
                                setMode(next);
                            }}
                        />
                        {mode === 'file' ? (
                            <FileInput
                                id={privateKeyId}
                                required
                                accept=".p8,.pem"
                                value={file}
                                onChange={readFile}
                                disabled={busy}
                                error={fileError ?? form.errors.privateKey}
                                clearable
                            />
                        ) : (
                            <Textarea
                                id={privateKeyId}
                                required
                                minRows={5}
                                disabled={busy}
                                {...form.getInputProps('privateKey')}
                            />
                        )}
                    </Stack>
                </Input.Wrapper>
                {fileError && (
                    <Callout variant="danger" role="alert">
                        {fileError}
                    </Callout>
                )}
                <PasswordInput
                    label="Passphrase (optional)"
                    autoComplete="new-password"
                    disabled={busy}
                    {...form.getInputProps('privateKeyPass')}
                />
                <TextInput
                    label="Role"
                    required
                    disabled={busy}
                    {...form.getInputProps('role')}
                />
                <TextInput
                    label="Warehouse"
                    required
                    disabled={busy}
                    {...form.getInputProps('warehouse')}
                />
                <SnowflakeAiServiceAccountFeedback
                    result={test.data ?? null}
                    error={save.error ?? test.error}
                />
            </Stack>
        </MantineModal>
    );
};
