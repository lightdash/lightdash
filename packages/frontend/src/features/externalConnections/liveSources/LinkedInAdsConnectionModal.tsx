import { ApiConnectorType, type ExternalConnection } from '@lightdash/common';
import { Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import { useUpdateExternalConnection } from '../hooks/useUpdateExternalConnection';
import {
    getLinkedInAdsSignInUrl,
    LINKEDIN_AD_ACCOUNT_ID,
} from './linkedInAdsConnection';

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    connection: ExternalConnection | null;
};

export const LinkedInAdsConnectionModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    connection,
}) => {
    const savedAccountId =
        connection?.apiSource?.connector === ApiConnectorType.LINKEDIN_ADS
            ? connection.apiSource.adAccountId
            : '';
    const form = useForm({
        initialValues: {
            name: connection?.name ?? 'LinkedIn Ads',
            adAccountId: savedAccountId,
        },
        validate: {
            name: (value) =>
                value.trim().length === 0 ? 'Name is required' : null,
            adAccountId: (value) =>
                LINKEDIN_AD_ACCOUNT_ID.test(value.trim())
                    ? null
                    : 'Enter the numeric account ID from Campaign Manager',
        },
    });
    const updateMutation = useUpdateExternalConnection();

    const signIn = (connectionUuid: string | null) => {
        if (form.validate().hasErrors) return;
        window.location.assign(
            getLinkedInAdsSignInUrl(
                projectUuid,
                form.values,
                connectionUuid,
                'settings',
            ),
        );
    };

    const handleSave = form.onSubmit(async ({ name }) => {
        if (!connection) {
            signIn(null);
            return;
        }
        await updateMutation.mutateAsync({
            projectUuid,
            connectionUuid: connection.externalConnectionUuid,
            data: { name: name.trim() },
        });
        onClose();
    });

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={connection ? 'Edit LinkedIn Ads source' : 'Add LinkedIn Ads'}
            confirmLabel={connection ? 'Save' : 'Continue to LinkedIn'}
            onConfirm={() => handleSave()}
            confirmLoading={updateMutation.isLoading}
            cancelDisabled={updateMutation.isLoading}
        >
            <Stack gap="sm">
                <Text c="dimmed" fz="sm">
                    AI agents read spend, clicks, leads and conversions for one
                    Campaign Manager ad account. This doesn't include organic
                    Company Page analytics.
                </Text>
                <TextInput
                    required
                    label="Name"
                    data-autofocus
                    {...form.getInputProps('name')}
                />
                {connection ? (
                    <Group justify="space-between" wrap="nowrap">
                        <Text fz="sm" c="dimmed" truncate>
                            Reads ad account {savedAccountId}
                        </Text>
                        <Button
                            size="xs"
                            variant="default"
                            onClick={() =>
                                signIn(connection.externalConnectionUuid)
                            }
                        >
                            Reconnect to LinkedIn
                        </Button>
                    </Group>
                ) : (
                    <TextInput
                        required
                        label="Ad account ID"
                        description="The number at the top of the account in Campaign Manager. Sign in with a member who has a role on it."
                        {...form.getInputProps('adAccountId')}
                    />
                )}
            </Stack>
        </MantineModal>
    );
};
