import {
    ApiConnectorType,
    LIVE_INTEGRATION_CATALOG,
    type SalesforceEnvironment,
} from '@lightdash/common';
import { Stack, Switch } from '@mantine/core';
import { useForm } from '@mantine/form';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import { LiveSourceTitle } from './LiveSourceIcon';
import { SettingsCard, SettingsRow } from './LiveSourceSettingsRows';
import { NewLiveSourceDetails } from './NewLiveSourceDetails';
import { getSalesforceSignInUrl } from './salesforceConnection';

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
};

/** Adds a Salesforce source, which signs in to Salesforce to finish. */
export const SalesforceConnectionModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
}) => {
    const form = useForm<{ name: string; environment: SalesforceEnvironment }>({
        initialValues: {
            name: LIVE_INTEGRATION_CATALOG[ApiConnectorType.SALESFORCE]
                .defaultName,
            environment: 'production',
        },
        validate: {
            name: (value) =>
                value.trim().length === 0 ? 'Give it a name' : null,
        },
    });

    const handleSave = form.onSubmit((values) => {
        window.location.assign(
            getSalesforceSignInUrl(projectUuid, values, null, 'settings'),
        );
    });

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            size="xl"
            title={
                <LiveSourceTitle connector={ApiConnectorType.SALESFORCE}>
                    Add Salesforce source
                </LiveSourceTitle>
            }
            confirmLabel="Continue to Salesforce"
            onConfirm={() => handleSave()}
        >
            <Stack gap="lg">
                <SettingsCard title="Access">
                    <SettingsRow
                        label="Use a sandbox"
                        hint="Production by default"
                    >
                        <Switch
                            size="sm"
                            aria-label="Use a sandbox"
                            checked={form.values.environment === 'sandbox'}
                            onChange={(event) =>
                                form.setFieldValue(
                                    'environment',
                                    event.currentTarget.checked
                                        ? 'sandbox'
                                        : 'production',
                                )
                            }
                        />
                    </SettingsRow>
                </SettingsCard>
                <NewLiveSourceDetails nameProps={form.getInputProps('name')} />
            </Stack>
        </MantineModal>
    );
};
