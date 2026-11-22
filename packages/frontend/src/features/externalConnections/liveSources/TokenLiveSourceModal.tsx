/**
 * Adds a live data source that reads with an API token, laid out like its
 * settings: how it reaches the integration first, then what it is called.
 */
import { LIVE_SOURCE_AI_HINT_MAX_LENGTH } from '@lightdash/common';
import {
    Anchor,
    Button,
    PasswordInput,
    Stack,
    Textarea,
    TextInput,
} from '@mantine/core';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import { useCreateExternalConnection } from '../hooks/useCreateExternalConnection';
import { useNewSourceId } from '../hooks/useNewSourceId';
import { useTestConnectionConfig } from '../hooks/useTestConnectionConfig';
import { useUpdateExternalConnection } from '../hooks/useUpdateExternalConnection';
import {
    SettingsCard,
    SettingsRow,
    TestOutcome,
} from './LiveSourceSettingsRows';
import {
    normalizeAccountId,
    toTokenLiveSourceCreatePayload,
    useTokenLiveSourceForm,
    type TokenLiveSourceForm,
} from './tokenLiveSource';

const FIELD_WIDTH = 240;

type Props = {
    form: TokenLiveSourceForm;
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    onCreated: (connectionUuid: string) => void;
};

export const TokenLiveSourceModal: FC<Props> = ({
    form: definition,
    opened,
    onClose,
    projectUuid,
    onCreated,
}) => {
    const form = useTokenLiveSourceForm(definition, null);
    const createMutation = useCreateExternalConnection();
    const updateMutation = useUpdateExternalConnection();
    const testMutation = useTestConnectionConfig();
    const sourceId = useNewSourceId({
        projectUuid,
        connector: definition.toApiSource('').connector,
        name: form.values.name,
        enabled: opened,
    });
    const isSaving = createMutation.isLoading || updateMutation.isLoading;
    const { account } = definition;

    const handleTest = () => {
        if (form.validate().hasErrors) return;
        testMutation.mutate({
            projectUuid,
            config: toTokenLiveSourceCreatePayload(definition, form.values),
            ...definition.getTestRequest(
                normalizeAccountId(definition, form.values.accountId),
            ),
        });
    };

    const handleSave = form.onSubmit(async (values) => {
        if (sourceId.isBlocked) return;
        const created = await createMutation.mutateAsync({
            projectUuid,
            data: {
                ...toTokenLiveSourceCreatePayload(definition, values),
                explorePrefix: sourceId.value,
            },
        });
        const aiHint = values.aiHint?.trim() ?? '';
        // Creating doesn't take a hint, so it's saved straight after.
        if (aiHint) {
            await updateMutation
                .mutateAsync({
                    projectUuid,
                    connectionUuid: created.externalConnectionUuid,
                    data: { aiHint },
                })
                .catch(() => undefined);
        }
        onCreated(created.externalConnectionUuid);
    });

    const tokenHint = testMutation.data ? (
        <TestOutcome response={testMutation.data} />
    ) : (
        <>
            {definition.tokenHint}
            {definition.tokenUrl ? (
                <>
                    {' '}
                    <Anchor
                        href={definition.tokenUrl}
                        target="_blank"
                        rel="noreferrer"
                        fz="inherit"
                    >
                        Create one
                    </Anchor>
                </>
            ) : null}
        </>
    );

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            size="xl"
            title={`Add ${definition.label} source`}
            confirmLabel="Add source"
            onConfirm={() => handleSave()}
            confirmLoading={isSaving}
            confirmDisabled={sourceId.isBlocked}
            cancelDisabled={isSaving}
        >
            <Stack gap="lg">
                <SettingsCard title="Access">
                    {account ? (
                        <SettingsRow
                            label={account.label}
                            hint={account.description}
                        >
                            <TextInput
                                w={FIELD_WIDTH}
                                size="xs"
                                aria-label={account.label}
                                placeholder={account.placeholder}
                                data-autofocus
                                {...form.getInputProps('accountId')}
                            />
                        </SettingsRow>
                    ) : null}
                    <SettingsRow label={definition.tokenLabel} hint={tokenHint}>
                        <PasswordInput
                            w={FIELD_WIDTH}
                            size="xs"
                            aria-label={definition.tokenLabel}
                            data-autofocus={account ? undefined : true}
                            {...form.getInputProps('token')}
                        />
                        <Button
                            size="xs"
                            variant="default"
                            onClick={handleTest}
                            loading={testMutation.isLoading}
                        >
                            Test
                        </Button>
                    </SettingsRow>
                </SettingsCard>

                <SettingsCard title="Details">
                    <SettingsRow
                        label="Name"
                        hint="Shown in explores and to agents"
                    >
                        <TextInput
                            w={FIELD_WIDTH}
                            size="xs"
                            aria-label="Name"
                            {...form.getInputProps('name')}
                        />
                    </SettingsRow>
                    <SettingsRow
                        label="Explore prefix"
                        hint={
                            sourceId.error ??
                            "Added to the start of each explore name, can't be changed later"
                        }
                    >
                        <TextInput
                            w={FIELD_WIDTH}
                            size="xs"
                            aria-label="Explore prefix"
                            value={sourceId.value}
                            error={sourceId.error !== null}
                            onChange={(event) =>
                                sourceId.onChange(event.currentTarget.value)
                            }
                        />
                    </SettingsRow>
                    <SettingsRow
                        label="AI hint"
                        hint="Helps agents pick this source"
                    >
                        <Textarea
                            w={FIELD_WIDTH}
                            size="xs"
                            aria-label="AI hint"
                            placeholder="For example: EU storefront"
                            autosize
                            minRows={1}
                            maxRows={4}
                            maxLength={LIVE_SOURCE_AI_HINT_MAX_LENGTH}
                            {...form.getInputProps('aiHint')}
                        />
                    </SettingsRow>
                </SettingsCard>
            </Stack>
        </MantineModal>
    );
};
