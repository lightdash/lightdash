/**
 * Adds a live data source that reads with an API token, laid out like its
 * settings: how it reaches the integration first, then what it is called.
 */
import { LIVE_INTEGRATION_CATALOG } from '@lightdash/common';
import { PasswordInput, Select, Stack, TextInput } from '@mantine/core';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import { useCreateExternalConnection } from '../hooks/useCreateExternalConnection';
import { useNewSourceId } from '../hooks/useNewSourceId';
import { useTestConnectionConfig } from '../hooks/useTestConnectionConfig';
import { LiveSourceTitle } from './LiveSourceIcon';
import { SettingsCard, SettingsRow } from './LiveSourceSettingsRows';
import { LiveSourceSetupCard } from './LiveSourceSetupCard';
import { LiveSourceTestRow } from './LiveSourceTestRow';
import { NewLiveSourceDetails } from './NewLiveSourceDetails';
import {
    normalizeAccountId,
    toTokenLiveSourceCreatePayload,
    useTokenLiveSourceForm,
    type TokenLiveSourceForm,
} from './tokenLiveSource';

/** Matches the fields of the Details card below. */
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
    const { connector } = definition.toApiSource('');
    const form = useTokenLiveSourceForm(definition, null);
    const createMutation = useCreateExternalConnection();
    const testMutation = useTestConnectionConfig({ showErrorToast: false });
    const sourceId = useNewSourceId({
        projectUuid,
        connector,
        name: form.values.name,
        enabled: opened,
    });
    const isSaving = createMutation.isLoading;
    const { account, regions } = definition;

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
        onCreated(created.externalConnectionUuid);
    });

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            size="xl"
            title={
                <LiveSourceTitle connector={connector}>
                    Add {LIVE_INTEGRATION_CATALOG[connector].label} source
                </LiveSourceTitle>
            }
            confirmLabel="Add source"
            onConfirm={() => handleSave()}
            confirmLoading={isSaving}
            confirmDisabled={sourceId.isBlocked}
            cancelDisabled={isSaving}
        >
            <Stack gap="lg">
                <LiveSourceSetupCard connector={connector} />
                <SettingsCard title="Authentication" titleOutside>
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
                                autoComplete="off"
                                data-autofocus
                                {...form.getInputProps('accountId')}
                            />
                        </SettingsRow>
                    ) : null}
                    {regions ? (
                        <SettingsRow label={regions.label} hint={regions.hint}>
                            <Select
                                w={FIELD_WIDTH}
                                size="xs"
                                aria-label={regions.label}
                                allowDeselect={false}
                                data={regions.options.map((option) => ({
                                    value: option.origin,
                                    label: option.label,
                                }))}
                                {...form.getInputProps('origin')}
                            />
                        </SettingsRow>
                    ) : null}
                    <SettingsRow
                        label={definition.tokenLabel}
                        hint={definition.tokenHint ?? 'Read access is enough'}
                    >
                        <PasswordInput
                            w={FIELD_WIDTH}
                            size="xs"
                            aria-label={definition.tokenLabel}
                            data-autofocus={account ? undefined : true}
                            {...form.getInputProps('token')}
                        />
                    </SettingsRow>
                    <LiveSourceTestRow
                        hint="Checks the details above, without saving"
                        test={testMutation}
                        onTest={handleTest}
                        inputs={[
                            form.values.accountId,
                            form.values.token,
                            form.values.origin,
                        ]}
                    />
                </SettingsCard>

                <NewLiveSourceDetails
                    nameProps={form.getInputProps('name')}
                    sourceId={sourceId}
                />
            </Stack>
        </MantineModal>
    );
};
