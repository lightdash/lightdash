import {
    AthenaAuthenticationType,
    WarehouseTypes,
    type AiServiceAccountSlot,
    type AiServiceAccountTestResult,
    type AthenaAiServiceAccountCredentialInput,
} from '@lightdash/common';
import { Button, PasswordInput, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useTranslation } from 'react-i18next';
import MantineModal from '../../components/common/MantineModal';
import { useSaveAiServiceAccount, useTestAiServiceAccount } from './api';

const s3LocationPattern = /^s3:\/\/[a-z0-9][a-z0-9.-]*[a-z0-9](?:\/[^?#\s]*)?$/;

type AthenaFormValues = Required<
    Omit<AthenaAiServiceAccountCredentialInput, 'type' | 'authenticationType'>
>;

const isValidAthenaCredentials = (values: AthenaFormValues) =>
    values.accessKeyId.trim().length > 0 &&
    values.secretAccessKey.trim().length > 0 &&
    values.workGroup.trim().length > 0 &&
    s3LocationPattern.test(values.s3StagingDir) &&
    (values.sessionToken === '' || values.sessionToken.trim().length > 0) &&
    (values.s3DataDir === '' || s3LocationPattern.test(values.s3DataDir));

export const AthenaAiServiceAccountForm = ({
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
    const { t } = useTranslation('aiAccess');
    const form = useForm<AthenaFormValues>({
        initialValues: {
            accessKeyId: '',
            secretAccessKey: '',
            sessionToken: '',
            workGroup: '',
            s3StagingDir: '',
            s3DataDir: '',
        },
    });
    const save = useSaveAiServiceAccount(projectUuid);
    const test = useTestAiServiceAccount(projectUuid);
    const busy = save.isLoading || test.isLoading;
    const valid = isValidAthenaCredentials(form.values);
    const credentials: AthenaAiServiceAccountCredentialInput = {
        type: WarehouseTypes.ATHENA,
        authenticationType: AthenaAuthenticationType.ACCESS_KEY,
        accessKeyId: form.values.accessKeyId,
        secretAccessKey: form.values.secretAccessKey,
        workGroup: form.values.workGroup,
        s3StagingDir: form.values.s3StagingDir,
        ...(form.values.sessionToken
            ? { sessionToken: form.values.sessionToken }
            : {}),
        ...(form.values.s3DataDir ? { s3DataDir: form.values.s3DataDir } : {}),
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
            title={t('serviceAccountForm.title')}
            onClose={() => {
                if (!busy) close();
            }}
            cancelDisabled={busy}
            confirmLabel={t('serviceAccountForm.testAndSave')}
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
                    {t('serviceAccountCard.test')}
                </Button>
            }
        >
            <Stack gap="sm">
                <TextInput
                    label={t('athenaForm.accessKeyId')}
                    required
                    autoComplete="off"
                    disabled={busy}
                    value={form.values.accessKeyId}
                    onChange={(event) =>
                        change('accessKeyId', event.currentTarget.value)
                    }
                />
                <PasswordInput
                    label={t('athenaForm.secretAccessKey')}
                    required
                    autoComplete="new-password"
                    disabled={busy}
                    value={form.values.secretAccessKey}
                    onChange={(event) =>
                        change('secretAccessKey', event.currentTarget.value)
                    }
                />
                <PasswordInput
                    label={t('athenaForm.sessionToken')}
                    autoComplete="new-password"
                    disabled={busy}
                    value={form.values.sessionToken}
                    onChange={(event) =>
                        change('sessionToken', event.currentTarget.value)
                    }
                />
                <TextInput
                    label={t('athenaForm.workGroup')}
                    required
                    disabled={busy}
                    value={form.values.workGroup}
                    onChange={(event) =>
                        change('workGroup', event.currentTarget.value)
                    }
                />
                <TextInput
                    label={t('athenaForm.s3StagingDir')}
                    required
                    disabled={busy}
                    value={form.values.s3StagingDir}
                    onChange={(event) =>
                        change('s3StagingDir', event.currentTarget.value)
                    }
                />
                <TextInput
                    label={t('athenaForm.s3DataDir')}
                    disabled={busy}
                    value={form.values.s3DataDir}
                    onChange={(event) =>
                        change('s3DataDir', event.currentTarget.value)
                    }
                />
                {test.data && (
                    <Text size="sm" role={test.data.ok ? 'status' : 'alert'}>
                        {test.data.ok && test.data.principal
                            ? t('serviceAccountDetails.signsInAs', {
                                  principal: test.data.principal,
                              })
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
