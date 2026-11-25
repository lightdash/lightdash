/**
 * Adds a Mixpanel live data source: the project's data region and ID, and
 * a service account's username and secret, laid out like the token dialog.
 */
import {
    ApiConnectorType,
    LIVE_INTEGRATION_CATALOG,
    type MixpanelRegion,
} from '@lightdash/common';
import {
    PasswordInput,
    SegmentedControl,
    Stack,
    TextInput,
} from '@mantine/core';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import { useCreateExternalConnection } from '../hooks/useCreateExternalConnection';
import { useNewSourceId } from '../hooks/useNewSourceId';
import { useTestConnectionConfig } from '../hooks/useTestConnectionConfig';
import { LiveSourceTitle } from './LiveSourceIcon';
import { SettingsCard, SettingsRow } from './LiveSourceSettingsRows';
import { LiveSourceSetupCard } from './LiveSourceSetupCard';
import { LiveSourceTestRow } from './LiveSourceTestRow';
import {
    getMixpanelTestRequest,
    toMixpanelCreatePayload,
    useMixpanelConnectionForm,
} from './mixpanelConnection';
import { NewLiveSourceDetails } from './NewLiveSourceDetails';

/** Matches the fields of the Details card below. */
const FIELD_WIDTH = 240;
const CONNECTOR = ApiConnectorType.MIXPANEL;

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    onCreated: (connectionUuid: string) => void;
};

export const MixpanelConnectionModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    onCreated,
}) => {
    const form = useMixpanelConnectionForm();
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
            config: toMixpanelCreatePayload(form.values),
            ...getMixpanelTestRequest(form.values.projectId),
        });
    };

    const handleSave = form.onSubmit(async (values) => {
        if (sourceId.isBlocked) return;
        const created = await createMutation.mutateAsync({
            projectUuid,
            data: {
                ...toMixpanelCreatePayload(values),
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
                <SettingsCard title="Authentication">
                    <SettingsRow
                        label="Data region"
                        hint="Where the project's data lives"
                    >
                        <SegmentedControl
                            size="xs"
                            w={FIELD_WIDTH}
                            data={[
                                { value: 'us', label: 'US' },
                                { value: 'eu', label: 'EU' },
                                { value: 'in', label: 'India' },
                            ]}
                            value={form.values.region}
                            onChange={(value) =>
                                form.setFieldValue(
                                    'region',
                                    value as MixpanelRegion,
                                )
                            }
                        />
                    </SettingsRow>
                    <SettingsRow
                        label="Project ID"
                        hint="The number after /project/ in the project URL"
                    >
                        <TextInput
                            w={FIELD_WIDTH}
                            size="xs"
                            aria-label="Project ID"
                            data-autofocus
                            {...form.getInputProps('projectId')}
                        />
                    </SettingsRow>
                    <SettingsRow
                        label="Service account"
                        hint="Username of a service account with access to the project"
                    >
                        <TextInput
                            w={FIELD_WIDTH}
                            size="xs"
                            aria-label="Service account username"
                            {...form.getInputProps('username')}
                        />
                    </SettingsRow>
                    <SettingsRow
                        label="Secret"
                        hint="Shown once, when Mixpanel creates the service account"
                    >
                        <PasswordInput
                            w={FIELD_WIDTH}
                            size="xs"
                            aria-label="Service account secret"
                            {...form.getInputProps('secret')}
                        />
                    </SettingsRow>
                    <LiveSourceTestRow
                        hint="Checks the details above, without saving"
                        test={testMutation}
                        onTest={handleTest}
                        inputs={[
                            form.values.region,
                            form.values.projectId,
                            form.values.username,
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
