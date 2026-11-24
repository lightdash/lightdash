/**
 * Adds an Amplitude live data source: the project's data region and its
 * API key and secret key, laid out like the token dialog.
 */
import {
    ApiConnectorType,
    LIVE_INTEGRATION_CATALOG,
    type AmplitudeRegion,
} from '@lightdash/common';
import { Button, PasswordInput, SegmentedControl, Stack } from '@mantine/core';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import { useCreateExternalConnection } from '../hooks/useCreateExternalConnection';
import { useNewSourceId } from '../hooks/useNewSourceId';
import { useTestConnectionConfig } from '../hooks/useTestConnectionConfig';
import {
    AMPLITUDE_TEST_REQUEST,
    toAmplitudeCreatePayload,
    useAmplitudeConnectionForm,
} from './amplitudeConnection';
import { LiveSourceTitle } from './LiveSourceIcon';
import {
    SettingsCard,
    SettingsRow,
    TestOutcome,
} from './LiveSourceSettingsRows';
import { LiveSourceSetupCard } from './LiveSourceSetupCard';
import { NewLiveSourceDetails } from './NewLiveSourceDetails';

/** Matches the fields of the Details card below. */
const FIELD_WIDTH = 240;
const CONNECTOR = ApiConnectorType.AMPLITUDE;

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    onCreated: (connectionUuid: string) => void;
};

export const AmplitudeConnectionModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    onCreated,
}) => {
    const form = useAmplitudeConnectionForm();
    const createMutation = useCreateExternalConnection();
    const testMutation = useTestConnectionConfig();
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
            config: toAmplitudeCreatePayload(form.values),
            ...AMPLITUDE_TEST_REQUEST,
        });
    };

    const handleSave = form.onSubmit(async (values) => {
        if (sourceId.isBlocked) return;
        const created = await createMutation.mutateAsync({
            projectUuid,
            data: {
                ...toAmplitudeCreatePayload(values),
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
                        label="Data region"
                        hint="Where the project's data lives"
                    >
                        <SegmentedControl
                            size="xs"
                            w={FIELD_WIDTH}
                            data={[
                                { value: 'us', label: 'US' },
                                { value: 'eu', label: 'EU' },
                            ]}
                            value={form.values.region}
                            onChange={(value) =>
                                form.setFieldValue(
                                    'region',
                                    value as AmplitudeRegion,
                                )
                            }
                        />
                    </SettingsRow>
                    <SettingsRow
                        label="API key"
                        hint="From the project's settings"
                    >
                        <PasswordInput
                            w={FIELD_WIDTH}
                            size="xs"
                            aria-label="API key"
                            data-autofocus
                            {...form.getInputProps('apiKey')}
                        />
                    </SettingsRow>
                    <SettingsRow
                        label="Secret key"
                        hint={
                            testMutation.data ? (
                                <TestOutcome response={testMutation.data} />
                            ) : (
                                'Shown once, when Amplitude creates it'
                            )
                        }
                    >
                        <PasswordInput
                            w={FIELD_WIDTH}
                            size="xs"
                            aria-label="Secret key"
                            {...form.getInputProps('secretKey')}
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

                <NewLiveSourceDetails
                    nameProps={form.getInputProps('name')}
                    sourceId={sourceId}
                />
            </Stack>
        </MantineModal>
    );
};
