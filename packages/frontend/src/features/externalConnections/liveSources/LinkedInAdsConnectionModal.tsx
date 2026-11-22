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
import { LiveSourceTitle } from './LiveSourceIcon';

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
                value.trim().length === 0 ? 'Give it a name' : null,
            adAccountId: (value) =>
                LINKEDIN_AD_ACCOUNT_ID.test(value.trim())
                    ? null
                    : 'Use the numbers only, as shown in Campaign Manager',
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
            title={
                <LiveSourceTitle connector={ApiConnectorType.LINKEDIN_ADS}>
                    {connection
                        ? 'Edit LinkedIn Ads source'
                        : 'Add LinkedIn Ads'}
                </LiveSourceTitle>
            }
            confirmLabel={connection ? 'Save' : 'Continue to LinkedIn'}
            onConfirm={() => handleSave()}
            confirmLoading={updateMutation.isLoading}
            cancelDisabled={updateMutation.isLoading}
        >
            <Stack gap="sm">
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
                        description="Shown at the top of the account in Campaign Manager"
                        {...form.getInputProps('adAccountId')}
                    />
                )}
            </Stack>
        </MantineModal>
    );
};
