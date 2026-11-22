import { ApiConnectorType } from '@lightdash/common';
import { Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import {
    getLinkedInAdsSignInUrl,
    LINKEDIN_AD_ACCOUNT_ID,
} from './linkedInAdsConnection';
import { LiveSourceTitle } from './LiveSourceIcon';
import { SettingsCard, SettingsRow } from './LiveSourceSettingsRows';
import { LiveSourceSetupCard } from './LiveSourceSetupCard';
import { NewLiveSourceDetails } from './NewLiveSourceDetails';

/** Matches the fields of the Details card below. */
const FIELD_WIDTH = 240;

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
};

/** Adds a LinkedIn Ads source, which signs in to LinkedIn to finish. */
export const LinkedInAdsConnectionModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
}) => {
    const form = useForm({
        initialValues: { name: 'LinkedIn Ads', adAccountId: '' },
        validate: {
            name: (value) =>
                value.trim().length === 0 ? 'Give it a name' : null,
            adAccountId: (value) =>
                LINKEDIN_AD_ACCOUNT_ID.test(value.trim())
                    ? null
                    : 'Use the numbers only, as shown in Campaign Manager',
        },
    });

    const handleSave = form.onSubmit((values) => {
        window.location.assign(
            getLinkedInAdsSignInUrl(projectUuid, values, null, 'settings'),
        );
    });

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            size="xl"
            title={
                <LiveSourceTitle connector={ApiConnectorType.LINKEDIN_ADS}>
                    Add LinkedIn Ads source
                </LiveSourceTitle>
            }
            confirmLabel="Continue to LinkedIn"
            onConfirm={() => handleSave()}
        >
            <Stack gap="lg">
                <LiveSourceSetupCard
                    connector={ApiConnectorType.LINKEDIN_ADS}
                />
                <SettingsCard title="Access">
                    <SettingsRow
                        label="Ad account ID"
                        hint="From Campaign Manager"
                    >
                        <TextInput
                            w={FIELD_WIDTH}
                            size="xs"
                            aria-label="Ad account ID"
                            placeholder="1234567890"
                            data-autofocus
                            {...form.getInputProps('adAccountId')}
                        />
                    </SettingsRow>
                </SettingsCard>
                <NewLiveSourceDetails nameProps={form.getInputProps('name')} />
            </Stack>
        </MantineModal>
    );
};
