/**
 * Adds a Google Play live data source: the app's package name and the JSON
 * key of a service account invited in Play Console, laid out like the
 * token dialog.
 */
import { ApiConnectorType, LIVE_INTEGRATION_CATALOG } from '@lightdash/common';
import { FileInput, Stack, TextInput } from '@mantine/core';
import { useState, type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import { useCreateExternalConnection } from '../hooks/useCreateExternalConnection';
import { useNewSourceId } from '../hooks/useNewSourceId';
import { useTestConnectionConfig } from '../hooks/useTestConnectionConfig';
import {
    getGooglePlayTestRequest,
    parseGooglePlayKeyFile,
    toGooglePlayCreatePayload,
    useGooglePlayConnectionForm,
} from './googlePlayConnection';
import { LiveSourceTitle } from './LiveSourceIcon';
import { SettingsCard, SettingsRow } from './LiveSourceSettingsRows';
import { LiveSourceSetupCard } from './LiveSourceSetupCard';
import { LiveSourceTestRow } from './LiveSourceTestRow';
import { NewLiveSourceDetails } from './NewLiveSourceDetails';

/** Matches the fields of the Details card below. */
const FIELD_WIDTH = 240;
const CONNECTOR = ApiConnectorType.GOOGLE_PLAY;

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    onCreated: (connectionUuid: string) => void;
};

export const GooglePlayConnectionModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    onCreated,
}) => {
    const form = useGooglePlayConnectionForm();
    const createMutation = useCreateExternalConnection();
    const testMutation = useTestConnectionConfig({ showErrorToast: false });
    const [keyFile, setKeyFile] = useState<File | null>(null);
    const sourceId = useNewSourceId({
        projectUuid,
        connector: CONNECTOR,
        name: form.values.name,
        enabled: opened,
    });
    const isSaving = createMutation.isLoading;
    const serviceAccount = parseGooglePlayKeyFile(form.values.keyFile);

    const handleKeyFile = async (file: File | null) => {
        setKeyFile(file);
        form.setFieldValue('keyFile', file ? await file.text() : '');
    };

    const handleTest = () => {
        if (form.validate().hasErrors) return;
        testMutation.mutate({
            projectUuid,
            config: toGooglePlayCreatePayload(form.values),
            ...getGooglePlayTestRequest(form.values.packageName),
        });
    };

    const handleSave = form.onSubmit(async (values) => {
        if (sourceId.isBlocked) return;
        const created = await createMutation.mutateAsync({
            projectUuid,
            data: {
                ...toGooglePlayCreatePayload(values),
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
                <SettingsCard title="Access">
                    <SettingsRow
                        label="Package name"
                        hint="The app's ID in Play Console, such as com.example.app"
                    >
                        <TextInput
                            w={FIELD_WIDTH}
                            size="xs"
                            aria-label="Package name"
                            data-autofocus
                            {...form.getInputProps('packageName')}
                        />
                    </SettingsRow>
                    <SettingsRow
                        label="Service account key"
                        hint={
                            serviceAccount?.clientEmail ??
                            'A JSON key of a service account with read access in Play Console'
                        }
                    >
                        <FileInput
                            w={FIELD_WIDTH}
                            size="xs"
                            aria-label="Service account key"
                            accept="application/json,.json"
                            placeholder="Choose a .json file"
                            clearable
                            value={keyFile}
                            onChange={(file) => void handleKeyFile(file)}
                            error={form.errors.keyFile}
                        />
                    </SettingsRow>
                    <LiveSourceTestRow
                        hint="Checks the details above, without saving"
                        test={testMutation}
                        onTest={handleTest}
                        inputs={[form.values.packageName, form.values.keyFile]}
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
