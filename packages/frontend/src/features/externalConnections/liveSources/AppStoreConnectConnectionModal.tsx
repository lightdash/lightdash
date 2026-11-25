/**
 * Adds an App Store Connect live data source: the app's Apple ID and a team
 * API key (its issuer ID, key ID and .p8 file), laid out like the token dialog.
 */
import { ApiConnectorType, LIVE_INTEGRATION_CATALOG } from '@lightdash/common';
import { FileInput, Stack, TextInput } from '@mantine/core';
import { useRef, useState, type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import { useCreateExternalConnection } from '../hooks/useCreateExternalConnection';
import { useNewSourceId } from '../hooks/useNewSourceId';
import { useTestConnectionConfig } from '../hooks/useTestConnectionConfig';
import {
    getAppStoreConnectKeyIdFromFileName,
    getAppStoreConnectTestRequest,
    toAppStoreConnectCreatePayload,
    useAppStoreConnectConnectionForm,
} from './appStoreConnectConnection';
import { LiveSourceTitle } from './LiveSourceIcon';
import { SettingsCard, SettingsRow } from './LiveSourceSettingsRows';
import { LiveSourceSetupCard } from './LiveSourceSetupCard';
import { LiveSourceTestRow } from './LiveSourceTestRow';
import { NewLiveSourceDetails } from './NewLiveSourceDetails';

/** Matches the fields of the Details card below. */
const FIELD_WIDTH = 240;
const CONNECTOR = ApiConnectorType.APP_STORE_CONNECT;

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    onCreated: (connectionUuid: string) => void;
};

export const AppStoreConnectConnectionModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    onCreated,
}) => {
    const form = useAppStoreConnectConnectionForm();
    const createMutation = useCreateExternalConnection();
    const testMutation = useTestConnectionConfig({ showErrorToast: false });
    const sourceId = useNewSourceId({
        projectUuid,
        connector: CONNECTOR,
        name: form.values.name,
        enabled: opened,
    });
    const [keyFile, setKeyFile] = useState<File | null>(null);
    const latestKeyFile = useRef<File | null>(null);
    const isSaving = createMutation.isLoading;

    const handleKeyFile = async (file: File | null) => {
        latestKeyFile.current = file;
        setKeyFile(file);
        if (!file) {
            form.setFieldValue('privateKey', '');
            return;
        }
        const keyId = getAppStoreConnectKeyIdFromFileName(file.name);
        if (keyId && form.values.keyId.trim().length === 0) {
            form.setFieldValue('keyId', keyId);
        }
        const privateKey = await file.text();
        if (latestKeyFile.current === file) {
            form.setFieldValue('privateKey', privateKey);
        }
    };

    const handleTest = () => {
        if (form.validate().hasErrors) return;
        testMutation.mutate({
            projectUuid,
            config: toAppStoreConnectCreatePayload(form.values),
            ...getAppStoreConnectTestRequest(form.values.appId),
        });
    };

    const handleSave = form.onSubmit(async (values) => {
        if (sourceId.isBlocked) return;
        const created = await createMutation.mutateAsync({
            projectUuid,
            data: {
                ...toAppStoreConnectCreatePayload(values),
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
                        label="App ID"
                        hint="The app's Apple ID, the number in its App Store URL"
                    >
                        <TextInput
                            w={FIELD_WIDTH}
                            size="xs"
                            aria-label="App ID"
                            data-autofocus
                            {...form.getInputProps('appId')}
                        />
                    </SettingsRow>
                    <SettingsRow
                        label="Issuer ID"
                        hint="From Users and Access, Integrations, in App Store Connect"
                    >
                        <TextInput
                            w={FIELD_WIDTH}
                            size="xs"
                            aria-label="Issuer ID"
                            {...form.getInputProps('issuerId')}
                        />
                    </SettingsRow>
                    <SettingsRow
                        label="Key ID"
                        hint="The 10-character ID of the team API key"
                    >
                        <TextInput
                            w={FIELD_WIDTH}
                            size="xs"
                            aria-label="Key ID"
                            {...form.getInputProps('keyId')}
                        />
                    </SettingsRow>
                    <SettingsRow
                        label="Private key"
                        hint="The .p8 file Apple lets you download once"
                    >
                        <FileInput
                            w={FIELD_WIDTH}
                            size="xs"
                            aria-label="Private key"
                            placeholder="Choose a .p8 file"
                            accept=".p8"
                            clearable
                            value={keyFile}
                            onChange={(file) => void handleKeyFile(file)}
                            error={form.errors.privateKey}
                        />
                    </SettingsRow>
                    <LiveSourceTestRow
                        hint="Checks the details above, without saving"
                        test={testMutation}
                        onTest={handleTest}
                        inputs={[
                            form.values.appId,
                            form.values.issuerId,
                            form.values.keyId,
                            form.values.privateKey,
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
