import { ApiConnectorType, LIVE_INTEGRATION_CATALOG } from '@lightdash/common';
import { Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import { useNewSourceId } from '../hooks/useNewSourceId';
import {
    getLinkedInAdsSignInUrl,
    LINKEDIN_AD_ACCOUNT_FIELD,
    LINKEDIN_AD_ACCOUNT_ID,
} from './linkedInAdsConnection';
import { LiveSourceTitle } from './LiveSourceIcon';
import { SettingsCard, SettingsRow } from './LiveSourceSettingsRows';
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
        initialValues: {
            name: LIVE_INTEGRATION_CATALOG[ApiConnectorType.LINKEDIN_ADS]
                .defaultName,
            adAccountId: '',
        },
        validate: {
            name: (value) =>
                value.trim().length === 0 ? 'Give it a name' : null,
            adAccountId: (value) =>
                LINKEDIN_AD_ACCOUNT_ID.test(value.trim())
                    ? null
                    : LINKEDIN_AD_ACCOUNT_FIELD.invalidMessage,
        },
    });

    const sourceId = useNewSourceId({
        projectUuid,
        connector: ApiConnectorType.LINKEDIN_ADS,
        name: form.values.name,
        enabled: opened,
    });

    const handleSave = form.onSubmit((values) => {
        if (sourceId.isBlocked) return;
        window.location.assign(
            getLinkedInAdsSignInUrl(
                projectUuid,
                { ...values, explorePrefix: sourceId.value },
                null,
                'settings',
            ),
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
            confirmDisabled={sourceId.isBlocked}
        >
            <Stack gap="lg">
                <SettingsCard title="Access">
                    <SettingsRow
                        label={LINKEDIN_AD_ACCOUNT_FIELD.label}
                        hint={LINKEDIN_AD_ACCOUNT_FIELD.description}
                    >
                        <TextInput
                            w={FIELD_WIDTH}
                            size="xs"
                            aria-label={LINKEDIN_AD_ACCOUNT_FIELD.label}
                            placeholder={LINKEDIN_AD_ACCOUNT_FIELD.placeholder}
                            data-autofocus
                            {...form.getInputProps('adAccountId')}
                        />
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
