/**
 * Adds a Supabase live data source: the project URL, one table and a secret
 * key, laid out like the token dialog.
 */
import { ApiConnectorType, LIVE_INTEGRATION_CATALOG } from '@lightdash/common';
import { PasswordInput, Stack, TextInput } from '@mantine/core';
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
    getSupabaseTestRequest,
    toSupabaseCreatePayload,
    useSupabaseConnectionForm,
} from './supabaseConnection';

/** Matches the fields of the Details card below. */
const FIELD_WIDTH = 240;
const CONNECTOR = ApiConnectorType.SUPABASE;

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    onCreated: (connectionUuid: string) => void;
};

export const SupabaseConnectionModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    onCreated,
}) => {
    const form = useSupabaseConnectionForm();
    const createMutation = useCreateExternalConnection();
    const testMutation = useTestConnectionConfig({ showErrorToast: false });
    const sourceId = useNewSourceId({
        projectUuid,
        connector: CONNECTOR,
        name: form.values.name,
        enabled: opened,
    });
    const isSaving = createMutation.isLoading;

    const handleTest = () => {
        if (form.validate().hasErrors) return;
        testMutation.mutate({
            projectUuid,
            config: toSupabaseCreatePayload(form.values),
            ...getSupabaseTestRequest(form.values.table),
        });
    };

    const handleSave = form.onSubmit(async (values) => {
        if (sourceId.isBlocked) return;
        const created = await createMutation.mutateAsync({
            projectUuid,
            data: {
                ...toSupabaseCreatePayload(values),
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
                <LiveSourceTitle connector={CONNECTOR}>
                    Add {LIVE_INTEGRATION_CATALOG[CONNECTOR].label} source
                </LiveSourceTitle>
            }
            confirmLabel="Add source"
            onConfirm={() => handleSave()}
            confirmLoading={isSaving}
            confirmDisabled={sourceId.isBlocked}
            cancelDisabled={isSaving}
        >
            <Stack gap="lg">
                <LiveSourceSetupCard connector={CONNECTOR} />
                <SettingsCard title="Authentication" titleOutside>
                    <SettingsRow
                        label="Project URL"
                        hint="In the project's Data API settings"
                    >
                        <TextInput
                            w={FIELD_WIDTH}
                            size="xs"
                            aria-label="Project URL"
                            placeholder="https://abcd.supabase.co"
                            data-autofocus
                            {...form.getInputProps('projectUrl')}
                        />
                    </SettingsRow>
                    <SettingsRow
                        label="Table"
                        hint="One table or view; add a source per table"
                    >
                        <TextInput
                            w={FIELD_WIDTH}
                            size="xs"
                            aria-label="Table"
                            placeholder="orders"
                            {...form.getInputProps('table')}
                        />
                    </SettingsRow>
                    <SettingsRow
                        label="Secret key"
                        hint="An sb_secret_ key or the service_role key; only GET calls are sent"
                    >
                        <PasswordInput
                            w={FIELD_WIDTH}
                            size="xs"
                            aria-label="Secret key"
                            {...form.getInputProps('secret')}
                        />
                    </SettingsRow>
                    <LiveSourceTestRow
                        hint="Checks the details above, without saving"
                        test={testMutation}
                        onTest={handleTest}
                        inputs={[
                            form.values.projectUrl,
                            form.values.table,
                            form.values.secret,
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
